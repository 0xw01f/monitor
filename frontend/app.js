/**
 * Sentinelle OSINT — Frontend SPA Application
 * Router, API client, and dynamic views
 */

// ── API Client ─────────────────────────────────

const API = {
    async get(url) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`API Error: ${res.status}`);
        return res.json();
    },
    async post(url, data = {}) {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || `API Error: ${res.status}`);
        }
        return res.json();
    },
    async patch(url) {
        const res = await fetch(url, { method: 'PATCH' });
        if (!res.ok) throw new Error(`API Error: ${res.status}`);
        return res.json();
    },
    async put(url, data = {}) {
        const res = await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || `API Error: ${res.status}`);
        }
        return res.json();
    },
    async delete(url) {
        const res = await fetch(url, { method: 'DELETE' });
        if (!res.ok) throw new Error(`API Error: ${res.status}`);
        return res.json();
    },
};

// ── Toast Notifications ────────────────────────

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${type === 'success' ? '#34d399' : type === 'error' ? '#f87171' : '#60a5fa'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            ${type === 'success' ? '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>'
            : type === 'error' ? '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>'
                : '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>'}
        </svg>
        <span>${message}</span>
    `;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('toast-exit');
        setTimeout(() => toast.remove(), 200);
    }, 4000);
}

function openActionModal({
    title,
    message = '',
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    confirmVariant = 'primary',
    inputLabel = '',
    inputPlaceholder = '',
    inputValue = '',
} = {}) {
    return new Promise((resolve) => {
        const overlay = document.getElementById('action-modal-overlay');
        const titleEl = document.getElementById('action-modal-title');
        const messageEl = document.getElementById('action-modal-message');
        const inputWrap = document.getElementById('action-modal-input-wrap');
        const inputLabelEl = document.getElementById('action-modal-input-label');
        const inputEl = document.getElementById('action-modal-input');
        const confirmBtn = document.getElementById('action-modal-confirm');
        const cancelBtn = document.getElementById('action-modal-cancel');
        const closeBtn = document.getElementById('action-modal-close');

        if (!overlay || !titleEl || !messageEl || !confirmBtn || !cancelBtn || !closeBtn || !inputWrap || !inputLabelEl || !inputEl) {
            resolve({ confirmed: false, value: '' });
            return;
        }

        titleEl.textContent = title || 'Confirmation';
        messageEl.textContent = message || '';
        cancelBtn.textContent = cancelLabel;
        confirmBtn.textContent = confirmLabel;
        confirmBtn.classList.remove('btn--primary', 'btn--danger');
        confirmBtn.classList.add(confirmVariant === 'danger' ? 'btn--danger' : 'btn--primary');

        const hasInput = Boolean(inputLabel);
        inputWrap.style.display = hasInput ? 'block' : 'none';
        inputLabelEl.textContent = inputLabel;
        inputEl.value = inputValue || '';
        inputEl.placeholder = inputPlaceholder || '';

        overlay.style.display = 'flex';

        const close = (confirmed) => {
            overlay.style.display = 'none';
            overlay.removeEventListener('click', onOverlayClick);
            closeBtn.removeEventListener('click', onCancel);
            cancelBtn.removeEventListener('click', onCancel);
            confirmBtn.removeEventListener('click', onConfirm);
            document.removeEventListener('keydown', onKeyDown);
            resolve({ confirmed, value: inputEl.value.trim() });
        };

        const onCancel = () => close(false);
        const onConfirm = () => close(true);
        const onOverlayClick = (e) => {
            if (e.target === overlay) close(false);
        };
        const onKeyDown = (e) => {
            if (e.key === 'Escape') close(false);
            if (e.key === 'Enter') {
                e.preventDefault();
                close(true);
            }
        };

        overlay.addEventListener('click', onOverlayClick);
        closeBtn.addEventListener('click', onCancel);
        cancelBtn.addEventListener('click', onCancel);
        confirmBtn.addEventListener('click', onConfirm);
        document.addEventListener('keydown', onKeyDown);

        if (hasInput) inputEl.focus();
        else confirmBtn.focus();
    });
}

async function askConfirm(options) {
    const result = await openActionModal(options);
    return result.confirmed;
}

async function askInput(options) {
    const result = await openActionModal(options);
    if (!result.confirmed) return null;
    return result.value;
}

// ── Full Image Viewer ──────────────────────────
const viewerState = {
    beforeUrl: '',
    afterUrl: '',
    diffUrl: '',
    textBefore: '',
    textAfter: '',
    similarity: null,
    title: 'Snapshot Viewer',
    subtitle: '',
};
let _countdownTimer = null;

function computeTextDiff(before, after) {
    const beforeWords = (before || '').split(/\s+/).filter(Boolean);
    const afterWords = (after || '').split(/\s+/).filter(Boolean);

    const afterSet = new Set(afterWords);
    const beforeSet = new Set(beforeWords);

    const beforeHtml = beforeWords.map(w => {
        const safe = escapeHtml(w);
        return afterSet.has(w) ? safe : `<em>${safe}</em>`;
    }).join(' ');

    const afterHtml = afterWords.map(w => {
        const safe = escapeHtml(w);
        return beforeSet.has(w) ? safe : `<em>${safe}</em>`;
    }).join(' ');

    return { beforeHtml, afterHtml };
}

function renderViewerTexts(beforeText, afterText, hasBeforeImage) {
    const beforeEl = document.getElementById('viewer-text-before');
    const afterEl = document.getElementById('viewer-text-after');
    if (!beforeEl || !afterEl) return;

    if (!beforeText && !afterText) {
        beforeEl.textContent = hasBeforeImage ? 'No text available' : 'No previous snapshot';
        afterEl.textContent = 'No text available';
        return;
    }

    if (beforeText) {
        const { beforeHtml, afterHtml } = computeTextDiff(beforeText, afterText || '');
        beforeEl.innerHTML = beforeHtml || 'No text available';
        afterEl.innerHTML = afterHtml || 'No text available';
    } else {
        beforeEl.textContent = 'No previous snapshot';
        afterEl.textContent = afterText && afterText.trim() ? afterText.trim() : 'No text available';
    }
}

function updateViewerSlider(value) {
    const afterImg = document.getElementById('viewer-after-img');
    const divider = document.getElementById('viewer-divider');
    if (!afterImg || !divider) return;
    const val = Math.min(100, Math.max(0, Number(value) || 0));
    afterImg.style.clipPath = `inset(0 0 0 ${val}%)`;
    divider.style.left = `${val}%`;
}

const imageZoomState = {
    overlay: null,
    stage: null,
    image: null,
    scale: 1,
    translateX: 0,
    translateY: 0,
    dragging: false,
    dragStartX: 0,
    dragStartY: 0,
};

function applyImageZoomTransform() {
    if (!imageZoomState.image) return;
    imageZoomState.image.style.transform = `translate(${imageZoomState.translateX}px, ${imageZoomState.translateY}px) scale(${imageZoomState.scale})`;
}

function resetImageZoomTransform() {
    imageZoomState.scale = 1;
    imageZoomState.translateX = 0;
    imageZoomState.translateY = 0;
    applyImageZoomTransform();
}

function closeImageZoom() {
    if (!imageZoomState.overlay) return;
    imageZoomState.overlay.style.display = 'none';
    imageZoomState.dragging = false;
    imageZoomState.stage?.classList.remove('is-dragging');
}

function isImageZoomOpen() {
    return imageZoomState.overlay?.style.display === 'flex';
}

function openImageZoom(src, alt = 'Snapshot image') {
    if (!src || !imageZoomState.overlay || !imageZoomState.image) return;
    imageZoomState.image.src = src;
    imageZoomState.image.alt = alt;
    resetImageZoomTransform();
    imageZoomState.overlay.style.display = 'flex';
}

function setupImageZoom() {
    if (document.getElementById('image-zoom-overlay')) {
        imageZoomState.overlay = document.getElementById('image-zoom-overlay');
        imageZoomState.stage = document.getElementById('image-zoom-stage');
        imageZoomState.image = document.getElementById('image-zoom-img');
        return;
    }

    const overlay = document.createElement('div');
    overlay.id = 'image-zoom-overlay';
    overlay.className = 'image-zoom-overlay';
    overlay.innerHTML = `
        <div class="image-zoom-stage" id="image-zoom-stage">
            <img id="image-zoom-img" class="image-zoom-img" alt="Zoomed snapshot" draggable="false">
        </div>
        <button type="button" class="image-zoom-close" id="image-zoom-close" aria-label="Close zoom">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
        </button>
        <div class="image-zoom-hint">Wheel to zoom • Drag to pan • Esc to close</div>
    `;
    document.body.appendChild(overlay);

    imageZoomState.overlay = overlay;
    imageZoomState.stage = overlay.querySelector('#image-zoom-stage');
    imageZoomState.image = overlay.querySelector('#image-zoom-img');

    overlay.querySelector('#image-zoom-close')?.addEventListener('click', closeImageZoom);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeImageZoom();
    });

    document.addEventListener('keydown', (e) => {
        if (!isImageZoomOpen()) return;
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopImmediatePropagation();
            closeImageZoom();
            return;
        }
        if (e.key === '0') {
            e.preventDefault();
            resetImageZoomTransform();
        }
    });

    imageZoomState.stage?.addEventListener('wheel', (e) => {
        e.preventDefault();
        const direction = e.deltaY < 0 ? 1.18 : 1 / 1.18;
        imageZoomState.scale = Math.min(8, Math.max(1, imageZoomState.scale * direction));
        if (imageZoomState.scale === 1) {
            imageZoomState.translateX = 0;
            imageZoomState.translateY = 0;
        }
        applyImageZoomTransform();
    }, { passive: false });

    imageZoomState.stage?.addEventListener('mousedown', (e) => {
        if (imageZoomState.scale <= 1) return;
        imageZoomState.dragging = true;
        imageZoomState.dragStartX = e.clientX - imageZoomState.translateX;
        imageZoomState.dragStartY = e.clientY - imageZoomState.translateY;
        imageZoomState.stage.classList.add('is-dragging');
    });

    window.addEventListener('mousemove', (e) => {
        if (!imageZoomState.dragging) return;
        imageZoomState.translateX = e.clientX - imageZoomState.dragStartX;
        imageZoomState.translateY = e.clientY - imageZoomState.dragStartY;
        applyImageZoomTransform();
    });

    window.addEventListener('mouseup', () => {
        if (!imageZoomState.dragging) return;
        imageZoomState.dragging = false;
        imageZoomState.stage?.classList.remove('is-dragging');
    });

    document.addEventListener('click', (e) => {
        const img = e.target.closest('.diff-preview img, .comparison-panel img');
        if (!img) return;
        if (img.closest('#preview-overlay')) return;
        e.stopPropagation();
        openImageZoom(img.currentSrc || img.src, img.alt || 'Snapshot image');
    });
}

window.openImageViewer = function (beforeUrl, afterUrl, diffUrl = '', options = {}) {
    const overlay = document.getElementById('image-viewer-overlay');
    const titleEl = document.getElementById('image-viewer-title');
    const metaEl = document.getElementById('image-viewer-meta');
    const beforeImg = document.getElementById('viewer-before-img');
    const afterImg = document.getElementById('viewer-after-img');
    const diffImg = document.getElementById('viewer-diff-img');
    const diffWrapper = document.getElementById('viewer-diff-wrapper');
    const diffToggle = document.getElementById('viewer-toggle-diff');
    const scoreEl = document.getElementById('viewer-visual-score');
    const slider = document.getElementById('viewer-slider');
    const divider = document.getElementById('viewer-divider');

    viewerState.beforeUrl = beforeUrl || afterUrl || '';
    viewerState.afterUrl = afterUrl || beforeUrl || '';
    viewerState.diffUrl = diffUrl || '';
    viewerState.textBefore = options.textBefore || '';
    viewerState.textAfter = options.textAfter || '';
    viewerState.similarity = options.similarity ?? null;
    viewerState.title = options.title || 'Snapshot Viewer';
    viewerState.subtitle = options.subtitle || '';

    if (titleEl) titleEl.textContent = viewerState.title;
    if (metaEl) metaEl.textContent = viewerState.subtitle || 'Before / After comparison';

    if (beforeImg) beforeImg.src = viewerState.beforeUrl || viewerState.afterUrl || '';
    if (afterImg) afterImg.src = viewerState.afterUrl || viewerState.beforeUrl || '';

    // Reset slider
    if (slider) slider.disabled = false;
    if (divider) divider.style.display = 'block';
    
    // Default to 50%
    if (slider) slider.value = 50;
    updateViewerSlider(50);

    // Hide slider if only one image available
    if (!viewerState.beforeUrl || !viewerState.afterUrl) {
        if (slider) slider.disabled = true;
        if (divider) divider.style.display = 'none';
        if (afterImg) afterImg.style.clipPath = 'inset(0 0 0 0)';
    }

    renderViewerTexts(viewerState.textBefore, viewerState.textAfter, Boolean(viewerState.beforeUrl));

    if (scoreEl) {
        const scoreVal = Number(viewerState.similarity);
        scoreEl.textContent = Number.isFinite(scoreVal)
            ? `Visual change: ${scoreVal.toFixed(2)}%`
            : 'Visual change: N/A';
    }

    if (viewerState.diffUrl && diffImg && diffWrapper && diffToggle) {
        diffImg.src = viewerState.diffUrl;
        diffWrapper.style.display = 'none';
        diffToggle.style.display = 'inline-flex';
        diffToggle.textContent = 'Show diff overlay';
    } else if (diffWrapper && diffToggle) {
        diffWrapper.style.display = 'none';
        diffToggle.style.display = 'none';
    }

    overlay.style.display = 'flex';
};

async function openAlertViewer(alertId) {
    try {
        const data = await API.get(`/api/alerts/${alertId}/context`);
        const { alert, snapshot, previous_snapshot } = data;

        const afterUrl = snapshotImgUrl(snapshot?.id);
        const beforeUrl = snapshotImgUrl(previous_snapshot?.id);
        const diffUrl = snapshot?.has_diff ? snapshotDiffUrl(snapshot.id) : '';

        openImageViewer(beforeUrl, afterUrl, diffUrl, {
            title: alert?.target_name ? `Alert — ${alert.target_name}` : 'Alert',
            subtitle: snapshot?.created_at ? `Snapshot from ${formatDate(snapshot.created_at)}` : '',
            textBefore: previous_snapshot?.text_content || '',
            textAfter: snapshot?.text_content || '',
            similarity: snapshot?.similarity_score,
        });
    } catch (err) {
        showToast('Unable to load snapshot', 'error');
        console.error(err);
    }
}

function setupImageViewer() {
    const overlay = document.getElementById('image-viewer-overlay');
    const closeBtn = document.getElementById('image-viewer-close');
    const slider = document.getElementById('viewer-slider');
    const zoomBtn = document.getElementById('viewer-zoom-current');
    const viewerStage = document.getElementById('viewer-stage');
    const beforeImg = document.getElementById('viewer-before-img');
    const afterImg = document.getElementById('viewer-after-img');
    const diffImg = document.getElementById('viewer-diff-img');

    function closeModal() {
        overlay.style.display = 'none';
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeModal();
        });
    }

    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal();
        });
    }

    document.addEventListener('keydown', (e) => {
        if (isImageZoomOpen()) return;
        if (e.key === 'Escape' && overlay && overlay.style.display === 'flex') {
            closeModal();
        }
    });

    // Slider: use pointer events for reliable cross-browser dragging
    if (slider) {
        slider.addEventListener('input', (e) => {
            updateViewerSlider(e.target.value);
        });
    }

    const currentViewerSrc = () => {
        const beforeSrc = beforeImg?.currentSrc || beforeImg?.src || '';
        const afterSrc = afterImg?.currentSrc || afterImg?.src || '';
        if (!beforeSrc) return afterSrc;
        if (!afterSrc) return beforeSrc;
        const split = Number(slider?.value || 50);
        return split < 50 ? beforeSrc : afterSrc;
    };

    if (zoomBtn) {
        zoomBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openImageZoom(currentViewerSrc(), 'Snapshot comparison');
        });
    }

    if (viewerStage) {
        viewerStage.addEventListener('dblclick', (e) => {
            const beforeSrc = beforeImg?.currentSrc || beforeImg?.src || '';
            const afterSrc = afterImg?.currentSrc || afterImg?.src || '';
            if (!beforeSrc && !afterSrc) return;

            let src = afterSrc || beforeSrc;
            if (beforeSrc && afterSrc) {
                const rect = viewerStage.getBoundingClientRect();
                const pct = ((e.clientX - rect.left) / rect.width) * 100;
                const split = Number(slider?.value || 50);
                src = pct < split ? beforeSrc : afterSrc;
            }
            openImageZoom(src, 'Snapshot comparison');
        });
    }

    if (diffImg) {
        diffImg.addEventListener('click', (e) => {
            e.stopPropagation();
            openImageZoom(diffImg.currentSrc || diffImg.src, diffImg.alt || 'Diff image');
        });
    }

    // Diff toggle
    const diffToggleBtn = document.getElementById('viewer-toggle-diff');
    if (diffToggleBtn) {
        diffToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const wrapper = document.getElementById('viewer-diff-wrapper');
            if (!wrapper) return;
            const isHidden = wrapper.style.display === 'none';
            wrapper.style.display = isHidden ? 'block' : 'none';
            diffToggleBtn.textContent = isHidden ? 'Hide diff overlay' : 'Show diff overlay';
        });
    }
}

// ── Helpers ─────────────────────────────────────

function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr + 'Z');
    return d.toLocaleDateString('en-GB', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

function timeAgo(dateStr) {
    if (!dateStr) return 'Never';
    const now = new Date();
    const d = new Date(dateStr + 'Z');
    const diff = Math.floor((now - d) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function snapshotImgUrl(id) {
    return id ? `/api/snapshots/${id}/screenshot` : '';
}

function snapshotDiffUrl(id) {
    return id ? `/api/snapshots/${id}/diff` : '';
}

function startNextScanCountdown(nextScanAtIso, intervalHours) {
    if (_countdownTimer) { clearInterval(_countdownTimer); _countdownTimer = null; }
    const el = document.getElementById('next-scan-countdown');
    if (!el) return;
    const safeInterval = intervalHours || 6;
    if (!nextScanAtIso) {
        el.textContent = `every ${safeInterval}h`;
        return;
    }
    function updateCountdown() {
        const diff = Math.max(0, Math.floor((new Date(nextScanAtIso) - new Date()) / 1000));
        if (diff === 0) { el.textContent = 'running…'; return; }
        const h = Math.floor(diff / 3600);
        const m = Math.floor((diff % 3600) / 60);
        const s = diff % 60;
        const parts = [];
        if (h > 0) parts.push(`${h}h`);
        if (m > 0 || h > 0) parts.push(`${m}m`);
        parts.push(`${s}s`);
        el.textContent = `in ${parts.join(' ')}`;
    }
    updateCountdown();
    _countdownTimer = setInterval(updateCountdown, 1000);
}

const CATEGORY_LABELS = {
    social_media: 'Social Media',
    forum: 'Forum',
    news: 'News',
    marketplace: 'Marketplace',
    reference: 'Reference',
    general: 'General',
    test: 'Test',
};

const INTEGRATIONS = [
    {
        id: 'slack',
        name: 'Slack',
        description: 'Automatically receive alerts in a Slack channel via an incoming webhook.',
        doc: 'https://api.slack.com/messaging/webhooks',
        placeholder: 'https://hooks.slack.com/services/...',
        icon: slackIcon(),
    },
    {
        id: 'discord',
        name: 'Discord',
        description: 'Broadcast detected changes to a Discord channel using a webhook.',
        doc: 'https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks',
        placeholder: 'https://discord.com/api/webhooks/...',
        icon: discordIcon(),
    },
    {
        id: 'webhook',
        name: 'Webhook HTTP',
        description: 'Trigger your own automation through a JSON POST request.',
        doc: 'https://developer.mozilla.org/docs/Web/HTTP/Methods/POST',
        placeholder: 'https://example.com/webhook',
        icon: webhookIcon(),
    },
];

async function loadIntegrationState() {
    try {
        const res = await fetch('/api/settings/integrations');
        return await res.json() || {};
    } catch {
        return {};
    }
}

async function saveIntegrationState(state) {
    const res = await fetch('/api/settings/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state)
    });
    if (!res.ok) {
        throw new Error(`API Error: ${res.status}`);
    }
}

function findIntegration(integrationId) {
    return INTEGRATIONS.find((i) => i.id === integrationId);
}

// ── Router ─────────────────────────────────────

const ROUTES = {
    '/': renderDashboard,
    '/targets': renderTargets,
    '/alerts': renderAlerts,
    '/connections': renderConnections,
};

async function router() {
    if (_countdownTimer) { clearInterval(_countdownTimer); _countdownTimer = null; }
    const hash = window.location.hash.slice(1) || '/';
    const main = document.getElementById('main-content');

    // Target detail route
    if (hash.startsWith('/targets/')) {
        const id = parseInt(hash.split('/')[2]);
        if (!isNaN(id)) {
            updateNav('targets');
            main.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
            await renderTargetDetail(id);
            return;
        }
    }

    const render = ROUTES[hash];
    if (render) {
        updateNav(hash === '/' ? 'dashboard' : hash.slice(1));
        main.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
        await render();
    } else {
        main.innerHTML = '<div class="empty-state"><h2>404 — Page not found</h2></div>';
    }
}

function updateNav(page) {
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.toggle('active', link.dataset.page === page);
    });
}

// ── Dashboard View ──────────────────────────────

async function renderDashboard() {
    const main = document.getElementById('main-content');
    try {
        const [stats, alerts, targets] = await Promise.all([
            API.get('/api/stats'),
            API.get('/api/alerts?limit=5'),
            API.get('/api/targets'),
        ]);

        main.innerHTML = `
            <div class="page-header">
                <div class="page-header__left">
                    <h1>Dashboard</h1>
                    <p>OSINT monitoring overview</p>
                </div>
                <button class="btn btn--scan" id="btn-scan-all" title="Run full scan">
                    <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
                        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                    </svg>
                    Scan all
                </button>
            </div>

            <div class="stats-grid">
                ${statCard('violet', targetIcon(), stats.total_targets, 'Total targets')}
                ${statCard('cyan', scanIcon(), stats.scans_24h, 'Scans (24h)')}
                ${statCard('warning', alertIcon(), stats.unread_alerts, 'Unread alerts')}
                ${statCard('success', checkIcon(), stats.total_snapshots, 'Snapshots')}
            </div>

            <div class="next-scan-banner">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                <span>Next automatic scan <strong id="next-scan-countdown"></strong></span>
            </div>

            <div class="section">
                <div class="section__header">
                    <h2 class="section__title">Recent alerts</h2>
                    <a href="#/alerts" class="btn btn--ghost btn--sm">View all</a>
                </div>
                ${alerts.length > 0
                ? `<div class="alerts-list">${alerts.map(a => alertItemHtml(a)).join('')}</div>`
                : emptyState('No alerts', 'Alerts will appear here when changes are detected.')
            }
            </div>

            <div class="section">
                <div class="section__header">
                    <h2 class="section__title">Monitored targets</h2>
                    <a href="#/targets" class="btn btn--ghost btn--sm">Manage</a>
                </div>
                ${targets.length > 0
                ? `<div class="targets-grid">${targets.slice(0, 6).map(t => targetCardHtml(t)).join('')}</div>`
                : emptyState('No targets', 'Add targets to start monitoring.')
            }
            </div>
        `;

        bindScanButton();
        bindTargetCards();
        bindAlertActions();
        startNextScanCountdown(stats.next_scan_at, stats.scan_interval_hours);
    } catch (err) {
        main.innerHTML = `<div class="empty-state"><h2>Loading error</h2><p>${escapeHtml(err.message)}</p></div>`;
    }
}

// ── Targets View ────────────────────────────────

async function renderTargets() {
    const main = document.getElementById('main-content');
    try {
        const targets = await API.get('/api/targets');
        main.innerHTML = `
            <div class="page-header">
                <div class="page-header__left">
                    <h1>Targets</h1>
                    <p>${targets.length} target(s) registered</p>
                </div>
                <div style="display:flex;gap:8px">
                    <button class="btn btn--scan" id="btn-scan-all">
                        <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                        Scan all
                    </button>
                    <button class="btn btn--primary" id="btn-add-target">
                        <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        Add
                    </button>
                </div>
            </div>

            ${targets.length > 0
                ? `<div class="targets-grid">${targets.map(t => targetCardHtml(t, true)).join('')}</div>`
                : emptyState('No configured targets', 'Click "Add" to create your first monitoring target.')
            }
        `;

        bindScanButton();
        bindTargetCards();
        document.getElementById('btn-add-target')?.addEventListener('click', openAddModal);
    } catch (err) {
        main.innerHTML = `<div class="empty-state"><h2>Error</h2><p>${escapeHtml(err.message)}</p></div>`;
    }
}

// ── Alerts View ─────────────────────────────────

async function renderAlerts() {
    const main = document.getElementById('main-content');
    try {
        const alerts = await API.get('/api/alerts?limit=200');
        main.innerHTML = `
            <div class="page-header">
                <div class="page-header__left">
                    <h1>Alerts</h1>
                    <p>${alerts.length} alert(s) recorded</p>
                </div>
                <div style="display:flex; gap:8px;">
                    <button class="btn btn--ghost btn--sm" id="btn-mark-all-read-alerts">Mark all as read</button>
                    <button class="btn btn--danger btn--sm" id="btn-clear-all-alerts">Clear all</button>
                </div>
            </div>

            <div class="filter-bar">
                <button class="filter-chip active" data-filter="all">All</button>
                <button class="filter-chip" data-filter="unread">Unread</button>
                <button class="filter-chip" data-filter="high">High severity</button>
                <button class="filter-chip" data-filter="visual_change">Visual</button>
                <button class="filter-chip" data-filter="hash_change">Textual</button>
            </div>

            ${alerts.length > 0
                ? `<div class="alerts-list" id="alerts-list">${alerts.map(a => alertItemHtml(a)).join('')}</div>`
                : emptyState('No alerts', 'Change alerts will appear here after scans.')
            }
        `;

        // Filter chips
        document.querySelectorAll('.filter-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                filterAlerts(chip.dataset.filter, alerts);
            });
        });

        document.getElementById('btn-clear-all-alerts')?.addEventListener('click', async () => {
            const confirmed = await askConfirm({
                title: 'Delete all alerts',
                message: 'All alerts will be permanently deleted.',
                confirmLabel: 'Delete',
                confirmVariant: 'danger',
            });
            if (!confirmed) return;
            try {
                await API.delete('/api/alerts');
                showToast('All alerts were deleted', 'success');
                await renderAlerts();
                updateAlertBadge();
            } catch (err) {
                showToast(err.message, 'error');
            }
        });

        document.getElementById('btn-mark-all-read-alerts')?.addEventListener('click', async () => {
            const confirmed = await askConfirm({
                title: 'Mark all as read',
                message: 'All unread alerts will be marked as read.',
                confirmLabel: 'Mark as read',
                confirmVariant: 'primary',
            });
            if (!confirmed) return;
            try {
                await API.patch('/api/alerts/read-all');
                showToast('All alerts marked as read', 'success');
                await renderAlerts();
                updateAlertBadge();
            } catch (err) {
                showToast(err.message, 'error');
            }
        });

        bindAlertActions();
    } catch (err) {
        main.innerHTML = `<div class="empty-state"><h2>Error</h2><p>${escapeHtml(err.message)}</p></div>`;
    }
}

async function renderConnections() {
    const main = document.getElementById('main-content');
    const [state, dailyReport] = await Promise.all([
        loadIntegrationState(),
        API.get('/api/settings/daily-report').catch(() => ({ enabled: false, last_sent_utc: null })),
    ]);
    main.innerHTML = `
        <div class="page-header">
            <div class="page-header__left">
                <h1>Connections</h1>
                <p>Connect Sentinelle to your tools (Discord, Slack, webhooks...)</p>
            </div>
        </div>

        <div class="connections-grid">
            ${INTEGRATIONS.map(integration => integrationCardHtml(integration, state[integration.id])).join('')}
        </div>
        
        <h3 style="margin-top: 32px; margin-bottom: 16px; font-size: 1.15rem; font-weight: 600;">Options</h3>
        <div class="card integration-card integration-settings-card">
            <div class="integration-card__header">
                <div class="integration-card__title-copy">
                    <h3>Daily report</h3>
                    <p>Sends a daily summary of alerts and stats to connected webhooks.</p>
                    <div style="margin-top: 12px;">
                        <span class="integration-status ${dailyReport.enabled ? 'integration-status--connected' : ''}">
                            ${dailyReport.enabled ? 'Active' : 'Inactive'}
                        </span>
                    </div>
                </div>
                <div class="integration-card__aside">
                    <div class="integration-card__icon integration-card__icon--corner">${clockIcon()}</div>
                </div>
            </div>
            <div class="integration-card__actions integration-settings-card__actions">
                <label class="integration-settings-card__toggle">
                    <input type="checkbox" id="daily-report-enabled" ${dailyReport.enabled ? 'checked' : ''}>
                    Enable daily report
                </label>
                <button class="btn btn--primary btn--sm" id="btn-save-daily-report">Save</button>
            </div>
            <div class="integration-card__connected integration-settings-card__meta">
                Last UTC send: ${dailyReport.last_sent_utc ? escapeHtml(dailyReport.last_sent_utc) : '—'}
            </div>
        </div>
    `;

    bindIntegrationActions();
    document.getElementById('btn-save-daily-report')?.addEventListener('click', async () => {
        const enabled = Boolean(document.getElementById('daily-report-enabled')?.checked);
        try {
            await API.post('/api/settings/daily-report', { enabled });
            showToast(`Daily report ${enabled ? 'enabled' : 'disabled'}`, 'success');
            await renderConnections();
        } catch (err) {
            showToast(err.message, 'error');
        }
    });
}

function filterAlerts(filter, alerts) {
    let filtered = alerts;
    if (filter === 'unread') filtered = alerts.filter(a => !a.is_read);
    else if (filter === 'high') filtered = alerts.filter(a => a.severity === 'high');
    else if (filter === 'visual_change') filtered = alerts.filter(a => a.alert_type === 'visual_change');
    else if (filter === 'hash_change') filtered = alerts.filter(a => a.alert_type === 'hash_change');

    const list = document.getElementById('alerts-list');
    if (list) {
        list.innerHTML = filtered.length > 0
            ? filtered.map(a => alertItemHtml(a)).join('')
            : '<div class="empty-state"><p>No alerts for this filter</p></div>';
        bindAlertActions();
    }
}

// ── Target Detail View ─────────────────────────

async function renderTargetDetail(targetId) {
    const main = document.getElementById('main-content');
    try {
        const data = await API.get(`/api/targets/${targetId}/history`);
        const target = data.target;
        const snapshots = data.snapshots;
        const statusLabel = target.status === 'paused' ? 'Paused' : target.status === 'active' ? 'Active' : 'Inactive';
        const statusColor = target.status === 'active' ? 'success' : (target.status === 'paused' ? 'warning' : 'danger');

        main.innerHTML = `
            <div class="detail-header">
                <button class="detail-header__back" id="btn-back" title="Retour">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <div class="detail-header__info">
                    <h1>${escapeHtml(target.name)}</h1>
                    <p>${escapeHtml(target.url)}</p>
                    ${target.css_selector ? `<p style="color:var(--accent-cyan); margin-top:4px; font-size:0.8rem;">Selector / XPath: <code style="font-family:JetBrains Mono,monospace; background:rgba(6,182,212,0.1); padding:2px 6px; border-radius:4px; word-break: break-all;">${escapeHtml(target.css_selector)}</code></p>` : ''}
                    ${target.crop_w ? `<p style="color:var(--accent-violet); margin-top:4px; font-size:0.8rem;">Crop : <code style="font-family:JetBrains Mono,monospace; background:rgba(139,92,246,0.1); padding:2px 6px; border-radius:4px;">X:${target.crop_x} Y:${target.crop_y} W:${target.crop_w} H:${target.crop_h}</code></p>` : ''}
                </div>
                <div style="display:flex;gap:8px">
                    <button class="btn btn--scan btn--sm" data-scan-target="${target.id}">
                        <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                        Scan
                    </button>
                    <button class="btn btn--ghost btn--sm" data-edit-target="${target.id}">
                        <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                        Edit
                    </button>
                    <button class="btn btn--danger btn--sm" data-delete-target="${target.id}">
                        <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        Delete
                    </button>
                </div>
            </div>

            <div class="stats-grid" style="margin-bottom:32px">
                ${statCard('violet', hashIcon(), target.last_hash ? target.last_hash.substring(0, 8) + '…' : '—', 'Last hash')}
                ${statCard('cyan', clockIcon(), target.last_check ? timeAgo(target.last_check) : 'Never', 'Last scan')}
                ${statCard('success', snapshotIcon(), snapshots.length, 'Snapshots')}
                ${statCard(statusColor, statusIcon(), statusLabel, 'Status')}
            </div>

            <div class="section">
                <div class="section__header">
                    <h2 class="section__title">Snapshot history</h2>
                    <button class="btn btn--ghost btn--sm btn--danger-text" id="btn-clear-target-history">
                        Clear history
                    </button>
                </div>

                ${snapshots.length > 0
                ? `<div class="history-timeline">${snapshots.map((s, i) => snapshotCardHtml(s, snapshots[i + 1])).join('')}</div>`
                : emptyState('No snapshot yet', 'Run a scan to capture the first snapshot for this target.')
            }
            </div>
        `;

        // Back button
        document.getElementById('btn-back')?.addEventListener('click', () => {
            window.location.hash = '#/targets';
        });

        // Single scan
        document.querySelector(`[data-scan-target="${target.id}"]`)?.addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            btn.classList.add('scanning');
            btn.disabled = true;

            // Add global scan overlay bar
            let scanBar = document.getElementById('scan-progress-bar');
            if (!scanBar) {
                scanBar = document.createElement('div');
                scanBar.id = 'scan-progress-bar';
                scanBar.className = 'scan-overlay';
                document.body.appendChild(scanBar);
            }

            try {
                await API.post('/api/scan', { target_id: target.id });
                showToast('Scan completed', 'success');
                await renderTargetDetail(target.id);
            } catch (err) {
                showToast(err.message, 'error');
            } finally {
                btn.classList.remove('scanning');
                btn.disabled = false;
                document.getElementById('scan-progress-bar')?.remove();
            }
        });

        document.querySelector(`[data-edit-target="${target.id}"]`)?.addEventListener('click', async () => {
            try {
                await openEditModal(target.id);
            } catch (err) {
                showToast(err.message, 'error');
            }
        });

        // Delete button
        document.querySelector(`[data-delete-target="${target.id}"]`)?.addEventListener('click', async () => {
            const confirmed = await askConfirm({
                title: 'Delete target',
                message: `Delete target "${target.name}"? This action is irreversible.`,
                confirmLabel: 'Delete',
                confirmVariant: 'danger',
            });
            if (!confirmed) return;
            try {
                await API.delete(`/api/targets/${target.id}`);
                showToast('Target deleted', 'success');
                window.location.hash = '#/targets';
            } catch (err) {
                showToast(err.message, 'error');
            }
        });

        // Snapshot viewer bindings
        document.querySelectorAll('.snapshot-card').forEach(card => {
            const snapId = parseInt(card.dataset.snapshotId, 10);
            const snapIndex = snapshots.findIndex(s => s.id === snapId);
            if (snapIndex === -1) return;
            const snap = snapshots[snapIndex];
            const prev = snapshots[snapIndex + 1];

            card.style.cursor = 'pointer';
            card.addEventListener('click', (e) => {
                if (e.target.closest('button, a, input, select, textarea, [role="button"]')) return;
                const beforeUrl = snapshotImgUrl(prev?.id);
                const afterUrl = snapshotImgUrl(snap?.id);
                const diffUrl = snap?.has_diff ? snapshotDiffUrl(snap.id) : '';

                openImageViewer(beforeUrl, afterUrl, diffUrl, {
                    title: `Snapshot ${formatDate(snap.created_at)}`,
                    subtitle: snap?.hash ? `Hash ${snap.hash.substring(0, 8)}…` : '',
                    textBefore: prev?.text_content || '',
                    textAfter: snap?.text_content || '',
                    similarity: snap?.similarity_score,
                });
            });
        });

        document.getElementById('btn-clear-target-history')?.addEventListener('click', async () => {
            const confirmed = await askConfirm({
                title: 'Clear scan history',
                message: `Delete all scan snapshots and alerts for "${target.name}"? This action is irreversible.`,
                confirmLabel: 'Clear history',
                confirmVariant: 'danger',
            });
            if (!confirmed) return;
            try {
                await API.delete(`/api/targets/${target.id}/history`);
                showToast('Scan history cleared', 'success');
                await renderTargetDetail(target.id);
            } catch (err) {
                showToast(err.message, 'error');
            }
        });

    } catch (err) {
        main.innerHTML = `<div class="empty-state"><h2>Error</h2><p>${escapeHtml(err.message)}</p></div>`;
    }
}

// ── HTML Templates ──────────────────────────────

function statCard(color, icon, value, label) {
    return `
        <div class="card stat-card">
            <div class="stat-card__icon stat-card__icon--${color}">${icon}</div>
            <div class="stat-card__value">${value}</div>
            <div class="stat-card__label">${label}</div>
        </div>
    `;
}

function targetCardHtml(t, showActions = false) {
    return `
        <div class="card target-card" data-target-id="${t.id}">
            <div class="target-card__header ${showActions ? 'target-card__header--with-actions' : ''}">
                <div class="target-card__title-row">
                    <span class="target-card__name" title="${escapeHtml(t.name)}">${escapeHtml(t.name)}</span>
                </div>
                ${showActions ? `
                    <div class="target-card__actions">
                        <button class="btn btn--ghost btn--sm" data-scan-target="${t.id}" title="Scan" onclick="event.stopPropagation()">
                            <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                        </button>
                        <button class="btn btn--ghost btn--sm" data-card-edit="${t.id}" title="Edit" onclick="event.stopPropagation()">
                            <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                        </button>
                        <button class="btn btn--ghost btn--sm" data-toggle-pause="${t.id}" data-current-status="${t.status || 'active'}" title="${t.status === 'paused' ? 'Resume monitoring' : 'Pause monitoring'}" onclick="event.stopPropagation()">
                            ${t.status === 'paused'
                                ? '<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>'
                                : '<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>'
                            }
                        </button>
                        <button class="btn btn--ghost btn--sm btn--danger-text" data-card-delete="${t.id}" title="Delete" onclick="event.stopPropagation()">
                            <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="color:#f87171"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                    </div>
                ` : ''}
            </div>
            <div class="target-card__url">${escapeHtml(t.url)}</div>
            <div class="target-card__meta">
                <div class="target-card__meta-item">
                    <span class="target-card__category category--${t.category}" style="margin-right: 8px;">${CATEGORY_LABELS[t.category] || t.category}</span>
                    <div class="target-card__status target-card__status--${t.status || 'active'}"></div>
                    <span>${t.status === 'paused' ? 'Paused' : t.status === 'active' ? 'Active' : 'Inactive'}</span>
                </div>
                <div class="target-card__meta-item">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    <span>${t.last_check ? timeAgo(t.last_check) : 'Never scanned'}</span>
                </div>
            </div>
        </div>
    `;
}

function alertItemHtml(a) {
    const typeLabels = {
        'visual_change': 'Visual change',
        'hash_change': 'Text change',
        'error': 'Error'
    };

    let detailExtra = '';
    if (a.alert_type === 'visual_change' && a.similarity_score !== null) {
        detailExtra = ` — <strong>${a.similarity_score.toFixed(2)}%</strong> difference`;
    }

    // Determine URLs for direct viewing
    let viewerTrigger = '';
    if (a.snapshot_id) {
        viewerTrigger = `<button class="btn btn--primary btn--sm" style="margin-right:8px;" data-alert-view="${a.id}">View</button>`;
    }

    const detailSnippet = a.details
        ? escapeHtml(String(a.details).replace(/\s+/g, ' ').trim()).slice(0, 260)
        : '';

    return `
        <div class="alert-item ${a.is_read ? 'is-read' : ''}" data-alert-id="${a.id}">
            <div class="alert-item__icon alert-item__icon--${a.severity}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
            </div>
            <div class="alert-item__content">
                <div class="alert-item__title">${escapeHtml(a.target_name || 'Target')}</div>
                <div class="alert-item__detail">
                    <span class="severity-tag severity-tag--${a.severity}">${a.severity}</span>
                    ${typeLabels[a.alert_type] || a.alert_type}${detailExtra}
                </div>
                ${detailSnippet ? `<div class="alert-item__subdetail">${detailSnippet}</div>` : ''}
            </div>
            <div class="alert-item__time">${timeAgo(a.created_at)}</div>
            <div class="alert-item__actions">
                ${viewerTrigger}
                ${!a.is_read ? `<button class="btn btn--ghost btn--sm" data-mark-read="${a.id}" title="Mark as read">✓</button>` : ''}
            </div>
        </div>
    `;
}

function snapshotCardHtml(snapshot, prevSnapshot) {
    const hasChange = snapshot.similarity_score !== null && snapshot.similarity_score !== undefined && snapshot.similarity_score > 0;
    const thumbUrl = snapshotImgUrl(snapshot.id);

    return `
        <div class="card snapshot-card" data-snapshot-id="${snapshot.id}">
            <div class="snapshot-card__thumb" ${thumbUrl ? 'style="cursor:pointer;"' : ''} title="View fullscreen">
                ${thumbUrl ? `<img src="${thumbUrl}" alt="Screenshot" loading="lazy" onerror="this.parentElement.innerHTML='<div style=\\'padding:40px;text-align:center;color:var(--text-muted)\\'>No image</div>'">` : '<div style="padding:40px;text-align:center;color:var(--text-muted)">No image</div>'}
            </div>
            <div class="snapshot-card__info">
                <h3>${formatDate(snapshot.created_at)}</h3>
                <p>Hash: <code style="font-family:JetBrains Mono,monospace;font-size:0.8rem;color:var(--accent-cyan)">${snapshot.hash.substring(0, 16)}…</code></p>
                ${snapshot.similarity_score !== null && snapshot.similarity_score !== undefined
            ? `<p>Visual difference: <strong>${snapshot.similarity_score}%</strong></p>`
            : '<p style="color:var(--text-muted)">First snapshot</p>'}
            </div>
            <div>
                <span class="snapshot-card__badge ${hasChange ? 'badge--changed' : 'badge--stable'}">
                    ${hasChange ? '⚠ Changed' : '✓ Stable'}
                </span>
            </div>
        </div>
    `;
}

function integrationCardHtml(integration, savedState = {}) {
    const connected = Boolean(savedState && savedState.endpoint);
    const endpointPreview = connected && savedState.endpoint ? escapeHtml(formatEndpointPreview(savedState.endpoint)) : '';

    return `
        <div class="card integration-card" data-integration="${integration.id}">
            <div class="integration-card__header">
                <div class="integration-card__title-copy">
                    <h3>${escapeHtml(integration.name)}</h3>
                    <p>${escapeHtml(integration.description)}</p>
                    <div style="margin-top: 12px;">
                        <span class="integration-status ${connected ? 'integration-status--connected' : ''}">
                            ${connected ? 'Connected' : 'Disconnected'}
                        </span>
                    </div>
                </div>
                <div class="integration-card__aside">
                    <div class="integration-card__icon integration-card__icon--corner">${integration.icon}</div>
                </div>
            </div>
            ${connected && endpointPreview ? `<div class="integration-card__connected">Webhook: <code>${endpointPreview}</code></div>` : ''}
            <div class="integration-card__actions">
                ${connected
                    ? `
                        <button class="btn btn--ghost btn--sm" data-integration-test="${integration.id}">Test</button>
                        <button class="btn btn--ghost btn--sm btn--danger-text" data-integration-disconnect="${integration.id}">Disconnect</button>
                    `
                    : `<button class="btn btn--primary btn--sm" data-integration-connect="${integration.id}">Add</button>`
                }
                <a class="link-muted" href="${integration.doc}" target="_blank" rel="noreferrer">Docs</a>
            </div>
        </div>
    `;
}

function formatEndpointPreview(url) {
    if (!url) return '';
    const trimmed = url.trim();
    if (trimmed.length <= 48) return trimmed;
    return `${trimmed.slice(0, 22)}…${trimmed.slice(-10)}`;
}

function bindIntegrationActions() {
    document.querySelectorAll('[data-integration-connect]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            const integration = findIntegration(btn.dataset.integrationConnect);
            if (!integration) return;
            const input = await askInput({
                title: `Connect ${integration.name}`,
                message: 'Enter the webhook URL.',
                confirmLabel: 'Save',
                inputLabel: 'Webhook URL',
                inputPlaceholder: integration.placeholder || '',
            });
            if (!input) return;
            const state = await loadIntegrationState();
            state[integration.id] = {
                endpoint: input.trim(),
                connected_at: new Date().toISOString(),
            };
            await saveIntegrationState(state);
            showToast(`${integration.name} connected`, 'success');
            await renderConnections();
        });
    });

    document.querySelectorAll('[data-integration-disconnect]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            const integration = findIntegration(btn.dataset.integrationDisconnect);
            if (!integration) return;
            const confirmed = await askConfirm({
                title: `Disconnect ${integration.name}`,
                message: 'This connection will no longer receive alerts.',
                confirmLabel: 'Disconnect',
                confirmVariant: 'danger',
            });
            if (!confirmed) return;
            const state = await loadIntegrationState();
            delete state[integration.id];
            await saveIntegrationState(state);
            showToast(`${integration.name} disconnected`, 'info');
            await renderConnections();
        });
    });

    document.querySelectorAll('[data-integration-test]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            const integration = findIntegration(btn.dataset.integrationTest);
            if (!integration) return;
            btn.disabled = true;
            try {
                await API.post('/api/settings/integrations/test', { integration_id: integration.id });
                showToast(`Test sent to ${integration.name}`, 'success');
            } catch (err) {
                showToast(err.message || `${integration.name} test failed`, 'error');
            } finally {
                btn.disabled = false;
            }
        });
    });
}

function emptyState(title, text) {
    return `
        <div class="empty-state">
            <svg class="empty-state__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <h3 class="empty-state__title">${title}</h3>
            <p class="empty-state__text">${text}</p>
        </div>
    `;
}

// ── SVG Icons ──────────────────────────────────

function targetIcon() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>';
}
function scanIcon() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>';
}
function alertIcon() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>';
}
function checkIcon() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
}
function hashIcon() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>';
}
function clockIcon() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
}
function slackIcon() {
    return '<img src="https://cdn.simpleicons.org/slack" alt="Slack" loading="lazy" />';
}
function discordIcon() {
    return '<img src="https://cdn.simpleicons.org/discord" alt="Discord" loading="lazy" />';
}
function webhookIcon() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 12a4 4 0 1 1 4-4"/><path d="M17 12a4 4 0 1 1-4 4"/><path d="M9 10l6 4"/></svg>';
}
function snapshotIcon() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
}
function statusIcon() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>';
}

// ── Event Bindings ─────────────────────────────

function bindScanButton() {
    document.getElementById('btn-scan-all')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.classList.add('scanning');
        btn.disabled = true;
        btn.querySelector('span')?.textContent || (btn.lastChild.textContent = ' Scanning…');
        const cards = document.querySelectorAll('.target-card');
        cards.forEach(card => card.classList.add('is-scanning'));
        try {
            const result = await API.post('/api/scan');
            showToast(result.message, 'success');
            await router(); // Refresh view
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            btn.classList.remove('scanning');
            btn.disabled = false;
            cards.forEach(card => card.classList.remove('is-scanning'));
        }
    });

    // Individual scan buttons
    document.querySelectorAll('[data-scan-target]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const targetId = parseInt(btn.dataset.scanTarget);
            const card = btn.closest('.target-card');

            btn.disabled = true;

            // Add scan overlay bar at the top of the page
            let scanBar = document.getElementById('scan-progress-bar');
            if (!scanBar) {
                scanBar = document.createElement('div');
                scanBar.id = 'scan-progress-bar';
                scanBar.className = 'scan-overlay';
                document.body.appendChild(scanBar);
            }

            if (card) {
                card.classList.add('is-scanning');
            } else {
                btn.classList.add('scanning');
            }

            try {
                await API.post('/api/scan', { target_id: targetId });
                showToast('Scan completed', 'success');
                await router();
            } catch (err) {
                showToast(err.message, 'error');
            } finally {
                btn.disabled = false;
                if (card) card.classList.remove('is-scanning');
                else btn.classList.remove('scanning');
                document.getElementById('scan-progress-bar')?.remove();
            }
        });
    });
}

function bindTargetCards() {
    document.querySelectorAll('.target-card[data-target-id]').forEach(card => {
        card.addEventListener('click', () => {
            window.location.hash = `#/targets/${card.dataset.targetId}`;
        });
    });

    // Delete buttons on cards
    document.querySelectorAll('[data-card-edit]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const targetId = parseInt(btn.dataset.cardEdit, 10);
            try {
                await openEditModal(targetId);
            } catch (err) {
                showToast(err.message, 'error');
            }
        });
    });

    // Delete buttons on cards
    document.querySelectorAll('[data-card-delete]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const targetId = parseInt(btn.dataset.cardDelete);
            const confirmed = await askConfirm({
                title: 'Delete target',
                message: 'Delete this target permanently? This action is irreversible.',
                confirmLabel: 'Delete',
                confirmVariant: 'danger',
            });
            if (!confirmed) return;
            try {
                await API.delete(`/api/targets/${targetId}`);
                showToast('Target deleted', 'success');
                await router(); // Refresh the list
            } catch (err) {
                showToast(err.message, 'error');
            }
        });
    });

    // Pause/resume buttons on cards
    document.querySelectorAll('[data-toggle-pause]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const targetId = parseInt(btn.dataset.togglePause);
            const isPaused = btn.dataset.currentStatus === 'paused';
            try {
                await API.patch(`/api/targets/${targetId}/${isPaused ? 'resume' : 'pause'}`);
                showToast(isPaused ? 'Monitoring resumed' : 'Target paused', isPaused ? 'success' : 'info');
                await router();
            } catch (err) {
                showToast(err.message, 'error');
            }
        });
    });
}

