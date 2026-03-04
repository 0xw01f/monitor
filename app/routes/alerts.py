"""
Sentinelle OSINT — API Routes: Alerts
"""
from fastapi import APIRouter, HTTPException, Query

from ..database import (
    get_db,
    get_alerts,
    get_alert,
    mark_alert_read,
    mark_all_alerts_read,
    clear_alerts,
    get_snapshot,
    get_previous_snapshot,
)

router = APIRouter(prefix="/api", tags=["alerts"])


@router.get("/alerts")
async def list_alerts(
    limit: int = Query(100, ge=1, le=500),
    unread_only: bool = Query(False),
):
    db = await get_db()
    try:
        return await get_alerts(db, limit, unread_only)
    finally:
        await db.close()


@router.delete("/alerts")
async def delete_alerts(unread_only: bool = Query(False)):
    db = await get_db()
    try:
        await clear_alerts(db, unread_only=unread_only)
        return {"message": "Alerts cleared"}
    finally:
        await db.close()


@router.patch("/alerts/{alert_id}/read")
async def read_alert(alert_id: int):
    db = await get_db()
    try:
        await mark_alert_read(db, alert_id)
        return {"message": "Alert marked as read"}
    finally:
        await db.close()


@router.patch("/alerts/read-all")
async def read_all_alerts():
    db = await get_db()
    try:
        await mark_all_alerts_read(db)
        return {"message": "All alerts marked as read"}
    finally:
        await db.close()


@router.get("/alerts/{alert_id}/context")
async def alert_context(alert_id: int):
    """Return alert, current snapshot, and previous snapshot for comparison."""
    db = await get_db()
    try:
        alert = await get_alert(db, alert_id)
        if not alert:
            raise HTTPException(status_code=404, detail="Alert not found")

        snapshot = None
        previous_snapshot = None

        if alert.get("snapshot_id"):
            snapshot = await get_snapshot(db, alert["snapshot_id"])
            if snapshot:
                previous_snapshot = await get_previous_snapshot(
                    db, alert["target_id"], snapshot["created_at"]
                )

        return {
            "alert": alert,
            "snapshot": snapshot,
            "previous_snapshot": previous_snapshot,
        }
    finally:
        await db.close()
