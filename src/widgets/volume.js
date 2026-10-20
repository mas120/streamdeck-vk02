import { isEditMode, playKeySound } from '../core/mode-manager.js';
import { clampInt } from '../core/utils.js';
import { volumeValueFromKey } from './volume-controls.js';

const CAPSULE_THROTTLE_MS = 20;
let runtime = null;

export const VOL_GLYPH = `<svg class="vol-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M11 5 6 9H2v6h4l5 4z"/>
  <path class="vg-w1" d="M15.5 8.5a5 5 0 0 1 0 7"/>
  <path class="vg-w2" d="M19 5a10 10 0 0 1 0 14"/>
  <g class="vg-x"><path d="m16 9 6 6"/><path d="m22 9-6 6"/></g></svg>`;
export const volLevel = (pct) => (pct <= 0 ? '0' : pct <= 40 ? '1' : '2');
export const isDefaultVolIcon = (ic) => !ic || ic === '⭐' || ic === '⏹️' || ic === '🔊';

export function volumeMarkup(icon, pct) {
  const value = clampInt(pct, 0, 100, 50);
  return `
    <div class="volume-deck-unit" data-orient="h" data-state="active" data-level="${volLevel(value)}"
         style="--fill-percent:${value}">
      <div class="volume-core">
        <button type="button" class="vol-icon app-icon-btn"
                aria-label="Tắt/bật tiếng hệ thống">${icon}</button>
        <span class="vol-label">Âm lượng</span>
        <span class="vol-number">${value}%</span>
      </div>
      <div class="volume-track" role="slider" tabindex="0" aria-label="Âm lượng hệ thống"
           aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value}"
           aria-valuetext="${value}%" aria-orientation="horizontal">
        <span class="volume-fill" aria-hidden="true"></span>
      </div>
    </div>
  `;
}

export function applyVolumeOrient(el, unit) {
  const node = el.gridstackNode || {};
  const w = Number(node.w) || 1;
  const h = Number(node.h) || 1;
  const orient = h > w ? 'v' : 'h';
  if (unit.dataset.orient !== orient) unit.dataset.orient = orient;
  unit
    .querySelector('.volume-track')
    ?.setAttribute('aria-orientation', orient === 'v' ? 'vertical' : 'horizontal');
  return orient;
}

function updateSliderValue(unit, pct) {
  const slider = unit.querySelector('.volume-track');
  if (!slider) return;
  const value = clampInt(pct, 0, 100, 50);
  slider.setAttribute('aria-valuenow', String(value));
  slider.setAttribute('aria-valuetext', `${value}%`);
}

export function wireCapsuleDrag(widgetEl, unit, onRatio, onEnd) {
  let dragging = false;
  let engaged = false; // tay đã di chuyển đủ xa để tính là VUỐT chưa
  let downX = 0;
  let downY = 0;
  let lastRunAt = -Infinity;
  let pending = null; // tỉ lệ 0..1 đang chờ flush
  let flushTimer = null;

  const isVertical = () => unit.dataset.orient === 'v';

  /* NGƯỠNG CHỐNG CHẠM NHẦM: phải di chuyển > 8px mới bắt đầu đổi giá trị.
     Trước đây pointerdown ghi giá trị ngay -> một cú chạm lỡ (lòng bàn tay,
     ngón út quệt qua) làm âm lượng nhảy thẳng về vị trí ngón tay. */
  const DRAG_ENGAGE_PX = 8;

  function ratioAt(clientX, clientY) {
    const rect = unit.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const raw = isVertical()
      ? (rect.bottom - clientY) / rect.height
      : (clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(1, raw));
  }

  /* immediate = ghi NGAY (nhịp flush giữa chừng / giá trị cuối khi nhả tay);
     còn lại gom theo nhịp CAPSULE_THROTTLE_MS (20ms). */
  function apply(ratio, immediate) {
    const now = performance.now();
    if (!immediate && now - lastRunAt < CAPSULE_THROTTLE_MS) {
      pending = ratio;
      if (flushTimer === null) {
        flushTimer = setTimeout(() => {
          flushTimer = null;
          const queued = pending;
          pending = null;
          if (queued !== null) apply(queued, true);
        }, CAPSULE_THROTTLE_MS);
      }
      return;
    }
    lastRunAt = now;
    pending = null;
    onRatio(ratio);
  }

  unit.addEventListener('pointerdown', (e) => {
    if (isEditMode) return; // Edit Mode: nhường cho kéo/đổi cỡ
    if (e.button) return; // chỉ chuột trái / cảm ứng
    if (e.target.closest && e.target.closest('.app-icon-btn')) return; // nút mute
    playKeySound();
    dragging = true;
    engaged = false;
    downX = e.clientX;
    downY = e.clientY;
    widgetEl.dataset.dragging = '1';
    e.stopPropagation(); // không cho GridStack cướp cử chỉ
    if (unit.setPointerCapture) {
      try {
        unit.setPointerCapture(e.pointerId);
      } catch (_) {
        /* WebView cũ */
      }
    }
    // KHÔNG ghi giá trị ở đây: chờ vượt DRAG_ENGAGE_PX (xem giải thích phía trên).
  });

  unit.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    if (!engaged) {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) < DRAG_ENGAGE_PX) return;
      engaged = true; // đã vuốt thật -> bắt đầu ghi mức
    }
    const ratio = ratioAt(e.clientX, e.clientY);
    if (ratio !== null) apply(ratio, false);
  });

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    widgetEl.dataset.dragging = '0';
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (pending !== null) {
      // flush mức cuối cùng
      const queued = pending;
      pending = null;
      apply(queued, true);
    }
    onEnd?.();
  }
  unit.addEventListener('pointerup', endDrag);
  unit.addEventListener('pointercancel', endDrag);

  // Chặn cử chỉ cổ điển (một số WebView vẫn phát mouse/touch song song)
  ['mousedown', 'touchstart'].forEach((evt) => {
    unit.addEventListener(
      evt,
      (e) => {
        if (!isEditMode) e.stopPropagation();
      },
      { passive: false }
    );
  });
}