function bindAlertActions() {
    document.querySelectorAll('[data-mark-read]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const alertId = btn.dataset.markRead;
            try {
                await API.patch(`/api/alerts/${alertId}/read`);
                const item = btn.closest('.alert-item');
                item?.classList.remove('alert-item--unread');
                btn.remove();
                updateAlertBadge();
                showToast('Alert marked as read', 'success');
            } catch (err) {
                showToast(err.message, 'error');
            }
        });
    });

    document.querySelectorAll('[data-alert-view]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const alertId = btn.dataset.alertView;
            await openAlertViewer(alertId);
        });
    });
}

// ── Modal Management ───────────────────────────

const targetFormState = {
    mode: 'create',
    targetId: null,
};

function setTargetModalMode(mode = 'create') {
    targetFormState.mode = mode;
    const title = document.querySelector('#add-target-modal .modal__title');
    const submitBtn = document.querySelector('#add-target-form button[type="submit"]');
    if (title) title.textContent = mode === 'edit' ? 'Edit target' : 'Add target';
    if (submitBtn) submitBtn.innerHTML = mode === 'edit'
        ? `<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>Save`
        : `<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add`;
}

function renderSelectionSummaryFromInputs() {
    const summary = document.getElementById('selection-summary');
    const selector = document.getElementById('target-css-selector')?.value?.trim();
    const cropX = document.getElementById('target-crop-x')?.value;
    const cropY = document.getElementById('target-crop-y')?.value;
    const cropW = document.getElementById('target-crop-w')?.value;
    const cropH = document.getElementById('target-crop-h')?.value;

    if (!summary) return;

    if (selector) {
        summary.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--accent-cyan)" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
                <strong style="color:var(--accent-cyan)">HTML Element</strong>
            </div>
            <div style="margin-top:4px; font-family:JetBrains Mono,monospace; color:var(--accent-cyan); font-size:0.72rem; word-break:break-all;">
                ${escapeHtml(selector)}
            </div>
        `;
        summary.style.display = 'block';
        return;
    }

    const hasCrop = [cropX, cropY, cropW, cropH].every(v => v !== '' && !Number.isNaN(Number(v)));
    if (hasCrop) {
        summary.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--accent-violet)" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="4 2"/></svg>
                <strong style="color:var(--accent-violet)">Rectangle Area</strong>
            </div>
            <div style="margin-top:4px; font-family:JetBrains Mono,monospace; color:var(--text-secondary);">
                X:${cropX} Y:${cropY} — ${cropW}×${cropH}px
            </div>
        `;
        summary.style.display = 'block';
        return;
    }

    summary.style.display = 'none';
    summary.innerHTML = '';
}

