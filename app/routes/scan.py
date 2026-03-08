"""
Sentinelle OSINT — API Routes: Scan & Preview
"""
import base64
import logging

from fastapi import APIRouter, HTTPException

from ..database import get_db, get_target
from ..schemas import ScanRequest, PreviewRequest
from ..monitor import run_in_playwright_loop, run_scan, preview_page
from .. import state

logger = logging.getLogger("sentinelle.api")
router = APIRouter(prefix="/api", tags=["scan"])


@router.post("/scan")
async def trigger_scan(body: ScanRequest = None):
    if state.scan_lock.locked():
        raise HTTPException(status_code=409, detail="A scan is already in progress")

    async with state.scan_lock:
        try:
            targets = None
            if body and body.target_id:
                db = await get_db()
                try:
                    target = await get_target(db, body.target_id)
                    if not target:
                        raise HTTPException(status_code=404, detail="Target not found")
                    targets = [target]
                finally:
                    await db.close()

            results = await run_scan(targets)
            return {
                "message": f"Scan completed for {len(results)} target(s)",
                "results": results,
            }
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Scan failed: {e}")
            raise HTTPException(status_code=500, detail=f"Scan failed: {str(e)}")


@router.post("/preview")
async def preview(body: PreviewRequest):
    """Load a URL with Playwright and return screenshot + element map for visual selection."""
    try:
        async def _preview_with_playwright():
            from playwright.async_api import async_playwright

            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                try:
                    return await preview_page(body.url, browser)
                finally:
                    await browser.close()

        screenshot_bytes, elements = await run_in_playwright_loop(_preview_with_playwright)

        screenshot_b64 = base64.b64encode(screenshot_bytes).decode("utf-8")
        return {
            "screenshot": screenshot_b64,
            "elements": elements,
            "viewport": {"width": 1280, "height": 800},
        }
    except Exception as e:
        logger.error(f"Preview failed: {e}")
        raise HTTPException(status_code=500, detail=f"Preview failed: {str(e)}")
