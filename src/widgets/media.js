import { isEditMode, playKeySound } from '../core/mode-manager.js';

const ICONS = {
  prev: '<svg viewBox="0 0 24 24"><path d="M6 5h2v14H6zM20 5v14L9 12z" fill="currentColor"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M16 5h2v14h-2zM4 5v14l11-7z" fill="currentColor"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M12 5V2L7 6l5 4V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z" fill="currentColor"/></svg><b>10</b>',
  fwd: '<svg viewBox="0 0 24 24"><path d="M12 5V2l5 4-5 4V7a6 6 0 1 0 6 6h2a8 8 0 1 1-8-8z" fill="currentColor"/></svg><b>10</b>',
  play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z" fill="currentColor"/></svg>',
};

const SEEK_STEP_SECS = 10;
const SEEK_THROTTLE_MS = 140;
const IDLE_URL = 'https://www.youtube.com';

function fmtTime(secs) {
  const s = Math.max(0, Math.floor(secs));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export function createMediaWidget({ invokeCmd, applyWidgetTier, openUrl, flashKeycap }) {
  let state = null;       // kết quả get_media_state gần nhất
  let fetchedAt = 0;      // performance.now() lúc nhận state
  let busy = false;
  let seekPreview = null; // tỉ lệ 0..1 khi đang kéo thanh tiến trình

  function markup() {
    return `
      <div class="media-unit" data-state="idle">
        <div class="media-art" aria-hidden="true"></div>
        <div class="media-idle">
          <svg class="media-idle-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 8l6 4-6 4z" fill="currentColor"/></svg>
          <span>Chưa phát video</span>
        </div>
        <div class="media-main">
          <div class="media-info">
            <div class="media-title"><span class="media-title-text"></span></div>
            <div class="media-artist-row">
              <span class="media-artist"></span>
              <span class="media-time"></span>
            </div>
          </div>
          <div class="media-controls">
            <button type="button" class="media-btn media-skip" data-act="prev" aria-label="Bài trước">${ICONS.prev}</button>
            <button type="button" class="media-btn media-seek" data-act="back" aria-label="Tua lui 10 giây">${ICONS.back}</button>
            <button type="button" class="media-btn media-play" data-act="play" aria-label="Phát / Tạm dừng">${ICONS.play}</button>
            <button type="button" class="media-btn media-seek" data-act="fwd" aria-label="Tua tới 10 giây">${ICONS.fwd}</button>
            <button type="button" class="media-btn media-skip" data-act="next" aria-label="Bài sau">${ICONS.next}</button>
          </div>
        </div>
        <div class="media-bar"><i class="media-bar-fill"></i></div>
        <div class="media-seek-zone" aria-label="Thanh tiến trình"></div>
      </div>`;
  }

  function currentPosition() {
    if (!state || !state.active) return 0;
    let pos = state.position_secs;
    if (state.status === 'playing') pos += (performance.now() - fetchedAt) / 1000;
    return state.duration_secs > 0 ? Math.min(pos, state.duration_secs) : pos;
  }

  function paintBar(unit) {
    const fill = unit.querySelector('.media-bar-fill');
    if (!fill) return;
    const duration = state ? state.duration_secs : 0;
    const ratio = seekPreview !== null ? seekPreview : (duration > 0 ? currentPosition() / duration : 0);
    fill.style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
    const time = unit.querySelector('.media-time');
    if (time) time.textContent = duration > 0 ? `${fmtTime(ratio * duration)} / ${fmtTime(duration)}` : '';
  }

  // Chữ chạy ngang chỉ bật khi tiêu đề thực sự tràn; chỉ đo lại khi đổi chữ hoặc đổi bề rộng.
  function fitTitle(unit) {
    const box = unit.querySelector('.media-title');
    const text = unit.querySelector('.media-title-text');
    const key = `${text.textContent}|${box.clientWidth}`;
    if (!box.clientWidth || unit.__titleKey === key) return;
    unit.__titleKey = key;
    box.classList.remove('is-marquee');
    const overflow = text.scrollWidth - box.clientWidth;
    box.classList.toggle('is-marquee', overflow > 2);
    if (overflow > 2) {
      box.style.setProperty('--mq-shift', `-${overflow}px`);
      box.style.setProperty('--mq-dur', `${Math.round(overflow / 28 + 4)}s`);
    }
  }

  // Ảnh bìa chỉ tải lại khi đổi bài; fade ra vào để không nháy.
  async function loadArt(el, unit) {
    const key = `${state.source}|${state.title}`;
    if (unit.__artKey === key) return;
    unit.__artKey = key;
    const art = unit.querySelector('.media-art');
    art.classList.remove('is-on');
    let url = '';
    try {
      url = await invokeCmd('get_media_thumbnail');
    } catch (err) {
      console.warn('get_media_thumbnail lỗi:', err);
    }
    if (unit.__artKey !== key) return;
    if (url) {
      art.style.setProperty('--art', `url("${url}")`);
      art.classList.add('is-on');
    }
  }

  function paint(el) {
    const unit = el.querySelector('.media-unit');
    if (!unit) return;
    applyWidgetTier(el, unit);
    const active = !!(state && state.active && (state.title || state.artist));
    unit.dataset.state = active ? (state.status === 'playing' ? 'playing' : 'paused') : 'idle';
    if (!active) return;
    unit.querySelector('.media-title-text').textContent = state.title || '—';
    unit.querySelector('.media-artist').textContent = state.artist || '';
    fitTitle(unit);
    loadArt(el, unit);
    unit.title = `${state.title}${state.artist ? ' · ' + state.artist : ''}`;
    const set = (act, enabled) => {
      const btn = unit.querySelector(`[data-act="${act}"]`);
      if (btn) btn.disabled = !enabled;
    };
    set('prev', state.can_prev);
    set('next', state.can_next);
    set('back', state.can_seek);
    set('fwd', state.can_seek);
    set('play', state.can_play_pause);
    unit.querySelector('.media-play').innerHTML = state.status === 'playing' ? ICONS.pause : ICONS.play;
    paintBar(unit);
  }

  function all() {
    return document.querySelectorAll('.grid-stack-item[data-type="media_player"]');
  }

  async function syncAll() {
    if (busy || !all().length) return;
    busy = true;
    try {
      const next = await invokeCmd('get_media_state');
      if (next && typeof next === 'object') {
        state = next;
        fetchedAt = performance.now();
      }
    } catch (err) {
      state = null;
      console.warn('get_media_state lỗi:', err);
    } finally {
      busy = false;
    }
    all().forEach(paint);
  }

  // Nội suy thanh tiến trình giữa 2 lần quét để chuyển động mượt.
  function tick() {
    const items = all();
    if (!items.length) return;
    items.forEach((el) => {
      const unit = el.querySelector('.media-unit');
      if (unit && unit.dataset.state === 'playing') paintBar(unit);
    });
  }

  async function control(action, value) {
    try {
      return await invokeCmd('media_control', { action, value });
    } catch (err) {
      console.warn('media_control lỗi:', err);
      return false;
    }
  }

  function setup(el) {
    const unit = el.querySelector('.media-unit');
    if (!unit) return;

    unit.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (!isEditMode) playKeySound();
    });
    unit.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (isEditMode) return;
      if (unit.dataset.state === 'idle') {
        flashKeycap(el, await openUrl(IDLE_URL));
        return;
      }
      const btn = e.target.closest('[data-act]');
      if (!btn || btn.disabled) return;
      const act = btn.dataset.act;
      let ok;
      if (act === 'play') ok = await control('play_pause');
      else if (act === 'next') ok = await control('next');
      else if (act === 'prev') ok = await control('prev');
      else ok = await control('seek_by', act === 'fwd' ? SEEK_STEP_SECS : -SEEK_STEP_SECS);
      flashKeycap(el, ok);
      setTimeout(syncAll, 250);
    });

    // Ch\u1ea1m / k\u00e9o d\u1ea3i \u0111\u00e1y \u0111\u1ec3 tua: v\u00f9ng ch\u1ea1m cao 28px quanh thanh 3px, g\u1eedi l\u1ec7nh c\u00f3 throttle.
    const zone = unit.querySelector('.media-seek-zone');
    let seeking = false;
    let lastSent = 0;
    const ratioAt = (e) => {
      const rect = zone.getBoundingClientRect();
      return rect.width > 0 ? Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) : 0;
    };
    const sendSeek = (ratio) => control('seek_to', ratio * state.duration_secs);
    zone.addEventListener('pointerdown', (e) => {
      if (isEditMode || !state || !state.can_seek || !(state.duration_secs > 0)) return;
      seeking = true;
      unit.classList.add('is-seeking');
      zone.setPointerCapture?.(e.pointerId);
      seekPreview = ratioAt(e);
      paintBar(unit);
    });
    zone.addEventListener('pointermove', (e) => {
      if (!seeking) return;
      seekPreview = ratioAt(e);
      paintBar(unit);
      const now = performance.now();
      if (now - lastSent >= SEEK_THROTTLE_MS) {
        lastSent = now;
        sendSeek(seekPreview);
      }
    });
    const endSeek = async (e) => {
      if (!seeking) return;
      seeking = false;
      unit.classList.remove('is-seeking');
      const ratio = e && e.type === 'pointerup' ? ratioAt(e) : seekPreview;
      if (e && e.type === 'pointerup' && ratio !== null) {
        const ok = await sendSeek(ratio);
        if (ok) {
          state.position_secs = ratio * state.duration_secs;
          fetchedAt = performance.now();
        }
      }
      seekPreview = null;
      paintBar(unit);
      setTimeout(syncAll, 250);
    };
    zone.addEventListener('pointerup', endSeek);
    zone.addEventListener('pointercancel', endSeek);

    paint(el);
    syncAll();
  }

  return { type: 'media_player', markup, setup, syncAll, tick };
}
