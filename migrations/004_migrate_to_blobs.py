"""
Sentinelle OSINT — Migration: File-based snapshots → SQLite BLOBs

Reads existing snapshots whose screenshot_data is NULL, looks for matching
PNG files in the legacy data/ directory, converts them to WebP, and stores
them as BLOBs directly in the database.

Usage:
    python migrate_to_blobs.py [--dry-run] [--delete-files]

Options:
    --dry-run        Preview what would be migrated without making changes
    --delete-files   Delete the legacy data/ directory after successful migration
"""

import asyncio
import argparse
import sys
from io import BytesIO
from pathlib import Path

import aiosqlite
from PIL import Image

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DATABASE_PATH = BASE_DIR / "sentinelle.db"
WEBP_QUALITY = 90


def png_to_webp(png_bytes: bytes) -> bytes:
    """Convert PNG bytes to WebP bytes."""
    img = Image.open(BytesIO(png_bytes))
    buf = BytesIO()
    img.save(buf, format="webp", quality=WEBP_QUALITY)
    return buf.getvalue()


def timestamp_to_folder_name(ts: str) -> str:
    """
    Convert DB timestamp to legacy folder name format.
    '2026-03-04 10:14:49' or '2026-03-04T10:14:49' → '2026-03-04_10-14-49'
    """
    ts = ts.replace("T", " ").split(".")[0]
    date_part, time_part = ts.split(" ")
    time_clean = time_part.replace(":", "-")
    return f"{date_part}_{time_clean}"


async def run_migration(dry_run: bool = False, delete_files: bool = False):
    if not DATABASE_PATH.exists():
        print(f"[ERROR] Database not found: {DATABASE_PATH}")
        sys.exit(1)

    if not DATA_DIR.exists():
        print("[INFO] Legacy data/ directory does not exist — nothing to migrate.")
        return

    db = await aiosqlite.connect(str(DATABASE_PATH))
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA journal_mode=WAL")

    try:
        # Fetch all snapshots with missing BLOBs
        cursor = await db.execute(
            """SELECT id, target_id, created_at, text_content
               FROM snapshots
               WHERE screenshot_data IS NULL"""
        )
        rows = await cursor.fetchall()
        snapshots = [dict(r) for r in rows]

        print(f"[INFO] Found {len(snapshots)} snapshot(s) with missing screenshot_data.")
        if not snapshots:
            print("[INFO] Nothing to migrate.")
            return

        migrated = 0
        skipped = 0
        text_migrated = 0

        for snap in snapshots:
            snap_id = snap["id"]
            target_id = snap["target_id"]
            ts = snap["created_at"]

            folder_name = timestamp_to_folder_name(ts)
            snap_dir = DATA_DIR / str(target_id) / folder_name

            screenshot_png = snap_dir / "screenshot.png"
            diff_png = snap_dir / "diff.png"
            content_txt = snap_dir / "content.txt"

            # Try to get text_content from file if blank in DB
            text_content = snap.get("text_content")
            if not text_content and content_txt.exists():
                text_content = content_txt.read_text(encoding="utf-8").strip()

            if not screenshot_png.exists():
                print(f"  [SKIP] Snapshot {snap_id}: no screenshot.png in {snap_dir}")
                skipped += 1
                # Still update text_content if we found it in a file
                if text_content and not snap.get("text_content") and not dry_run:
                    await db.execute(
                        "UPDATE snapshots SET text_content = ? WHERE id = ?",
                        (text_content, snap_id),
                    )
                    text_migrated += 1
                continue

            screenshot_bytes = screenshot_png.read_bytes()
            diff_bytes = diff_png.read_bytes() if diff_png.exists() else None

            try:
                screenshot_webp = png_to_webp(screenshot_bytes)
                diff_webp = png_to_webp(diff_bytes) if diff_bytes else None
            except Exception as e:
                print(f"  [ERROR] Snapshot {snap_id}: failed to convert image — {e}")
                skipped += 1
                continue

            diff_info = f"+ diff ({len(diff_webp):,} bytes)" if diff_webp else ""
            print(
                f"  [{'DRY' if dry_run else 'OK'}] Snapshot {snap_id} "
                f"(target {target_id}, {folder_name}): "
                f"screenshot {len(screenshot_webp):,} bytes {diff_info}"
            )

            if not dry_run:
                await db.execute(
                    """UPDATE snapshots
                       SET screenshot_data = ?, diff_data = ?, text_content = ?
                       WHERE id = ?""",
                    (screenshot_webp, diff_webp, text_content or snap.get("text_content"), snap_id),
                )
                migrated += 1

        if not dry_run:
            await db.commit()

        print()
        print(f"[DONE] Migrated: {migrated}  |  Skipped: {skipped}  |  Text-only updates: {text_migrated}")

        if delete_files and not dry_run and migrated > 0:
            import shutil
            print(f"\n[INFO] Deleting legacy data/ directory: {DATA_DIR}")
            shutil.rmtree(DATA_DIR)
            print("[INFO] data/ directory deleted.")
        elif delete_files and dry_run:
            print("\n[INFO] --delete-files skipped in dry-run mode.")

    finally:
        await db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Migrate file-based snapshots to SQLite BLOBs")
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing")
    parser.add_argument("--delete-files", action="store_true", help="Remove legacy data/ folder after migration")
    args = parser.parse_args()

    asyncio.run(run_migration(dry_run=args.dry_run, delete_files=args.delete_files))
