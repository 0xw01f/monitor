import asyncio
import aiosqlite
from config import DATABASE_PATH

async def migrate():
    print(f"Migrating database: {DATABASE_PATH}")
    db = await aiosqlite.connect(str(DATABASE_PATH))
    try:
        # Create new table without UNIQUE constraint on url
        await db.execute("""
        CREATE TABLE targets_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            url TEXT NOT NULL,
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
        )
        """)
        
        # Copy data
        await db.execute("""
        INSERT INTO targets_new SELECT * FROM targets
        """)
        
        # Drop old table
        await db.execute("DROP TABLE targets")
        
        # Rename new table
        await db.execute("ALTER TABLE targets_new RENAME TO targets")
        
        await db.commit()
        print("Migration complete!")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        await db.close()

if __name__ == "__main__":
    asyncio.run(migrate())
