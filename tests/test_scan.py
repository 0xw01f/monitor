import asyncio
from app.database import get_db, get_target, get_all_targets
from app.monitor import check_target
from playwright.async_api import async_playwright
import logging

logging.basicConfig(level=logging.INFO)

async def test():
    db = await get_db()
    targets = await get_all_targets(db)
    if not targets:
        print("No targets")
        await db.close()
        return
    t = targets[0]
    await db.close()
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        res = await check_target(t, browser)
        print("Result:", res)

if __name__ == "__main__":
    asyncio.run(test())