function openAddModal() {
    targetFormState.targetId = null;
    setTargetModalMode('create');
    document.getElementById('add-target-form')?.reset();
    ['target-css-selector', 'target-crop-x', 'target-crop-y', 'target-crop-w', 'target-crop-h'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    document.getElementById('modal-overlay').style.display = 'flex';
    // Reset selection state
    previewState.reset();
    document.getElementById('selection-summary').style.display = 'none';
    document.getElementById('selection-summary').innerHTML = '';
}

async function openEditModal(targetId) {
    const target = await API.get(`/api/targets/${targetId}`);
    targetFormState.targetId = targetId;
    setTargetModalMode('edit');

    previewState.reset();

    document.getElementById('target-name').value = target.name || '';
    document.getElementById('target-url').value = target.url || '';
    document.getElementById('target-category').value = target.category || 'general';
    document.getElementById('target-css-selector').value = target.css_selector || '';
    document.getElementById('target-crop-x').value = target.crop_x ?? '';
    document.getElementById('target-crop-y').value = target.crop_y ?? '';
    document.getElementById('target-crop-w').value = target.crop_w ?? '';
    document.getElementById('target-crop-h').value = target.crop_h ?? '';
    renderSelectionSummaryFromInputs();
    document.getElementById('modal-overlay').style.display = 'flex';
}

function closeAddModal() {
    document.getElementById('modal-overlay').style.display = 'none';
    document.getElementById('add-target-form').reset();
    setTargetModalMode('create');
    targetFormState.targetId = null;
    previewState.reset();
    document.getElementById('selection-summary').style.display = 'none';
}

document.getElementById('modal-close')?.addEventListener('click', closeAddModal);
document.getElementById('modal-cancel')?.addEventListener('click', closeAddModal);
document.getElementById('modal-overlay')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeAddModal();
});

