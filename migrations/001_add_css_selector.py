import asyncio
import aiosqlite
from config import DATABASE_PATH

async def run():
    async with aiosqlite.connect(str(DATABASE_PATH)) as db:
        try:
            await db.execute("ALTER TABLE targets ADD COLUMN css_selector TEXT")
            await db.commit()
            print("Migrated successfully")
        except Exception as e:
            print("Error:", e)

if __name__ == "__main__":
    asyncio.run(run())
