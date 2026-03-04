"""
Sentinelle OSINT — Core Monitoring Engine

Handles page capture, text hashing, visual comparison, and alert generation.
"""
import asyncio
import difflib
import hashlib
import json
import logging
import random
import re
from io import BytesIO
from datetime import datetime, timezone

from PIL import Image
import numpy as np

from .config import (
    AUTH_FILE,
    JITTER_MAX_SECONDS,
    JITTER_MIN_SECONDS,
    NOISE_PATTERNS,
    PAGE_LOAD_TIMEOUT_MS,
    SCREENSHOT_QUALITY,
    VIEWPORT_HEIGHT,
    VIEWPORT_WIDTH,
    VISUAL_TOLERANCE_PERCENT,
    HASH_CHANGE_ALERT_SEVERITY,
    VISUAL_CHANGE_ALERT_SEVERITY,
)
from .database import (
    create_alert,
    create_snapshot,
    get_db,
    get_all_targets,
    get_latest_snapshot,
    update_target_hash,
    get_target,
)
from .webhooks import dispatch_alert_notifications

logger = logging.getLogger("sentinelle.monitor")


# ── Text Processing ─────────────────────────────────────

def _chunk_tokens(tokens: list[str], size: int = 8) -> list[str]:
    if not tokens:
        return []
    return [" ".join(tokens[i : i + size]) for i in range(0, len(tokens), size)]


def build_text_change_details(previous_text: str, current_text: str, max_chunks: int = 8) -> str:
    previous_tokens = (previous_text or "").split()
    current_tokens = (current_text or "").split()
    matcher = difflib.SequenceMatcher(a=previous_tokens, b=current_tokens)

    removed_chunks: list[str] = []
    added_chunks: list[str] = []

    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            continue
        if tag in ("delete", "replace"):
            removed_chunks.extend(_chunk_tokens(previous_tokens[i1:i2]))
        if tag in ("insert", "replace"):
            added_chunks.extend(_chunk_tokens(current_tokens[j1:j2]))

    removed_chunks = [c for c in removed_chunks if c][:max_chunks]
    added_chunks = [c for c in added_chunks if c][:max_chunks]

    lines = ["Text diff detected"]
    if added_chunks:
        lines.append("Additions:")
        lines.extend([f"+ {chunk}" for chunk in added_chunks])
    if removed_chunks:
        lines.append("Removals:")
        lines.extend([f"- {chunk}" for chunk in removed_chunks])

    return "\n".join(lines)[:3000]


