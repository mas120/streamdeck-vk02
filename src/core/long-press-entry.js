const HOLD_MS = 1500;
const RING_DELAY_MS = 250;
const MOVE_SLOP = 8;
const RING_R = 30;

function createRing() {
  const ring = document.createElement('div');
  ring.className = 'longpress-ring';
  ring.innerHTML = `<svg viewBox="0 0 72 72" aria-hidden="true">
    <circle class="longpress-ring-track" cx="36" cy="36" r="${RING_R}"/>
    <circle class="longpress-ring-fill" cx="36" cy="36" r="${RING_R}"/>
  </svg>`;
  ring.style.setProperty('--lp-circ', String(2 * Math.PI * RING_R));
  ring.style.setProperty('--lp-dur', `${HOLD_MS - RING_DELAY_MS}ms`);
  return ring;
}

/** Giữ ô trống ở Run Mode đủ lâu -> vào Edit Mode (vòng tiến trình hiện sau RING_DELAY_MS). */
export function setupLongPressEntry({ viewport, isEditMode, enterEditMode }) {
  let ring = null;
  let ringTimer = 0;
  let holdTimer = 0;
  let startX = 0;
  let startY = 0;
  let activeId = null;
  let swallowClick = false;

  const cancel = () => {
    clearTimeout(ringTimer);
    clearTimeout(holdTimer);
    activeId = null;
    if (ring) { ring.remove(); ring = null; }
  };

  viewport.addEventListener('pointerdown', (e) => {
    swallowClick = false;
    if (isEditMode() || e.button || e.target.closest('.grid-stack-item')) return;
    cancel();
    swallowClick = false;
    activeId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    ringTimer = setTimeout(() => {
      ring = createRing();
      ring.style.left = `${startX}px`;
      ring.style.top = `${startY}px`;
      document.body.appendChild(ring);
    }, RING_DELAY_MS);
    holdTimer = setTimeout(() => {
      cancel();
      swallowClick = true;
      enterEditMode();
    }, HOLD_MS);
  });

  // Nhả tay sau long-press sẽ phát click lên ô trống: không để nó mở bảng tạo phím.
  viewport.addEventListener('click', (e) => {
    if (!swallowClick) return;
    swallowClick = false;
    e.stopPropagation();
  }, true);

  viewport.addEventListener('pointermove', (e) => {
    if (e.pointerId !== activeId) return;
    if (Math.hypot(e.clientX - startX, e.clientY - startY) > MOVE_SLOP) cancel();
  });
  viewport.addEventListener('pointerup', (e) => { if (e.pointerId === activeId) cancel(); });
  viewport.addEventListener('pointercancel', (e) => { if (e.pointerId === activeId) cancel(); });

  // WebView2 phát contextmenu khi giữ ngón tay lâu.
  viewport.addEventListener('contextmenu', (e) => {
    if (!isEditMode() && !e.target.closest('.grid-stack-item')) e.preventDefault();
  });
}
