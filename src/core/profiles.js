/**
 * Profile theo ứng dụng đang focus: map tên exe -> id trang deck.
 *
 * Lưu localStorage (không cần file riêng): { enabled, map: { 'chrome.exe': pageId } }.
 * Polling chỉ chạy khi `enabled`; bỏ qua khi đang Edit Mode hoặc đang khôi phục.
 */
export const PROFILE_STORAGE_KEY = 'STREAMDECK_VK02_PROFILES';
export const PROFILE_POLL_MS = 1000;
export const SELF_PROCESS = 'streamdeck-vk02.exe';
const MAX_PROFILES = 50;

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Chuẩn hoá dữ liệu đọc từ localStorage. */
export function sanitizeProfiles(raw) {
  const src = isObject(raw) ? raw : {};
  const map = {};
  let count = 0;
  if (isObject(src.map)) {
    for (const [key, value] of Object.entries(src.map)) {
      if (count >= MAX_PROFILES) break;
      const process = String(key || '')
        .trim()
        .toLowerCase();
      const pageId = typeof value === 'string' ? value.trim() : '';
      if (!process || !pageId) continue;
      map[process] = pageId;
      count += 1;
    }
  }
  return { enabled: src.enabled === true, map };
}

export function loadProfiles(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(PROFILE_STORAGE_KEY);
    return sanitizeProfiles(raw ? JSON.parse(raw) : null);
  } catch {
    return sanitizeProfiles(null);
  }
}

export function saveProfiles(profiles, storage = globalThis.localStorage) {
  const clean = sanitizeProfiles(profiles);
  try {
    storage?.setItem(PROFILE_STORAGE_KEY, JSON.stringify(clean));
  } catch (err) {
    console.warn('Không lưu được profile ứng dụng:', err);
  }
  return clean;
}

/**
 * Trang cần chuyển tới cho tiến trình đang focus, hoặc null.
 * Bỏ qua chính app deck để không tự chuyển khi người dùng quay lại panel.
 */
export function resolveProfilePage(profiles, processName, selfProcess = SELF_PROCESS) {
  const name = String(processName || '')
    .trim()
    .toLowerCase();
  if (!name || name === String(selfProcess || '').toLowerCase()) return null;
  const clean = sanitizeProfiles(profiles);
  if (!clean.enabled) return null;
  return clean.map[name] || null;
}

/**
 * Vòng poll 1 giây. `isEnabled` đọc lại cấu hình mỗi nhịp để bật/tắt tức thì.
 * `shouldPause` dùng để dừng khi Edit Mode / khôi phục.
 */
export function createProfileWatcher({
  invokeCmd,
  getTauri,
  getActivePageId,
  switchPage,
  getProfiles,
  shouldPause,
  intervalMs = PROFILE_POLL_MS,
}) {
  let timer = null;
  let running = false;

  async function tick() {
    if (running) return;
    const profiles = getProfiles?.() || sanitizeProfiles(null);
    if (!getTauri?.() || !profiles.enabled || shouldPause?.()) return;
    running = true;
    try {
      const processName = await invokeCmd('get_foreground_process');
      const target = resolveProfilePage(profiles, processName);
      if (target && target !== getActivePageId()) switchPage(target);
    } catch (err) {
      // Không có cửa sổ foreground / lỗi tạm thời: bỏ qua nhịp này.
      console.debug('profile: bỏ qua nhịp', err);
    } finally {
      running = false;
    }
  }

  function start() {
    stop();
    if (!getTauri?.()) return false;
    timer = setInterval(tick, intervalMs);
    return true;
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { start, stop, tick };
}
