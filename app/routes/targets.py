"""
Sentinelle OSINT — API Routes: Targets & Stats
"""
from fastapi import APIRouter, HTTPException, Query

from ..database import (
    get_db,
    get_all_targets,
    get_target,
    create_target,
    delete_target,
    set_target_status,
    get_target_snapshots,
    get_stats,
    get_setting,
)
from ..config import SCAN_INTERVAL_HOURS
from ..schemas import TargetCreate
from .. import state

router = APIRouter(prefix="/api", tags=["targets"])

AUTO_SCAN_SETTING_KEY = "next_scan_at"


@router.get("/targets")
async def list_targets():
    db = await get_db()
    try:
        return await get_all_targets(db)
    finally:
        await db.close()


@router.get("/targets/{target_id}")
async def get_single_target(target_id: int):
    db = await get_db()
    try:
        target = await get_target(db, target_id)
        if not target:
            raise HTTPException(status_code=404, detail="Target not found")
        return target
    finally:
        await db.close()


@router.get("/targets/{target_id}/history")
async def target_history(target_id: int, limit: int = Query(50, ge=1, le=200)):
    db = await get_db()
    try:
        target = await get_target(db, target_id)
        if not target:
            raise HTTPException(status_code=404, detail="Target not found")
        snapshots = await get_target_snapshots(db, target_id, limit)
        return {"target": target, "snapshots": snapshots}
    finally:
        await db.close()


@router.post("/targets")
async def create_new_target(body: TargetCreate):
    db = await get_db()
    try:
        target_id = await create_target(
            db, body.name, body.url, body.category, body.css_selector,
            body.crop_x, body.crop_y, body.crop_w, body.crop_h,
        )
        return {"id": target_id, "message": "Target created"}
    finally:
        await db.close()


@router.delete("/targets/{target_id}")
async def remove_target(target_id: int):
    db = await get_db()
    try:
        target = await get_target(db, target_id)
        if not target:
            raise HTTPException(status_code=404, detail="Target not found")
        await delete_target(db, target_id)
        return {"message": "Target deleted"}
    finally:
        await db.close()


@router.patch("/targets/{target_id}/pause")
async def pause_target(target_id: int):
    db = await get_db()
    try:
        if not await get_target(db, target_id):
            raise HTTPException(status_code=404, detail="Target not found")
        await set_target_status(db, target_id, "paused")
        return {"message": "Target paused"}
    finally:
        await db.close()


@router.patch("/targets/{target_id}/resume")
async def resume_target(target_id: int):
    db = await get_db()
    try:
        if not await get_target(db, target_id):
            raise HTTPException(status_code=404, detail="Target not found")
        await set_target_status(db, target_id, "active")
        return {"message": "Target resumed"}
    finally:
        await db.close()


@router.get("/stats")
async def stats():
    db = await get_db()
    try:
        data = await get_stats(db)
        data["scan_interval_hours"] = SCAN_INTERVAL_HOURS
        data["next_scan_at"] = await get_setting(db, AUTO_SCAN_SETTING_KEY) or state.next_scan_at
        return data
    finally:
        await db.close()
