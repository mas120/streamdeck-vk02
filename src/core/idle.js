import { getAppConfig, updateAppConfig } from './config-store.js';

const WAKE_THROTTLE_MS = 500;
/** Sự kiện báo deck vừa tối / vừa thức để scheduler nền dừng hoặc chạy lại. */
const IDLE_EVENT = 'deck-idle-change';

/** Độ sáng "màn hình" toàn deck (30%-130%) qua biến CSS --screen-brightness. */
function initBrightness() {
  const range = document.getElementById('brightnessRange');
  const label = document.getElementById('brightnessValue');
  if (!range) return;

  const apply = (percent) => {
    const val = Math.max(0.3, Math.min(1.3, percent / 100));
    document.documentElement.style.setProperty('--screen-brightness', String(val));
    if (label) label.textContent = Math.round(percent) + '%';
  };

  range.value = String(getAppConfig().brightness);
  apply(parseInt(range.value, 10) || 100);
  range.addEventListener('input', () => {
    const v = parseInt(range.value, 10) || 100;
    apply(v);
    updateAppConfig({ brightness: v });
  });
  // Không để thao tác trên nền deck cướp cú kéo thanh trượt
  range.addEventListener('pointerdown', (e) => e.stopPropagation());
}

/** Screensaver: sau X giây không tương tác thì tối màn; chạm vào là "thức" (X=0 -> tắt). */
function initIdle(onWake) {
  let idleMs = getAppConfig().idleMs;
  let timer = null;
  let lastWakeAt = 0;

  function wake(force = false) {
    const body = document.body;
    const wasIdle = body.classList.contains('idle');
    const now = performance.now();
    // pointermove bắn hàng trăm lần/giây: chỉ đặt lại bộ đếm tối đa 2 lần/giây.
    if (!force && !wasIdle && now - lastWakeAt < WAKE_THROTTLE_MS) return;
    lastWakeAt = now;
    body.classList.remove('idle');
    clearTimeout(timer);
    if (idleMs > 0) timer = setTimeout(goIdle, idleMs);
    if (wasIdle) {
      window.dispatchEvent(new CustomEvent(IDLE_EVENT, { detail: { idle: false } }));
      onWake();
    }
  }

  function goIdle() {
    document.body.classList.add('idle');
    window.dispatchEvent(new CustomEvent(IDLE_EVENT, { detail: { idle: true } }));
  }

  // Chạm đánh thức lúc đang tối: nuốt cả chuỗi pointer/click để không kích hoạt ô bên dưới.
  let swallowUntil = 0;
  const swallow = (e) => { e.stopPropagation(); e.preventDefault(); };
  window.addEventListener('pointerdown', (e) => {
    if (!document.body.classList.contains('idle')) return;
    swallowUntil = performance.now() + 700;
    swallow(e);
    wake(true);
  }, { capture: true });
  ['pointerup', 'click', 'touchstart', 'touchend', 'mousedown', 'mouseup'].forEach((ev) =>
    window.addEventListener(ev, (e) => {
      if (performance.now() < swallowUntil) swallow(e);
    }, { capture: true })
  );

  // Dịch nhẹ nội dung mỗi phút khi tối để giảm lưu ảnh trên panel.
  const root = document.documentElement;
  setInterval(() => {
    if (!document.body.classList.contains('idle')) { root.style.removeProperty('--shift-x'); root.style.removeProperty('--shift-y'); return; }
    root.style.setProperty('--shift-x', (Math.floor(Math.random() * 5) - 2) + 'px');
    root.style.setProperty('--shift-y', (Math.floor(Math.random() * 5) - 2) + 'px');
  }, 60000);

  ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'].forEach((ev) =>
    window.addEventListener(ev, () => wake(), { passive: true })
  );
  wake(true);

  const select = document.getElementById('settingsIdle');
  if (select) {
    select.value = String(idleMs);
    select.addEventListener('change', () => {
      idleMs = parseInt(select.value, 10) || 0;
      updateAppConfig({ idleMs });
      wake(true);
    });
  }
}

/** onWake: gọi khi deck vừa thức dậy từ trạng thái tối (vòng quét nền đã tạm dừng). */
export function initDisplaySettings({ onWake }) {
  initBrightness();
  initIdle(onWake);
}