document.getElementById('add-target-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('target-name').value.trim();
    const url = document.getElementById('target-url').value.trim();
    const category = document.getElementById('target-category').value;
    const cssSelector = document.getElementById('target-css-selector')?.value || undefined;

    const cropX = parseInt(document.getElementById('target-crop-x')?.value, 10);
    const cropY = parseInt(document.getElementById('target-crop-y')?.value, 10);
    const cropW = parseInt(document.getElementById('target-crop-w')?.value, 10);
    const cropH = parseInt(document.getElementById('target-crop-h')?.value, 10);

    const payload = { name, url, category, css_selector: cssSelector };
    if (!isNaN(cropX) && !isNaN(cropY) && !isNaN(cropW) && !isNaN(cropH) && cropW > 0 && cropH > 0) {
        payload.crop_x = cropX;
        payload.crop_y = cropY;
        payload.crop_w = cropW;
        payload.crop_h = cropH;
    }

    try {
        if (targetFormState.mode === 'edit' && targetFormState.targetId) {
            await API.put(`/api/targets/${targetFormState.targetId}`, payload);
            showToast(`Target "${name}" updated`, 'success');
        } else {
            await API.post('/api/targets', payload);
            showToast(`Target "${name}" added`, 'success');
        }
        closeAddModal();
        await router();
    } catch (err) {
        showToast(err.message, 'error');
    }
});

