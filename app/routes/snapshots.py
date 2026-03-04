"""
Sentinelle OSINT — API Routes: Snapshots (image serving)
"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from ..database import get_db, get_snapshot_screenshot, get_snapshot_diff

router = APIRouter(prefix="/api", tags=["snapshots"])


@router.get("/snapshots/{snapshot_id}/screenshot")
async def serve_screenshot(snapshot_id: int):
    db = await get_db()
    try:
        data = await get_snapshot_screenshot(db, snapshot_id)
        if data is None:
            raise HTTPException(status_code=404, detail="Screenshot not found")
        return Response(content=data, media_type="image/webp")
    finally:
        await db.close()


@router.get("/snapshots/{snapshot_id}/diff")
async def serve_diff(snapshot_id: int):
    db = await get_db()
    try:
        data = await get_snapshot_diff(db, snapshot_id)
        if data is None:
            raise HTTPException(status_code=404, detail="Diff not found")
        return Response(content=data, media_type="image/webp")
    finally:
        await db.close()
