"""
Sentinelle OSINT — CSV Target Loader
Loads targets from a CSV file and upserts them into the database.
"""
import csv
import logging
from pathlib import Path

from .config import TARGETS_CSV
from .database import get_db, create_target

logger = logging.getLogger("sentinelle.csv_loader")


async def load_targets_from_csv(csv_path: str = None):
    """
    Load targets from a CSV file and insert them into the database.
    CSV format: name,url,category[,css_selector]

    Returns the number of targets added.
    """
    path = Path(csv_path) if csv_path else TARGETS_CSV

    if not path.exists():
        logger.warning(f"CSV file not found: {path}")
        return 0

    db = await get_db()
    count = 0
    try:
        with open(path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                name = row.get("name", "").strip()
                url = row.get("url", "").strip()
                category = row.get("category", "general").strip()
                css_selector = row.get("css_selector", "").strip() or None

                if not name or not url:
                    logger.warning(f"Skipping invalid row: {row}")
                    continue

                result = await create_target(db, name, url, category, css_selector)
                if result:
                    count += 1
                    logger.info(f"Added target: {name} ({url})")
                else:
                    logger.debug(f"Target already exists: {url}")
    except Exception as e:
        logger.error(f"Error loading CSV: {e}")
    finally:
        await db.close()

    logger.info(f"Loaded {count} new targets from {path}")
    return count