// ── Preview Tool (Visual Selection) ────────────

const previewState = {
    mode: 'rect', // 'rect' or 'element'
    elements: [],
    viewport: { width: 1280, height: 800 },
    imgNaturalW: 0,
    imgNaturalH: 0,

    // Rectangle mode state
    isDrawing: false,
    isDraggingRect: false,
    isResizingRect: false,
    resizeCorner: null,
    dragOffsetX: 0,
    dragOffsetY: 0,
    startX: 0,
    startY: 0,
    rect: null, // {x, y, w, h} in real coords

    // Element mode state
    hoveredElement: null,
    selectedElement: null, // element from the map

    reset() {
        this.elements = [];
        this.rect = null;
        this.isDrawing = false;
        this.isDraggingRect = false;
        this.isResizingRect = false;
        this.resizeCorner = null;
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;
        this.hoveredElement = null;
        this.selectedElement = null;
        // Clear hidden inputs
        ['target-css-selector', 'target-crop-x', 'target-crop-y', 'target-crop-w', 'target-crop-h'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
    }
};

// Preview button click
document.getElementById('btn-preview')?.addEventListener('click', async () => {
    const url = document.getElementById('target-url')?.value.trim();
    if (!url) {
        showToast('Please enter a URL first', 'error');
        return;
    }

    // Open preview overlay
    const overlay = document.getElementById('preview-overlay');
    overlay.style.display = 'flex';
    document.getElementById('preview-loading').style.display = 'flex';
    document.getElementById('preview-img').style.display = 'none';

    const currentSelector = (document.getElementById('target-css-selector')?.value || '').trim();
    const currentCropX = Number(document.getElementById('target-crop-x')?.value);
    const currentCropY = Number(document.getElementById('target-crop-y')?.value);
    const currentCropW = Number(document.getElementById('target-crop-w')?.value);
    const currentCropH = Number(document.getElementById('target-crop-h')?.value);

    const hasCrop = [currentCropX, currentCropY, currentCropW, currentCropH].every(v => !Number.isNaN(v)) && currentCropW > 0 && currentCropH > 0;
    previewState.rect = hasCrop ? {
        x: Math.round(currentCropX),
        y: Math.round(currentCropY),
        w: Math.round(currentCropW),
        h: Math.round(currentCropH),
    } : null;
    previewState.selectedElement = null;
    previewState.hoveredElement = null;

    // Set default mode
    setPreviewMode(currentSelector ? 'element' : 'rect');

    try {
        const data = await API.post('/api/preview', { url });
        previewState.elements = data.elements || [];
        previewState.viewport = data.viewport;

        const img = document.getElementById('preview-img');
        img.src = `data:image/png;base64,${data.screenshot}`;

        img.onload = () => {
            previewState.imgNaturalW = img.naturalWidth;
            previewState.imgNaturalH = img.naturalHeight;

            // Set canvas size to match displayed image
            const canvas = document.getElementById('preview-canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;

            document.getElementById('preview-loading').style.display = 'none';
            img.style.display = 'block';

            if (currentSelector) {
                previewState.selectedElement = previewState.elements.find(el => el.xpath === currentSelector) || null;
            }

            clearCanvas();
            if (previewState.mode === 'rect' && previewState.rect) {
                drawRect(previewState.rect);
                document.getElementById('preview-info-text').textContent =
                    `Current area: ${previewState.rect.w}×${previewState.rect.h}px — drag to move, drag corner to resize`;
            }
            if (previewState.mode === 'element' && previewState.selectedElement) {
                drawElementHighlight(previewState.selectedElement, true);
                const el = previewState.selectedElement;
                document.getElementById('preview-info-text').textContent =
                    `Current element: <${el.tagName}${el.id ? '#' + el.id : ''}> — click another to change`;
            }
        };
    } catch (err) {
        showToast(`Preview error: ${err.message}`, 'error');
        overlay.style.display = 'none';
    }
});

// Close preview
document.getElementById('preview-cancel')?.addEventListener('click', () => {
    document.getElementById('preview-overlay').style.display = 'none';
    previewState.rect = null;
    previewState.selectedElement = null;
});

// Validate preview selection
document.getElementById('preview-validate')?.addEventListener('click', () => {
    const summary = document.getElementById('selection-summary');

    if (previewState.mode === 'rect' && previewState.rect) {
        const r = previewState.rect;
        document.getElementById('target-crop-x').value = r.x;
        document.getElementById('target-crop-y').value = r.y;
        document.getElementById('target-crop-w').value = r.w;
        document.getElementById('target-crop-h').value = r.h;
        document.getElementById('target-css-selector').value = '';

        summary.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--accent-violet)" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="4 2"/></svg>
                <strong style="color:var(--accent-violet)">Rectangle Area</strong>
            </div>
            <div style="margin-top:4px; font-family:JetBrains Mono,monospace; color:var(--text-secondary);">
                X:${r.x} Y:${r.y} — ${r.w}×${r.h}px
            </div>
        `;
        summary.style.display = 'block';
    } else if (previewState.mode === 'element' && previewState.selectedElement) {
        const el = previewState.selectedElement;
        document.getElementById('target-css-selector').value = el.xpath;
        document.getElementById('target-crop-x').value = '';
        document.getElementById('target-crop-y').value = '';
        document.getElementById('target-crop-w').value = '';
        document.getElementById('target-crop-h').value = '';

        summary.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--accent-cyan)" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
                <strong style="color:var(--accent-cyan)">HTML Element</strong>
            </div>
            <div style="margin-top:4px; font-family:JetBrains Mono,monospace; color:var(--text-secondary); word-break:break-all; font-size:0.75rem;">
                &lt;${el.tagName}${el.id ? ' id="' + el.id + '"' : ''}${el.className ? ' class="' + el.className.split(' ')[0] + '"' : ''}&gt;
            </div>
            <div style="margin-top:2px; font-family:JetBrains Mono,monospace; color:var(--accent-cyan); font-size:0.7rem; word-break:break-all;">
                ${escapeHtml(el.xpath)}
            </div>
        `;
        summary.style.display = 'block';
    } else {
        showToast('No selection made', 'error');
        return;
    }

    document.getElementById('preview-overlay').style.display = 'none';
    showToast('Selection saved', 'success');
});

// Mode toggle
document.querySelectorAll('#mode-toggle .mode-toggle__btn').forEach(btn => {
    btn.addEventListener('click', () => {
        setPreviewMode(btn.dataset.mode);
    });
});

function setPreviewMode(mode) {
    previewState.mode = mode;
    previewState.hoveredElement = null;

    document.querySelectorAll('#mode-toggle .mode-toggle__btn').forEach(b => {
        b.classList.toggle('active', b.dataset.mode === mode);
    });

    const canvas = document.getElementById('preview-canvas');
    const infoText = document.getElementById('preview-info-text');

    if (mode === 'rect') {
        canvas.classList.remove('mode-element');
        infoText.textContent = 'Draw a rectangle over the area to monitor';
        // Redraw existing rect if any
        clearCanvas();
        if (previewState.rect) drawRect(previewState.rect);
    } else {
        canvas.classList.add('mode-element');
        infoText.textContent = 'Hover elements and click to select';
        clearCanvas();
        if (previewState.selectedElement) {
            drawElementHighlight(previewState.selectedElement, true);
        }
    }
}

// ── Canvas Drawing Logic ───────────────────────

function getCanvasCoords(e) {
    const canvas = document.getElementById('preview-canvas');
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
    };
}

