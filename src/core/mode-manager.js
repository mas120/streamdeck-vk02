import { getGrid } from './grid.js';

let isEditMode = false;
let keyAudioCtx = null;

export { isEditMode };

export function applyMode() {
  document.body.classList.toggle('edit-mode', isEditMode);
  const grid = getGrid();
  grid.enableMove(isEditMode);
  grid.enableResize(isEditMode);
  document.querySelectorAll('#modeSegment .seg-btn').forEach((btn) => {
    btn.classList.toggle('active', (btn.dataset.mode === 'edit') === isEditMode);
  });
}

export function setEditMode(on) {
  isEditMode = !!on;
  applyMode();
}

export function keyContent(el) {
  return el.querySelector('.grid-stack-item-content') || el;
}

export function isSliderWidget(el) {
  const type = el.dataset.type;
  return type === 'volume_slider' || type === 'app_slider';
}

// Nạp sẵn vài biến thể tiếng gõ vào RAM; phát bằng BufferSource nên không tốn chi phí tổng hợp lúc chạm.
const SOUND_RATE = 44100;
const SOUND_VARIANTS = [
  { pitch: 190, noise: 0.35, len: 0.045 },
  { pitch: 230, noise: 0.3, len: 0.04 },
  { pitch: 160, noise: 0.4, len: 0.05 },
];
let keyBuffers = null;

function buildKeyBuffers(ctx) {
  return SOUND_VARIANTS.map(({ pitch, noise, len }) => {
    const n = Math.floor(ctx.sampleRate * len);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) {
      const t = i / ctx.sampleRate;
      const env = Math.exp(-t * 90);
      const click = i < 40 ? (Math.random() * 2 - 1) * (1 - i / 40) : 0;
      data[i] =
        (Math.sin(2 * Math.PI * pitch * t) * 0.8 + (Math.random() * 2 - 1) * noise) * env * 0.6 +
        click * 0.5;
    }
    return buf;
  });
}

function ensureKeyAudio() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!keyAudioCtx) {
    keyAudioCtx = new Ctx({ latencyHint: 'interactive', sampleRate: SOUND_RATE });
    keyBuffers = buildKeyBuffers(keyAudioCtx);
  }
  if (keyAudioCtx.state === 'suspended') keyAudioCtx.resume();
  return keyAudioCtx;
}

// Mở khoá AudioContext ở lần chạm đầu để phím đầu tiên cũng có tiếng.
window.addEventListener('pointerdown', ensureKeyAudio, { once: true, capture: true });

export function playKeySound() {
  try {
    const ctx = ensureKeyAudio();
    if (!ctx || !keyBuffers) return;
    const src = ctx.createBufferSource();
    src.buffer = keyBuffers[Math.floor(Math.random() * keyBuffers.length)];
    src.playbackRate.value = 0.94 + Math.random() * 0.12;
    src.connect(ctx.destination);
    src.start();
  } catch (_) {}
}

function spawnRipple(el) {
  const content = keyContent(el);
  const ripple = document.createElement('span');
  ripple.className = 'key-ripple';
  content.appendChild(ripple);
  ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
}

export function pressFeedback(el) {
  keyContent(el).classList.add('keycap-pressed');
  spawnRipple(el);
  playKeySound();
}

export function releaseFeedback(el) {
  keyContent(el).classList.remove('keycap-pressed');
}

export function flashKeycap(el, ok) {
  const content = keyContent(el);
  const className = ok ? 'status-success' : 'status-error';
  content.classList.remove('status-success', 'status-error');
  clearTimeout(content.__statusTimer);
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      content.classList.add(className);
      content.__statusTimer = setTimeout(() => content.classList.remove(className), 930);
    })
  );
}
