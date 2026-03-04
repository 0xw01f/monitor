"""
Sentinelle OSINT — Webhook & Integration Helpers

Consolidated module for outbound notifications: URL validation / defanging,
webhook dispatch, alert notifications, and daily report delivery.
"""
import asyncio
import json
import logging
import re
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

from .database import get_db, get_setting, get_alerts, get_stats

logger = logging.getLogger("sentinelle.webhooks")

INTEGRATIONS_SETTING_KEY = "integrations"


# ── URL Helpers ──────────────────────────────────────────

def validate_integration_endpoint(integration_id: str, endpoint: str) -> str | None:
    """Return an error string if the endpoint is invalid, else None."""
    if not endpoint.startswith(("http://", "https://")):
        return "Invalid webhook URL (http/https required)."
    if integration_id == "slack":
        if not re.match(
            r"^https://hooks\.slack\.com/services/[A-Za-z0-9_\-]+/[A-Za-z0-9_\-]+/[A-Za-z0-9_\-]+$",
            endpoint,
        ):
            return "Invalid Slack webhook (expected format: https://hooks.slack.com/services/...)."
    elif integration_id == "discord":
        if not re.match(
            r"^https://(?:canary\.|ptb\.)?discord(?:app)?\.com/api(?:/v\d+)?/webhooks/\d+/[A-Za-z0-9_\-]+(?:\?.*)?$",
            endpoint,
        ):
            return "Invalid Discord webhook (expected format: https://discord.com/api/webhooks/<id>/<token>)."
    return None


def normalize_discord_endpoint(integration_id: str, endpoint: str) -> str:
    """Normalize canary / ptb Discord URLs to discord.com."""
    if integration_id != "discord":
        return endpoint
    parsed = urllib.parse.urlsplit(endpoint)
    host = (parsed.netloc or "").lower()
    if host in (
        "canary.discord.com",
        "ptb.discord.com",
        "canary.discordapp.com",
        "ptb.discordapp.com",
    ):
        return urllib.parse.urlunsplit(
            (parsed.scheme, "discord.com", parsed.path, parsed.query, parsed.fragment)
        )
    return endpoint


def defang_url(url: str) -> str:
    """Convert a URL to a defanged representation (hxxps://example[.]com)."""
    if not url:
        return ""
    try:
        parsed = urllib.parse.urlsplit(url)
        scheme = (
            "hxxps" if parsed.scheme == "https"
            else "hxxp" if parsed.scheme == "http"
            else parsed.scheme
        )
        netloc = (parsed.netloc or "").replace(".", "[.]")
        return urllib.parse.urlunsplit(
            (scheme, netloc, parsed.path or "", parsed.query or "", parsed.fragment or "")
        )
    except Exception:
        value = url.replace("https://", "hxxps://").replace("http://", "hxxp://")
        return value.replace(".", "[.]")


def http_error_detail(error: urllib.error.HTTPError) -> str:
    body = ""
    try:
        raw = error.read()
        body = raw.decode("utf-8", errors="ignore").strip()
    except Exception:
        body = ""
    if body:
        return f"HTTP {error.code} {error.reason} — {body[:280]}"
    return f"HTTP {error.code} {error.reason}"


def alert_type_label(alert_type: str) -> str:
    labels = {
        "visual_change": "Visual change",
        "hash_change": "Text change",
        "error": "Error",
    }
    return labels.get(alert_type, alert_type)


def safe_details(details: str, max_len: int = 140) -> str:
    """Truncate detail text for webhook payloads."""
    text = (details or "").replace("\n", " ").strip()
    return (text[:max_len] + "…") if len(text) > max_len else text


# ── Low-Level Webhook Posting ────────────────────────────

async def send_webhook(endpoint: str, payload: dict) -> int:
    """POST JSON to a webhook endpoint. Returns the HTTP status code; raises on error."""

    def _send() -> int:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            endpoint,
            data=data,
            headers={
                "Content-Type": "application/json",
                "User-Agent": "Sentinelle-OSINT/1.0",
                "Accept": "application/json,text/plain,*/*",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=12) as response:
            return int(response.status)

    return await asyncio.to_thread(_send)