function clearCanvas() {
    const canvas = document.getElementById('preview-canvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function drawRect(r) {
    const canvas = document.getElementById('preview-canvas');
    const ctx = canvas.getContext('2d');
    // Semi-transparent overlay outside the rect
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.clearRect(r.x, r.y, r.w, r.h);

    // Dashed violet border
    ctx.strokeStyle = '#a78bfa';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.setLineDash([]);

    // Corner handles
    const handleSize = 6;
    ctx.fillStyle = '#a78bfa';
    [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]].forEach(([cx, cy]) => {
        ctx.fillRect(cx - handleSize / 2, cy - handleSize / 2, handleSize, handleSize);
    });

    // Dimension label with strong contrast
    ctx.font = 'bold 12px JetBrains Mono, monospace';
    const label = `${r.w}×${r.h}`;
    const textWidth = ctx.measureText(label).width;
    const labelX = r.x + r.w / 2 - textWidth / 2;
    const labelY = r.y + r.h + 18;
    const boxPadX = 7;
    const boxW = textWidth + boxPadX * 2;
    const boxX = labelX - boxPadX;
    const boxY = labelY - 13;
    ctx.fillStyle = 'rgba(9, 13, 18, 0.92)';
    ctx.fillRect(boxX, boxY, boxW, 18);
    ctx.strokeStyle = 'rgba(167,139,250,0.9)';
    ctx.lineWidth = 1;
    ctx.strokeRect(boxX, boxY, boxW, 18);
    ctx.fillStyle = '#e9ecf2';
    ctx.fillText(label, labelX, labelY);
}

