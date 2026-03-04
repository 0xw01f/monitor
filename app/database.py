"""
Sentinelle OSINT — Database Layer (async SQLite)
"""
import aiosqlite

from .config import DATABASE_PATH


CREATE_TABLES_SQL = """
CREATE TABLE IF NOT EXISTS targets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    url TEXT NOT NULL UNIQUE,
    category TEXT DEFAULT 'general',
    css_selector TEXT,
    crop_x INTEGER,
    crop_y INTEGER,
    crop_w INTEGER,
    crop_h INTEGER,
    last_hash TEXT,
    last_check TEXT,
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    target_id INTEGER NOT NULL,
    hash TEXT NOT NULL,
    text_content TEXT,
    similarity_score REAL,
    screenshot_data BLOB,
    diff_data BLOB,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (target_id) REFERENCES targets(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    target_id INTEGER NOT NULL,
    snapshot_id INTEGER,
    alert_type TEXT NOT NULL,
    severity TEXT DEFAULT 'medium',
    details TEXT,
    is_read INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (target_id) REFERENCES targets(id) ON DELETE CASCADE,
    FOREIGN KEY (snapshot_id) REFERENCES snapshots(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
);
"""


async def get_db() -> aiosqlite.Connection:
    """Get an async database connection."""
    db = await aiosqlite.connect(str(DATABASE_PATH))
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA journal_mode=WAL")
    await db.execute("PRAGMA foreign_keys=ON")
    return db


async def init_db():
    """Initialize the database schema."""
    db = await get_db()
    try:
        await db.executescript(CREATE_TABLES_SQL)
        await db.commit()
        # Add blob columns to existing databases that used the old file-path schema
        for col, typ in [("screenshot_data", "BLOB"), ("diff_data", "BLOB")]:
            try:
                await db.execute(f"ALTER TABLE snapshots ADD COLUMN {col} {typ}")
                await db.commit()
            except Exception:
                pass  # Column already exists
    finally:
        await db.close()


# ── Target CRUD ──────────────────────────────────────────

async def get_all_targets(db: aiosqlite.Connection):
    cursor = await db.execute("SELECT * FROM targets ORDER BY created_at DESC")
    rows = await cursor.fetchall()
    return [dict(r) for r in rows]


async def get_target(db: aiosqlite.Connection, target_id: int):
    cursor = await db.execute("SELECT * FROM targets WHERE id = ?", (target_id,))
    row = await cursor.fetchone()
    return dict(row) if row else None


async def create_target(
    db: aiosqlite.Connection,
    name: str,
    url: str,
    category: str = "general",
    css_selector: str = None,
    crop_x: int = None,
    crop_y: int = None,
    crop_w: int = None,
    crop_h: int = None,
):
    cursor = await db.execute(
        "INSERT OR IGNORE INTO targets (name, url, category, css_selector, crop_x, crop_y, crop_w, crop_h) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (name, url, category, css_selector, crop_x, crop_y, crop_w, crop_h),
    )
    await db.commit()
    return cursor.lastrowid if cursor.lastrowid else None


async def delete_target(db: aiosqlite.Connection, target_id: int):
    await db.execute("DELETE FROM alerts WHERE target_id = ?", (target_id,))
    await db.execute("DELETE FROM snapshots WHERE target_id = ?", (target_id,))
    await db.execute("DELETE FROM targets WHERE id = ?", (target_id,))
    await db.commit()


async def set_target_status(db: aiosqlite.Connection, target_id: int, status: str):
    """Set the status of a target ('active' or 'paused')."""
    await db.execute("UPDATE targets SET status = ? WHERE id = ?", (status, target_id))
    await db.commit()


async def update_target_hash(db: aiosqlite.Connection, target_id: int, hash_val: str):
    await db.execute(
        "UPDATE targets SET last_hash = ?, last_check = datetime('now') WHERE id = ?",
        (hash_val, target_id),
    )
    await db.commit()


# ── Snapshot CRUD ────────────────────────────────────────