function setupTouchSlider(container, widgetEl) {
  const unit = container.querySelector('.volume-deck-unit');
  if (!unit) return;
  const valText = unit.querySelector('.vol-number');
  const iconBtn = unit.querySelector('.vol-icon');
  const slider = unit.querySelector('.volume-track');
  applyVolumeOrient(widgetEl, unit);
  widgetEl.dataset.muted = '0';

  wireCapsuleDrag(
    widgetEl,
    unit,
    (ratio) => {
      const pct = ratio * 100;
      unit.style.setProperty('--fill-percent', pct.toFixed(1)); // đổi fill NGAY
      if (valText) valText.innerText = Math.round(pct) + '%';
      unit.dataset.level = volLevel(Math.round(pct));
      widgetEl.dataset.target = Math.round(pct);
      updateSliderValue(unit, pct);
      // Tay đang chủ động chọn mức -> tự bỏ trạng thái tắt tiếng (cả mute THẬT của
      // Windows: đổi âm lượng qua API không tự bỏ mute như khi bấm phím cứng)
      if (widgetEl.dataset.muted === '1') {
        setVolumeMuted(unit, widgetEl, false);
        runtime.setSystemMute(false);
      }
      runtime.sendSystemVolume(Math.round(pct)); // IPC sang Rust (gộp nhịp)
    },
    () => runtime.saveCurrentLayout()
  );

  slider?.addEventListener('keydown', (event) => {
    if (isEditMode) return;
    const current = clampInt(widgetEl.dataset.target, 0, 100, 50);
    const next = volumeValueFromKey(current, event.key, event.shiftKey);
    if (next === null) return;

    event.preventDefault();
    event.stopPropagation();
    if (next === current) return;
    unit.style.setProperty('--fill-percent', String(next));
    if (valText) valText.textContent = `${next}%`;
    unit.dataset.level = volLevel(next);
    widgetEl.dataset.target = String(next);
    updateSliderValue(unit, next);
    if (widgetEl.dataset.muted === '1') {
      setVolumeMuted(unit, widgetEl, false);
      runtime.setSystemMute(false);
    }
    runtime.sendSystemVolume(next);
    runtime.saveCurrentLayout();
  });

  // --- BẤM icon squircle -> TẮT/BẬT TIẾNG toàn hệ thống ---
  // Dùng mute THẬT của Windows (set_master_mute): mức âm lượng giữ nguyên nên khi bật
  // lại vẫn đúng chỗ đang nghe và các app khác thấy đúng trạng thái tắt tiếng.
  iconBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    if (!isEditMode) playKeySound();
  });
  iconBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (runtime.didDragJustHappen()) return;
    const wasMuted = widgetEl.dataset.muted === '1';
    setVolumeMuted(unit, widgetEl, !wasMuted); // đổi HÌNH ngay
    const ok = await runtime.setSystemMute(!wasMuted);
    if (!ok) setVolumeMuted(unit, widgetEl, wasMuted); // lỗi -> trả hình về như cũ
    runtime.flashKeycap(widgetEl, ok);
  });
}

/** Đổi trạng thái tắt tiếng của phím âm lượng hệ thống (CHỈ đổi hình, không IPC).
    - Giữ nguyên MỨC trong layout/số % -> người dùng biết sẽ bật lại về đâu;
      CSS .volume-deck-unit.is-muted lo phần track xám + icon viền đỏ. */
export function setVolumeMuted(unit, widgetEl, muted) {
  const pct = clampInt(widgetEl.dataset.target, 0, 100, 50);
  widgetEl.dataset.muted = muted ? '1' : '0';
  unit.classList.toggle('is-muted', muted);
  unit.dataset.level = volLevel(pct);
  unit.dataset.state = muted ? 'muted' : pct > 0 ? 'active' : 'idle';
  const iconBtn = unit.querySelector('.vol-icon');
  if (iconBtn) iconBtn.classList.toggle('muted', muted);
  unit.style.setProperty('--fill-percent', String(pct));
  const valText = unit.querySelector('.vol-number');
  if (valText) valText.innerText = pct + '%';
  updateSliderValue(unit, pct);
}

/* 6c. Slider âm lượng PER-APP — vuốt ở BẤT KỲ ĐÂU trên bề mặt ô.
   wireCapsuleDrag đã throttle 20ms; sau đó gom tiếp 1 lần/frame (rAF) thành
   đúng 1 lệnh IPC nên kéo liên tục cũng không spam Rust. */

export function createVolumeWidget(services) {
  runtime = services;
  return {
    type: 'volume_slider',
    markup: volumeMarkup,
    setup: setupTouchSlider,
    register(el) {
      const unit = el.querySelector('.volume-deck-unit');
      return unit
        ? { el, type: 'volume_slider', unit, value: unit.querySelector('.vol-number') }
        : null;
    },
    update(entry, state) {
      if (entry && state) setVolumeMuted(entry.unit, entry.el, !!state.muted);
    },
    setMuted: setVolumeMuted,
    destroy() {},
  };
}