function drawElementHighlight(el, isSelected = false) {
    const canvas = document.getElementById('preview-canvas');
    const ctx = canvas.getContext('2d');
    const r = el.rect;

    if (isSelected) {
        ctx.fillStyle = 'rgba(6, 182, 212, 0.15)';
        ctx.fillRect(r.x, r.y, r.width, r.height);
        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 2;
        ctx.strokeRect(r.x, r.y, r.width, r.height);
    } else {
        ctx.fillStyle = 'rgba(96, 165, 250, 0.1)';
        ctx.fillRect(r.x, r.y, r.width, r.height);
        ctx.strokeStyle = 'rgba(96, 165, 250, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(r.x, r.y, r.width, r.height);
    }

    // Tag label
    const bgColor = 'rgba(8, 12, 18, 0.94)';
    const borderColor = isSelected ? '#06b6d4' : '#7fb6ff';
    const tagLabel = `<${el.tagName}${el.id ? '#' + el.id : ''}>${el.text ? ' ' + el.text.substring(0, 30) : ''}`;
    ctx.font = '11px JetBrains Mono, monospace';
    const textW = ctx.measureText(tagLabel).width + 10;
    const labelY = Math.max(r.y - 20, 0);
    ctx.fillStyle = bgColor;
    ctx.fillRect(r.x, labelY, textW, 18);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(r.x, labelY, textW, 18);
    ctx.fillStyle = '#f3f7ff';
    ctx.fillText(tagLabel, r.x + 5, labelY + 13);
}