async def post_webhook(endpoint: str, payload: dict, integration_id: str):
    """Fire-and-forget: POST JSON, log errors but never raise."""
    try:
        status = await send_webhook(endpoint, payload)
        if status >= 400:
            logger.warning(f"Webhook {integration_id} responded with status {status} ({endpoint})")
    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read().decode("utf-8", errors="ignore").strip()
        except Exception:
            pass
        detail = f"{body[:280]}" if body else e.reason
        logger.error(f"Webhook {integration_id} HTTP {e.code} ({endpoint}): {detail}")
    except urllib.error.URLError as e:
        logger.error(f"Webhook {integration_id} network error ({endpoint}): {e}")
    except Exception as e:
        logger.error(f"Webhook {integration_id} dispatch failed ({endpoint}): {e}")


# ── Integration Helpers ──────────────────────────────────

async def load_integrations() -> dict:
    """Load integrations dict from the settings table."""
    db = await get_db()
    try:
        raw = await get_setting(db, INTEGRATIONS_SETTING_KEY)
    finally:
        await db.close()
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        return {}


# ── Alert Notification Dispatch ──────────────────────────

async def dispatch_alert_notifications(
    db,
    target: dict,
    alert_type: str,
    severity: str,
    details: str,
    snapshot_id: int,
    visual_change_pct: float | None,
):
    """Send alert notifications to all configured webhook integrations."""
    raw = await get_setting(db, INTEGRATIONS_SETTING_KEY)
    if not raw:
        return

    try:
        integrations = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("Invalid integrations JSON in settings table")
        return

    if not isinstance(integrations, dict):
        return

    alert_time = (
        datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )
    visual_value = f"{visual_change_pct:.2f}%" if isinstance(visual_change_pct, (int, float)) else "N/A"
    target_name = target.get("name", "Target")
    target_id = target.get("id")
    label = alert_type_label(alert_type)
    defanged_url = defang_url(target.get("url", ""))
    summary = f"{label} detected on {target_name}"

    plain_message = (
        f"🚨 Sentinelle Alert\n"
        f"Target: {target_name} (ID {target_id})\n"
        f"Type: {label}\n"
        f"Severity: {severity}\n"
        f"Visual difference: {visual_value}\n"
        f"Snapshot ID: {snapshot_id}\n"
        f"URL (defang): {defanged_url}\n"
        f"Details: {details}\n"
        f"UTC: {alert_time}"
    )

    base_payload = {
        "event": "sentinelle.alert",
        "summary": summary,
        "target": {
            "id": target_id,
            "name": target_name,
            "url_defanged": defanged_url,
        },
        "alert": {
            "type": alert_type,
            "type_label": label,
            "severity": severity,
            "details": details,
            "visual_change_pct": visual_value,
            "snapshot_id": snapshot_id,
            "created_at": alert_time,
        },
    }

    tasks = []
    for integration_id, state in integrations.items():
        if not isinstance(state, dict):
            continue
        endpoint = (state.get("endpoint") or "").strip()
        err = validate_integration_endpoint(integration_id, endpoint)
        if err:
            logger.warning(f"Skipping {integration_id} webhook ({endpoint}): {err}")
            continue
        endpoint = normalize_discord_endpoint(integration_id, endpoint)

        if integration_id == "slack":
            payload = {
                "text": plain_message,
                "blocks": [
                    {
                        "type": "header",
                        "text": {"type": "plain_text", "text": "🚨 Sentinelle Alert", "emoji": True},
                    },
                    {
                        "type": "section",
                        "text": {
                            "type": "mrkdwn",
                            "text": (
                                f"*{summary}*\n"
                                f"*Type:* {label}  |  *Severity:* {severity}\n"
                                f"*Visual difference:* {visual_value}  |  *Snapshot:* #{snapshot_id}"
                            ),
                        },
                    },
                    {
                        "type": "section",
                        "fields": [
                            {"type": "mrkdwn", "text": f"*Target*\n{target_name}"},
                            {"type": "mrkdwn", "text": f"*ID*\n{target_id}"},
                            {"type": "mrkdwn", "text": f"*URL (defang)*\n`{defanged_url}`"},
                            {"type": "mrkdwn", "text": f"*UTC*\n{alert_time}"},
                        ],
                    },
                    {
                        "type": "section",
                        "text": {"type": "mrkdwn", "text": f"*Details*\n{details}"},
                    },
                ],
            }
        elif integration_id == "discord":
            payload = {
                "content": "🚨 **Sentinelle Alert**",
                "embeds": [
                    {
                        "title": summary,
                        "description": details,
                        "color": 15158332,
                        "fields": [
                            {"name": "Target", "value": str(target_name), "inline": True},
                            {"name": "ID", "value": str(target_id), "inline": True},
                            {"name": "Severity", "value": str(severity), "inline": True},
                            {"name": "Type", "value": str(label), "inline": True},
                            {"name": "Visual difference", "value": str(visual_value), "inline": True},
                            {"name": "Snapshot", "value": f"#{snapshot_id}", "inline": True},
                            {"name": "URL (defang)", "value": f"`{defanged_url}`", "inline": False},
                        ],
                        "timestamp": alert_time,
                        "footer": {"text": "Sentinelle OSINT"},
                    }
                ],
            }
        else:
            payload = base_payload

        tasks.append(post_webhook(endpoint, payload, integration_id))

    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)