def clean_text(raw_text: str) -> str:
    """Remove dynamic noise from page text using configured regex patterns."""
    cleaned = raw_text
    for pattern in NOISE_PATTERNS:
        cleaned = re.sub(pattern, "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def compute_hash(text: str) -> str:
    """Generate MD5 hash of cleaned text."""
    return hashlib.md5(text.encode("utf-8")).hexdigest()


def to_webp(img_bytes: bytes) -> bytes:
    """Convert any image bytes (JPEG/PNG) to WebP for compact BLOB storage."""
    buf = BytesIO()
    Image.open(BytesIO(img_bytes)).save(buf, format="webp", quality=SCREENSHOT_QUALITY)
    return buf.getvalue()


# ── Visual Comparison ───────────────────────────────────

def compare_visual(img1_bytes: bytes, img2_bytes: bytes) -> tuple[float, bytes | None]:
    """
    Calculate visual similarity between two screenshots.
    Returns (change_percent, diff_webp_bytes_or_None).
    change_percent: 0% = identical, 100% = completely different.
    """
    try:
        img1 = Image.open(BytesIO(img1_bytes)).convert("RGB")
        img2 = Image.open(BytesIO(img2_bytes)).convert("RGB")

        target_size = (img2.width, img2.height)
        img1 = img1.resize(target_size, Image.Resampling.LANCZOS)

        arr1 = np.array(img1, dtype=np.float64)
        arr2 = np.array(img2, dtype=np.float64)

        mse = np.mean((arr1 - arr2) ** 2)
        change_percent = round((mse / (255.0**2)) * 100.0, 2)

        if change_percent <= 0:
            return 0.0, None

        # Build diff image with red overlay on changed pixels
        diff_sum = np.sum(np.abs(arr1 - arr2), axis=2)
        mask = diff_sum > 45

        img_diff = img2.convert("RGBA")
        diff_arr = np.array(img_diff)
        overlay = np.array([255, 0, 0, 120])
        diff_arr[mask] = (
            diff_arr[mask] * (255 - overlay[3]) / 255 + overlay * overlay[3] / 255
        ).astype(np.uint8)
        diff_arr[:, :, 3] = 255

        buf = BytesIO()
        Image.fromarray(diff_arr).save(buf, format="WEBP", quality=SCREENSHOT_QUALITY)
        return change_percent, buf.getvalue()

    except Exception as e:
        logger.error(f"Visual comparison failed: {e}")
        return -1.0, None


# ── Anti-Bot Measures ───────────────────────────────────

async def human_like_delay():
    """Introduce random jitter delay to mimic human behavior."""
    delay = random.uniform(JITTER_MIN_SECONDS, JITTER_MAX_SECONDS)
    await asyncio.sleep(delay)


async def simulate_mouse_movement(page):
    """Simulate random mouse movements on the page."""
    try:
        for _ in range(random.randint(2, 5)):
            x = random.randint(100, VIEWPORT_WIDTH - 100)
            y = random.randint(100, min(600, VIEWPORT_HEIGHT - 100))
            await page.mouse.move(x, y)
            await asyncio.sleep(random.uniform(0.1, 0.4))
    except Exception:
        pass


# ── Popup Handling ──────────────────────────────────────

async def close_popups(page):
    """Attempt to close common cookie banners and login modals before capturing."""
    selectors = [
        "button[aria-label='Close']",
        "button[aria-label='Fermer']",
        "button[title='Close']",
        "button:has-text('Accepter')",
        "button:has-text('Accept')",
        "button:has-text('Tout accepter')",
        "button:has-text('Refuser')",
        "button:has-text('Tout refuser')",
        "button:has-text('Reject all')",
        "[class*='close-button']",
        "[class*='cookie-b'] button",
        "div[role='dialog'] button:has-text('Accept')",
    ]
    for _ in range(2):
        closed_any = False
        for selector in selectors:
            try:
                elements = await page.locator(selector).all()
                for el in elements:
                    if await el.is_visible():
                        await el.click(timeout=1000)
                        await asyncio.sleep(0.5)
                        closed_any = True
            except Exception:
                pass
        if not closed_any:
            break


# ── Page Preview (for Visual Selection) ────────────────

async def preview_page(url: str, browser):
    """
    Load a page, close popups, capture viewport screenshot + element map.
    Returns (screenshot_bytes, element_list).
    """
    context = await browser.new_context(
        viewport={"width": VIEWPORT_WIDTH, "height": VIEWPORT_HEIGHT},
        user_agent=(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        ),
    )
    page = await context.new_page()

    try:
        await human_like_delay()
        await page.goto(url, wait_until="networkidle", timeout=PAGE_LOAD_TIMEOUT_MS)
        await simulate_mouse_movement(page)
        await human_like_delay()
        await close_popups(page)

        screenshot_bytes = await page.screenshot(type="png")

        js_extract = """
        () => {
            function getXPath(el) {
                if (el.id) return '//*[@id="' + el.id + '"]';
                if (el === document.body) return '//body';
                let ix = 0;
                const siblings = el.parentNode ? el.parentNode.childNodes : [];
                for (let i = 0; i < siblings.length; i++) {
                    const sibling = siblings[i];
                    if (sibling === el) {
                        const parentPath = el.parentNode ? getXPath(el.parentNode) : '';
                        const tag = el.tagName.toLowerCase();
                        return parentPath + '/' + tag + '[' + (ix + 1) + ']';
                    }
                    if (sibling.nodeType === 1 && sibling.tagName === el.tagName) ix++;
                }
                return '';
            }
            const results = [];
            const seen = new Set();
            const allEls = document.querySelectorAll('*');
            for (const el of allEls) {
                const tag = el.tagName.toLowerCase();
                if (['script', 'style', 'noscript', 'meta', 'link', 'br', 'hr'].includes(tag)) continue;
                const rect = el.getBoundingClientRect();
                if (rect.width < 10 || rect.height < 10) continue;
                if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
                if (rect.right < 0 || rect.left > window.innerWidth) continue;
                const key = Math.round(rect.x) + ',' + Math.round(rect.y) + ',' +
                            Math.round(rect.width) + ',' + Math.round(rect.height);
                if (seen.has(key)) continue;
                seen.add(key);
                const xpath = getXPath(el);
                if (!xpath) continue;
                let text = '';
                for (const node of el.childNodes) {
                    if (node.nodeType === 3 && node.textContent.trim()) {
                        text = node.textContent.trim().substring(0, 60);
                        break;
                    }
                }
                results.push({
                    xpath, tagName: tag,
                    className: el.className ? String(el.className).substring(0, 80) : '',
                    id: el.id || '', text,
                    rect: {
                        x: Math.round(rect.x), y: Math.round(rect.y),
                        width: Math.round(rect.width), height: Math.round(rect.height)
                    }
                });
            }
            return results;
        }
        """
        elements = await page.evaluate(js_extract)
        return screenshot_bytes, elements

    finally:
        await context.close()


# ── Page Capture ────────────────────────────────────────

async def capture_page(url: str, css_selector: str | None, crop_args: dict | None, browser):
    """
    Navigate to a URL using Playwright, capture screenshot and extract text.
    Returns (screenshot_bytes, raw_text) or raises on failure.
    """
    storage_state = None
    if AUTH_FILE.exists():
        try:
            auth_data = json.loads(AUTH_FILE.read_text())
            if auth_data.get("cookies"):
                storage_state = str(AUTH_FILE)
        except (json.JSONDecodeError, KeyError):
            pass

    context_kwargs = {
        "viewport": {"width": VIEWPORT_WIDTH, "height": VIEWPORT_HEIGHT},
        "user_agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        ),
    }
    if storage_state:
        context_kwargs["storage_state"] = storage_state

    context = await browser.new_context(**context_kwargs)
    page = await context.new_page()

    try:
        await human_like_delay()
        await page.goto(url, wait_until="networkidle", timeout=PAGE_LOAD_TIMEOUT_MS)
        await simulate_mouse_movement(page)
        await human_like_delay()
        await close_popups(page)

        # 1) Crop Coordinates Provided
        if crop_args and all(k in crop_args for k in ("x", "y", "width", "height")):
            try:
                screenshot_bytes = to_webp(
                    await page.screenshot(clip=crop_args, type="jpeg", quality=SCREENSHOT_QUALITY)
                )
                js_code = """
                (clip) => {
                    let text = [];
                    const elements = document.body.getElementsByTagName('*');
                    for (let el of elements) {
                        const rect = el.getBoundingClientRect();
                        const overlapX = Math.max(0, Math.min(rect.right, clip.x + clip.width) - Math.max(rect.left, clip.x));
                        const overlapY = Math.max(0, Math.min(rect.bottom, clip.y + clip.height) - Math.max(rect.top, clip.y));
                        if (overlapX > 0 && overlapY > 0) {
                            for (let node of el.childNodes) {
                                if (node.nodeType === 3 && node.textContent.trim()) {
                                    text.push(node.textContent.trim());
                                }
                            }
                        }
                    }
                    return text.join('\\n');
                }
                """
                raw_text = await page.evaluate(js_code, crop_args)
                return screenshot_bytes, raw_text
            except Exception as e:
                logger.warning(
                    f"Failed to capture crop region {crop_args}: {e}. Falling back to full page."
                )

        # 2) CSS/XPath Selector Provided
        elif css_selector:
            try:
                locator = page.locator(css_selector).first
                await locator.wait_for(timeout=5000)
                screenshot_bytes = to_webp(
                    await locator.screenshot(type="jpeg", quality=SCREENSHOT_QUALITY)
                )
                raw_text = await locator.inner_text()
                return screenshot_bytes, raw_text
            except Exception as e:
                logger.warning(
                    f"Failed to find or capture selector '{css_selector}': {e}. Falling back to full page."
                )

        # 3) Full-page fallback
        screenshot_bytes = to_webp(
            await page.screenshot(full_page=True, type="jpeg", quality=SCREENSHOT_QUALITY)
        )
        raw_text = await page.inner_text("body")
        return screenshot_bytes, raw_text

    finally:
        await context.close()


# ── Main Check Function ────────────────────────────────

async def check_target(target: dict, browser) -> dict:
    """
    Main monitoring function for a single target.
    Captures the page, compares with previous snapshot, generates alerts if needed.
    """
    target_id = target["id"]
    url = target["url"]
    result = {
        "target_id": target_id,
        "url": url,
        "status": "success",
        "hash_changed": False,
        "visual_change_pct": None,
        "alert_generated": False,
        "error": None,
    }

    try:
        logger.info(f"Capturing target {target_id}: {url}")
        crop_args = None
        if (
            target.get("crop_x") is not None
            and target.get("crop_y") is not None
            and target.get("crop_w")
            and target.get("crop_h")
        ):
            crop_args = {
                "x": target["crop_x"],
                "y": target["crop_y"],
                "width": target["crop_w"],
                "height": target["crop_h"],
            }

        screenshot_bytes, raw_text = await capture_page(
            url, target.get("css_selector"), crop_args, browser
        )

        cleaned_text = clean_text(raw_text)
        current_hash = compute_hash(cleaned_text)

        db = await get_db()
        try:
            target_check = await get_target(db, target_id)
            if not target_check:
                logger.warning(f"Target {target_id} was deleted during scan. Aborting check.")
                result["status"] = "aborted"
                return result

            previous = await get_latest_snapshot(db, target_id)
            similarity_score = None
            diff_bytes = None

            async def create_alert_and_notify(
                alert_type: str,
                severity: str,
                details: str,
                snapshot_id: int,
                visual_change: float | None,
            ):
                await create_alert(
                    db, target_id, snapshot_id,
                    alert_type=alert_type,
                    severity=severity,
                    details=details,
                )
                await dispatch_alert_notifications(
                    db=db,
                    target=target,
                    alert_type=alert_type,
                    severity=severity,
                    details=details,
                    snapshot_id=snapshot_id,
                    visual_change_pct=visual_change,
                )

            if previous:
                hash_changed = previous["hash"] != current_hash
                result["hash_changed"] = hash_changed

                visual_change = None
                if previous.get("screenshot_data"):
                    visual_change, diff_bytes = compare_visual(
                        previous["screenshot_data"], screenshot_bytes
                    )
                    result["visual_change_pct"] = visual_change
                    similarity_score = visual_change

                significant_visual = (
                    visual_change is not None and visual_change > VISUAL_TOLERANCE_PERCENT
                )

                if significant_visual and hash_changed:
                    text_delta = build_text_change_details(
                        previous.get("text_content", ""), cleaned_text
                    )
                    snapshot_id = await create_snapshot(
                        db, target_id, current_hash, screenshot_bytes,
                        cleaned_text, similarity_score, diff_bytes,
                    )
                    await create_alert_and_notify(
                        alert_type="visual_change",
                        severity=VISUAL_CHANGE_ALERT_SEVERITY,
                        details=f"Visual + text change: {visual_change}% visual diff\n{text_delta}",
                        snapshot_id=snapshot_id,
                        visual_change=visual_change,
                    )
                    result["alert_generated"] = True

                elif significant_visual:
                    snapshot_id = await create_snapshot(
                        db, target_id, current_hash, screenshot_bytes,
                        cleaned_text, similarity_score, diff_bytes,
                    )
                    await create_alert_and_notify(
                        alert_type="visual_change",
                        severity=VISUAL_CHANGE_ALERT_SEVERITY,
                        details=f"Visual change detected: {visual_change}% (text unchanged)",
                        snapshot_id=snapshot_id,
                        visual_change=visual_change,
                    )
                    result["alert_generated"] = True

                elif hash_changed:
                    text_delta = build_text_change_details(
                        previous.get("text_content", ""), cleaned_text
                    )
                    snapshot_id = await create_snapshot(
                        db, target_id, current_hash, screenshot_bytes,
                        cleaned_text,
                        similarity_score if similarity_score is not None else 0.0,
                        diff_bytes,
                    )
                    await create_alert_and_notify(
                        alert_type="hash_change",
                        severity=HASH_CHANGE_ALERT_SEVERITY,
                        details=(
                            f"Text hash changed (visual diff: {visual_change}%)\n{text_delta}"
                            if visual_change is not None
                            else f"Text hash changed\n{text_delta}"
                        ),
                        snapshot_id=snapshot_id,
                        visual_change=visual_change,
                    )
                    result["alert_generated"] = True

                else:
                    await create_snapshot(
                        db, target_id, current_hash, screenshot_bytes,
                        cleaned_text,
                        similarity_score if similarity_score is not None else 0.0,
                        diff_bytes,
                    )
            else:
                await create_snapshot(
                    db, target_id, current_hash, screenshot_bytes, cleaned_text,
                )

            await update_target_hash(db, target_id, current_hash)

        finally:
            await db.close()

    except Exception as e:
        logger.error(f"Error checking target {target_id} ({url}): {e}")
        result["status"] = "error"
        result["error"] = str(e)

    return result


# ── Batch Scan ──────────────────────────────────────────

async def run_scan(targets: list = None):
    """
    Run a monitoring scan on all or specified targets.
    Returns list of results.
    """
    from playwright.async_api import async_playwright

    if targets is None:
        db = await get_db()
        try:
            targets = await get_all_targets(db)
            targets = [t for t in targets if t["status"] == "active"]
        finally:
            await db.close()

    if not targets:
        logger.info("No active targets to scan.")
        return []

    results = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        try:
            for target in targets:
                result = await check_target(target, browser)
                results.append(result)
                logger.info(
                    f"[{'!' if result['alert_generated'] else '✓'}] "
                    f"{target['name']}: {result['status']}"
                )
        finally:
            await browser.close()

    return results