function clampRectToCanvas(rect, canvas) {
    const maxW = canvas.width;
    const maxH = canvas.height;
    const w = Math.max(6, Math.min(rect.w, maxW));
    const h = Math.max(6, Math.min(rect.h, maxH));
    const x = Math.max(0, Math.min(rect.x, maxW - w));
    const y = Math.max(0, Math.min(rect.y, maxH - h));
    return {
        x: Math.round(x),
        y: Math.round(y),
        w: Math.round(w),
        h: Math.round(h),
    };
}

function getRectCornerHit(rect, point, threshold = 12) {
    const corners = {
        nw: { x: rect.x, y: rect.y },
        ne: { x: rect.x + rect.w, y: rect.y },
        sw: { x: rect.x, y: rect.y + rect.h },
        se: { x: rect.x + rect.w, y: rect.y + rect.h },
    };
    for (const [name, c] of Object.entries(corners)) {
        if (Math.abs(point.x - c.x) <= threshold && Math.abs(point.y - c.y) <= threshold) {
            return name;
        }
    }
    return null;
}

function isPointInRect(rect, point) {
    return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;
}

// Canvas event listeners
const previewCanvas = document.getElementById('preview-canvas');

if (previewCanvas) {
    previewCanvas.addEventListener('mousedown', (e) => {
        if (previewState.mode !== 'rect') return;
        const coords = getCanvasCoords(e);
        const existingRect = previewState.rect;
        if (existingRect) {
            const corner = getRectCornerHit(existingRect, coords);
            if (corner) {
                previewState.isResizingRect = true;
                previewState.resizeCorner = corner;
                previewState.startX = coords.x;
                previewState.startY = coords.y;
                return;
            }
            if (isPointInRect(existingRect, coords)) {
                previewState.isDraggingRect = true;
                previewState.dragOffsetX = coords.x - existingRect.x;
                previewState.dragOffsetY = coords.y - existingRect.y;
                return;
            }
        }

        previewState.isDrawing = true;
        previewState.startX = coords.x;
        previewState.startY = coords.y;
        previewState.rect = null;
    });

    previewCanvas.addEventListener('mousemove', (e) => {
        const coords = getCanvasCoords(e);

        if (previewState.mode === 'rect' && previewState.isDrawing) {
            const x = Math.min(previewState.startX, coords.x);
            const y = Math.min(previewState.startY, coords.y);
            const w = Math.abs(coords.x - previewState.startX);
            const h = Math.abs(coords.y - previewState.startY);

            previewState.rect = { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
            clearCanvas();
            drawRect(previewState.rect);

            document.getElementById('preview-info-text').textContent =
                `Area: X:${Math.round(x)} Y:${Math.round(y)} — ${Math.round(w)}×${Math.round(h)}px`;
        }

        if (previewState.mode === 'rect' && previewState.isDraggingRect && previewState.rect) {
            const canvas = document.getElementById('preview-canvas');
            const moved = {
                x: coords.x - previewState.dragOffsetX,
                y: coords.y - previewState.dragOffsetY,
                w: previewState.rect.w,
                h: previewState.rect.h,
            };
            previewState.rect = clampRectToCanvas(moved, canvas);
            clearCanvas();
            drawRect(previewState.rect);
            document.getElementById('preview-info-text').textContent =
                `Area moved: X:${previewState.rect.x} Y:${previewState.rect.y} — ${previewState.rect.w}×${previewState.rect.h}px`;
        }

        if (previewState.mode === 'rect' && previewState.isResizingRect && previewState.rect) {
            const canvas = document.getElementById('preview-canvas');
            const r = { ...previewState.rect };
            const minSize = 6;

            if (previewState.resizeCorner === 'se') {
                r.w = Math.max(minSize, Math.round(coords.x - r.x));
                r.h = Math.max(minSize, Math.round(coords.y - r.y));
            } else if (previewState.resizeCorner === 'sw') {
                const nextX = Math.min(r.x + r.w - minSize, coords.x);
                r.w = Math.max(minSize, Math.round(r.x + r.w - nextX));
                r.x = Math.round(nextX);
                r.h = Math.max(minSize, Math.round(coords.y - r.y));
            } else if (previewState.resizeCorner === 'ne') {
                const nextY = Math.min(r.y + r.h - minSize, coords.y);
                r.h = Math.max(minSize, Math.round(r.y + r.h - nextY));
                r.y = Math.round(nextY);
                r.w = Math.max(minSize, Math.round(coords.x - r.x));
            } else if (previewState.resizeCorner === 'nw') {
                const nextX = Math.min(r.x + r.w - minSize, coords.x);
                const nextY = Math.min(r.y + r.h - minSize, coords.y);
                r.w = Math.max(minSize, Math.round(r.x + r.w - nextX));
                r.h = Math.max(minSize, Math.round(r.y + r.h - nextY));
                r.x = Math.round(nextX);
                r.y = Math.round(nextY);
            }

            previewState.rect = clampRectToCanvas(r, canvas);
            clearCanvas();
            drawRect(previewState.rect);
            document.getElementById('preview-info-text').textContent =
                `Area resized: ${previewState.rect.w}×${previewState.rect.h}px`;
        }

        if (previewState.mode === 'element') {
            // Find the smallest element that contains the cursor
            let best = null;
            let bestArea = Infinity;
            for (const el of previewState.elements) {
                const r = el.rect;
                if (coords.x >= r.x && coords.x <= r.x + r.width &&
                    coords.y >= r.y && coords.y <= r.y + r.height) {
                    const area = r.width * r.height;
                    if (area < bestArea) {
                        bestArea = area;
                        best = el;
                    }
                }
            }

            if (best !== previewState.hoveredElement) {
                previewState.hoveredElement = best;
                clearCanvas();
                // Redraw selected element if any
                if (previewState.selectedElement) {
                    drawElementHighlight(previewState.selectedElement, true);
                }
                // Draw hovered element
                if (best && best !== previewState.selectedElement) {
                    drawElementHighlight(best, false);
                }
                if (best) {
                    document.getElementById('preview-info-text').textContent =
                        `<${best.tagName}${best.id ? '#' + best.id : ''}> — ${best.xpath}`;
                }
            }
        }
    });

    previewCanvas.addEventListener('mouseup', (e) => {
        if (previewState.mode === 'rect') {
            previewState.isDrawing = false;
            previewState.isDraggingRect = false;
            previewState.isResizingRect = false;
            previewState.resizeCorner = null;
            if (previewState.rect && previewState.rect.w > 5 && previewState.rect.h > 5) {
                document.getElementById('preview-info-text').textContent =
                    `✓ Area ready: ${previewState.rect.w}×${previewState.rect.h}px — Click "Validate" to confirm`;
            }
        }
    });

    previewCanvas.addEventListener('click', (e) => {
        if (previewState.mode !== 'element') return;
        if (previewState.hoveredElement) {
            previewState.selectedElement = previewState.hoveredElement;
            clearCanvas();
            drawElementHighlight(previewState.selectedElement, true);
            const el = previewState.selectedElement;
            document.getElementById('preview-info-text').textContent =
                `✓ Element selected: <${el.tagName}${el.id ? '#' + el.id : ''}> — Click "Validate" to confirm`;
        }
    });

    // Prevent context menu on canvas
    previewCanvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

// ── Alert Badge ────────────────────────────────

async function updateAlertBadge() {
    try {
        const stats = await API.get('/api/stats');
        const badge = document.getElementById('alert-badge');
        if (badge) {
            if (stats.unread_alerts > 0) {
                badge.textContent = stats.unread_alerts;
                badge.style.display = 'inline';
            } else {
                badge.style.display = 'none';
            }
        }
    } catch {
        // Silent fail for badge updates
    }
}

// ── Init ───────────────────────────────────────

window.addEventListener('hashchange', router);

function init() {
    setupImageZoom();
    setupImageViewer();
    router();
    // Periodic badge update
    setInterval(updateAlertBadge, 60000);
}

document.addEventListener('DOMContentLoaded', init);