# ── Daily Report Dispatch ────────────────────────────────

async def dispatch_daily_report() -> None:
    """Build and send a summary report to all configured webhook integrations."""
    db = await get_db()
    try:
        stats = await get_stats(db)
        recent_alerts = await get_alerts(db, limit=8, unread_only=False)
    finally:
        await db.close()

    integrations = await load_integrations()
    if not integrations:
        return

    now_iso = (
        datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )
    title = "📊 Sentinelle Daily Report"
    summary = (
        f"Active targets: {stats.get('active_targets', 0)} | "
        f"Scans 24h: {stats.get('scans_24h', 0)} | "
        f"Alerts 24h: {stats.get('alerts_24h', 0)} | "
        f"Unread: {stats.get('unread_alerts', 0)}"
    )

    alert_lines = []
    for alert in recent_alerts:
        target_name = alert.get("target_name") or "Target"
        a_type = alert.get("alert_type") or "alert"
        sev = alert.get("severity") or "medium"
        defanged = defang_url(alert.get("target_url") or "")
        det = safe_details(alert.get("details") or "")
        alert_lines.append(f"- [{sev}] {target_name} / {a_type} / {defanged} / {det}")

    if not alert_lines:
        alert_lines = ["- No notable events in the last 24h"]

    plain_report = f"{title}\n{summary}\n\n" + "\n".join(alert_lines)

    for integration_id, state in integrations.items():
        if not isinstance(state, dict):
            continue
        endpoint = (state.get("endpoint") or "").strip()
        err = validate_integration_endpoint(integration_id, endpoint)
        if err:
            continue
        endpoint = normalize_discord_endpoint(integration_id, endpoint)

        if integration_id == "slack":
            payload = {
                "text": plain_report,
                "blocks": [
                    {"type": "header", "text": {"type": "plain_text", "text": title, "emoji": True}},
                    {"type": "section", "text": {"type": "mrkdwn", "text": summary}},
                    {"type": "section", "text": {"type": "mrkdwn", "text": "\n".join(alert_lines[:6])}},
                    {"type": "context", "elements": [{"type": "mrkdwn", "text": f"UTC: {now_iso}"}]},
                ],
            }
        elif integration_id == "discord":
            payload = {
                "content": title,
                "embeds": [
                    {
                        "title": "24h summary",
                        "description": summary,
                        "color": 3447003,
                        "fields": [
                            {
                                "name": "Recent events",
                                "value": "\n".join(alert_lines[:6])[:1024],
                                "inline": False,
                            }
                        ],
                        "timestamp": now_iso,
                        "footer": {"text": "Sentinelle OSINT"},
                    }
                ],
            }
        else:
            payload = {
                "event": "sentinelle.daily_report",
                "generated_at": now_iso,
                "summary": summary,
                "stats": stats,
                "recent_alerts": [
                    {
                        "target_name": a.get("target_name"),
                        "alert_type": a.get("alert_type"),
                        "severity": a.get("severity"),
                        "target_url_defanged": defang_url(a.get("target_url") or ""),
                        "details": safe_details(a.get("details") or ""),
                    }
                    for a in recent_alerts
                ],
            }

        try:
            await send_webhook(endpoint, payload)
        except Exception as e:
            logger.error(f"[DailyReport] Webhook {integration_id} failed: {e}")
