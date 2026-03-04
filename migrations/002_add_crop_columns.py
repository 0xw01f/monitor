import asyncio
import aiosqlite
from config import DATABASE_PATH

async def run():
    async with aiosqlite.connect(str(DATABASE_PATH)) as db:
        try:
            await db.execute("ALTER TABLE targets ADD COLUMN crop_x INTEGER")
            await db.execute("ALTER TABLE targets ADD COLUMN crop_y INTEGER")
            await db.execute("ALTER TABLE targets ADD COLUMN crop_w INTEGER")
            await db.execute("ALTER TABLE targets ADD COLUMN crop_h INTEGER")
            await db.commit()
            print("Migrated successfully")
        except Exception as e:
            print("Error:", e)

if __name__ == "__main__":
    asyncio.run(run())