async def create_snapshot(
    db: aiosqlite.Connection,
    target_id: int,
    hash_val: str,
    screenshot_data: bytes,
    text_content: str = "",
    similarity_score: float = None,
    diff_data: bytes = None,
):
    cursor = await db.execute(
        """INSERT INTO snapshots
           (target_id, hash, text_content, similarity_score, screenshot_data, diff_data)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (target_id, hash_val, text_content, similarity_score, screenshot_data, diff_data),
    )
    await db.commit()
    return cursor.lastrowid


_SNAPSHOT_META_COLS = (
    "id, target_id, hash, text_content, similarity_score, created_at, "
    "(diff_data IS NOT NULL) as has_diff"
)


async def get_target_snapshots(db: aiosqlite.Connection, target_id: int, limit: int = 50):
    cursor = await db.execute(
        f"SELECT {_SNAPSHOT_META_COLS} FROM snapshots WHERE target_id = ? ORDER BY created_at DESC LIMIT ?",
        (target_id, limit),
    )
    rows = await cursor.fetchall()
    return [dict(r) for r in rows]


async def get_latest_snapshot(db: aiosqlite.Connection, target_id: int):
    """Returns metadata + screenshot_data for visual comparison. No diff_data."""
    cursor = await db.execute(
        f"SELECT {_SNAPSHOT_META_COLS}, screenshot_data FROM snapshots WHERE target_id = ? ORDER BY created_at DESC LIMIT 1",
        (target_id,),
    )
    row = await cursor.fetchone()
    return dict(row) if row else None


async def get_snapshot_screenshot(db: aiosqlite.Connection, snapshot_id: int) -> bytes | None:
    cursor = await db.execute("SELECT screenshot_data FROM snapshots WHERE id = ?", (snapshot_id,))
    row = await cursor.fetchone()
    return row[0] if row else None


async def get_snapshot_diff(db: aiosqlite.Connection, snapshot_id: int) -> bytes | None:
    cursor = await db.execute("SELECT diff_data FROM snapshots WHERE id = ?", (snapshot_id,))
    row = await cursor.fetchone()
    return row[0] if row else None


# ── Alert CRUD ───────────────────────────────────────────

async def create_alert(
    db: aiosqlite.Connection,
    target_id: int,
    snapshot_id: int,
    alert_type: str,
    severity: str = "medium",
    details: str = "",
):
    cursor = await db.execute(
        """INSERT INTO alerts
           (target_id, snapshot_id, alert_type, severity, details)
           VALUES (?, ?, ?, ?, ?)""",
        (target_id, snapshot_id, alert_type, severity, details),
    )
    await db.commit()
    return cursor.lastrowid


async def get_alerts(db: aiosqlite.Connection, limit: int = 100, unread_only: bool = False):
    query = """
        SELECT a.*, t.name as target_name, t.url as target_url,
               s.similarity_score
        FROM alerts a
        JOIN targets t ON a.target_id = t.id
        LEFT JOIN snapshots s ON a.snapshot_id = s.id
    """
    if unread_only:
        query += " WHERE a.is_read = 0"
    query += " ORDER BY a.created_at DESC LIMIT ?"
    cursor = await db.execute(query, (limit,))
    rows = await cursor.fetchall()
    return [dict(r) for r in rows]


async def get_alert(db: aiosqlite.Connection, alert_id: int):
    cursor = await db.execute(
        """
        SELECT a.*, t.name as target_name, t.url as target_url,
               s.similarity_score
        FROM alerts a
        JOIN targets t ON a.target_id = t.id
        LEFT JOIN snapshots s ON a.snapshot_id = s.id
        WHERE a.id = ?
        """,
        (alert_id,),
    )
    row = await cursor.fetchone()
    return dict(row) if row else None


async def get_snapshot(db: aiosqlite.Connection, snapshot_id: int):
    """Returns snapshot metadata only (no BLOBs)."""
    cursor = await db.execute(
        f"SELECT {_SNAPSHOT_META_COLS} FROM snapshots WHERE id = ?",
        (snapshot_id,),
    )
    row = await cursor.fetchone()
    return dict(row) if row else None


async def get_previous_snapshot(db: aiosqlite.Connection, target_id: int, before_created_at: str):
    """Return the snapshot immediately preceding the provided timestamp for a target."""
    cursor = await db.execute(
        f"""
        SELECT {_SNAPSHOT_META_COLS} FROM snapshots
        WHERE target_id = ? AND created_at < ?
        ORDER BY created_at DESC LIMIT 1
        """,
        (target_id, before_created_at),
    )
    row = await cursor.fetchone()
    return dict(row) if row else None


async def mark_alert_read(db: aiosqlite.Connection, alert_id: int):
    await db.execute("UPDATE alerts SET is_read = 1 WHERE id = ?", (alert_id,))
    await db.commit()


async def mark_all_alerts_read(db: aiosqlite.Connection):
    await db.execute("UPDATE alerts SET is_read = 1 WHERE is_read = 0")
    await db.commit()


async def clear_alerts(db: aiosqlite.Connection, unread_only: bool = False):
    if unread_only:
        await db.execute("DELETE FROM alerts WHERE is_read = 0")
    else:
        await db.execute("DELETE FROM alerts")
    await db.commit()


# ── Stats ────────────────────────────────────────────────

async def get_stats(db: aiosqlite.Connection):
    stats = {}
    cursor = await db.execute("SELECT COUNT(*) as c FROM targets")
    stats["total_targets"] = (await cursor.fetchone())["c"]

    cursor = await db.execute("SELECT COUNT(*) as c FROM targets WHERE status = 'active'")
    stats["active_targets"] = (await cursor.fetchone())["c"]

    cursor = await db.execute("SELECT COUNT(*) as c FROM snapshots")
    stats["total_snapshots"] = (await cursor.fetchone())["c"]

    cursor = await db.execute("SELECT COUNT(*) as c FROM alerts")
    stats["total_alerts"] = (await cursor.fetchone())["c"]

    cursor = await db.execute("SELECT COUNT(*) as c FROM alerts WHERE is_read = 0")
    stats["unread_alerts"] = (await cursor.fetchone())["c"]

    cursor = await db.execute(
        "SELECT COUNT(*) as c FROM alerts WHERE created_at >= datetime('now', '-24 hours')"
    )
    stats["alerts_24h"] = (await cursor.fetchone())["c"]

    cursor = await db.execute(
        "SELECT COUNT(*) as c FROM snapshots WHERE created_at >= datetime('now', '-24 hours')"
    )
    stats["scans_24h"] = (await cursor.fetchone())["c"]

    return stats


# ── Settings Helpers ─────────────────────────────────────

async def get_setting(db: aiosqlite.Connection, key: str) -> str | None:
    cursor = await db.execute("SELECT value FROM settings WHERE key = ?", (key,))
    row = await cursor.fetchone()
    if row:
        return row["value"] if isinstance(row, aiosqlite.Row) else row[0]
    return None


async def set_setting(db: aiosqlite.Connection, key: str, value: str):
    await db.execute(
        "INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, value),
    )
    await db.commit()
