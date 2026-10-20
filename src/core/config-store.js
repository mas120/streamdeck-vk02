/* Cài đặt hệ thống: config.json (Tauri) hoặc localStorage (trình duyệt). */
const BRIGHTNESS_KEY = 'STREAMDECK_VK02_BRIGHTNESS';
const IDLE_KEY = 'STREAMDECK_VK02_IDLE_MS';

export const DEFAULT_CONFIG = Object.freeze({ version: 1, brightness: 100, idleMs: 45000 });

let current = { ...DEFAULT_CONFIG };
let invokeFn = null;
let writeChain = Promise.resolve();

function sanitize(src) {
  const out = { ...DEFAULT_CONFIG };
  const b = Number(src && src.brightness);
  if (Number.isFinite(b) && b >= 30 && b <= 130) out.brightness = Math.round(b);
  const i = Number(src && src.idleMs);
  if (Number.isFinite(i) && i >= 0) out.idleMs = Math.round(i);
  return out;
}

function readLegacy() {
  const b = localStorage.getItem(BRIGHTNESS_KEY);
  const i = localStorage.getItem(IDLE_KEY);
  if (b === null && i === null) return null;
  return sanitize({
    brightness: b === null ? undefined : parseInt(b, 10),
    idleMs: i === null ? undefined : parseInt(i, 10),
  });
}

function clearLegacy() {
  localStorage.removeItem(BRIGHTNESS_KEY);
  localStorage.removeItem(IDLE_KEY);
}

function persist() {
  if (!invokeFn) {
    try {
      localStorage.setItem(BRIGHTNESS_KEY, String(current.brightness));
      localStorage.setItem(IDLE_KEY, String(current.idleMs));
    } catch (err) {
      console.warn('Không lưu được cài đặt:', err);
    }
    return;
  }
  const json = JSON.stringify(current);
  writeChain = writeChain
    .then(() => invokeFn('save_app_config', { json }))
    .catch((err) => console.error('Không ghi được config.json:', err));
}

/* Nạp config; lần đầu trên Tauri thì chuyển localStorage cũ sang file rồi dọn. */
export async function loadAppConfig(invoke) {
  invokeFn = invoke || null;
  if (!invokeFn) {
    current = readLegacy() || { ...DEFAULT_CONFIG };
    return { ...current };
  }
  try {
    const raw = await invokeFn('load_app_config');
    if (raw) {
      current = sanitize(JSON.parse(raw));
      clearLegacy();
      return { ...current };
    }
  } catch (err) {
    console.warn('Không đọc được config.json:', err);
  }
  const legacy = readLegacy();
  if (legacy) {
    current = legacy;
    try {
      await invokeFn('save_app_config', { json: JSON.stringify(current) });
      clearLegacy();
    } catch (err) {
      console.warn('Chuyển config sang file thất bại, giữ localStorage:', err);
    }
  }
  return { ...current };
}

export function getAppConfig() {
  return { ...current };
}

export function updateAppConfig(patch) {
  current = sanitize({ ...current, ...patch });
  persist();
}
