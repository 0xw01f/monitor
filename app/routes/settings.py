"""
Sentinelle OSINT — API Routes: Settings & Integrations
"""
import asyncio
import json
import logging
import urllib.error
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from ..database import get_db, get_setting, set_setting
from ..schemas import IntegrationTestRequest
from ..webhooks import (
    validate_integration_endpoint,
    normalize_discord_endpoint,
    defang_url,
    http_error_detail,
    send_webhook,
)

logger = logging.getLogger("sentinelle.api")
router = APIRouter(prefix="/api", tags=["settings"])

DAILY_REPORT_ENABLED_KEY = "daily_report_enabled"
DAILY_REPORT_LAST_SENT_KEY = "daily_report_last_sent_utc"


# ── Integration CRUD ────────────────────────────────────

@router.get("/settings/integrations")
async def get_integrations():
    db = await get_db()
    try:
        val = await get_setting(db, "integrations")
        return json.loads(val) if val else {}
    finally:
        await db.close()


@router.post("/settings/integrations")
async def save_integrations(data: dict):
    db = await get_db()
    try:
        await set_setting(db, "integrations", json.dumps(data))
        return {"status": "ok"}
    finally:
        await db.close()


# ── Daily Report Settings ───────────────────────────────

@router.get("/settings/daily-report")
async def get_daily_report_settings():
    db = await get_db()
    try:
        enabled = (await get_setting(db, DAILY_REPORT_ENABLED_KEY) or "false").lower() == "true"
        last_sent = await get_setting(db, DAILY_REPORT_LAST_SENT_KEY)
        return {"enabled": enabled, "last_sent_utc": last_sent}
    finally:
        await db.close()


@router.post("/settings/daily-report")
async def set_daily_report_settings(data: dict):
    enabled = bool(data.get("enabled", False))
    db = await get_db()
    try:
        await set_setting(db, DAILY_REPORT_ENABLED_KEY, "true" if enabled else "false")
        if not enabled:
            await set_setting(db, DAILY_REPORT_LAST_SENT_KEY, "")
        return {"status": "ok", "enabled": enabled}
    finally:
        await db.close()


# ── Integration Test ────────────────────────────────────

@router.post("/settings/integrations/test")
async def test_integration(body: IntegrationTestRequest):
    db = await get_db()
    try:
        raw = await get_setting(db, "integrations")
    finally:
        await db.close()

    if not raw:
        raise HTTPException(status_code=404, detail="No integration configured")

    try:
        integrations = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="Invalid integrations configuration")

    if not isinstance(integrations, dict):
        raise HTTPException(status_code=500, detail="Invalid integrations format")

    state = integrations.get(body.integration_id)
    if not isinstance(state, dict):
        raise HTTPException(status_code=404, detail="Integration not found")

    endpoint = (state.get("endpoint") or "").strip()
    err = validate_integration_endpoint(body.integration_id, endpoint)
    if err:
        raise HTTPException(status_code=400, detail=err)
    endpoint = normalize_discord_endpoint(body.integration_id, endpoint)
    endpoint_defanged = defang_url(endpoint)

    timestamp = (
        datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )

    if body.integration_id == "slack":
        payload = {
            "text": f"[Sentinelle] Test connexion {body.integration_id} OK",
            "blocks": [
                {
                    "type": "header",
                    "text": {"type": "plain_text", "text": "✅ Sentinelle — Test de connexion", "emoji": True},
                },
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": (
                            f"*Integration:* {body.integration_id}\n"
                            f"*Status:* Success\n"
                            f"*UTC:* {timestamp}"
                        ),
                    },
                },
                {
                    "type": "section",
                    "text": {"type": "mrkdwn", "text": f"*Webhook (defang)*\n`{endpoint_defanged}`"},
                },
            ],
        }
    elif body.integration_id == "discord":
        payload = {
            "content": "✅ **Sentinelle — Test de connexion**",
            "embeds": [
                {
                    "title": "Webhook operational",
                    "description": "Webhook test message sent successfully from Sentinelle.",
                    "color": 5763719,
                    "fields": [
                        {"name": "Integration", "value": body.integration_id, "inline": True},
                        {"name": "Status", "value": "Success", "inline": True},
                        {"name": "UTC", "value": timestamp, "inline": False},
                        {"name": "Webhook (defang)", "value": f"`{endpoint_defanged}`", "inline": False},
                    ],
                    "timestamp": timestamp,
                    "footer": {"text": "Sentinelle OSINT"},
                }
            ],
        }
    else:
        payload = {
            "event": "sentinelle.integration_test",
            "summary": "Test de connexion webhook",
            "integration": body.integration_id,
            "status": "ok",
            "timestamp": timestamp,
            "endpoint_defanged": endpoint_defanged,
        }

    try:
        status = await send_webhook(endpoint, payload)
    except urllib.error.HTTPError as e:
        detail = http_error_detail(e)
        if e.code == 403:
            detail += " | Verify that the webhook URL is complete and active (not revoked)."
        raise HTTPException(status_code=502, detail=f"Webhook send failed: {detail}")
    except urllib.error.URLError as e:
        raise HTTPException(status_code=502, detail=f"Webhook send failed: {e}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Webhook error: {e}")

    if status >= 400:
        raise HTTPException(status_code=502, detail=f"Webhook responded with {status}")

    return {"status": "ok", "message": "Test sent"}
