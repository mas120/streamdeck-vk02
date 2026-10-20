/**
 * Phím "đa hành động": chạy lần lượt nhiều action, có thể chèn thời gian chờ.
 *
 * Cú pháp mỗi dòng trong modal:  loại | tham số | chờ-thêm-ms
 *   open_url   | https://youtube.com
 *   launch_app | notepad
 *   set_volume | 30
 *   wait       | 500
 * Dòng trống và dòng bắt đầu bằng # bị bỏ qua. Chờ mặc định giữa các bước: 120ms.
 */
export const MULTI_ACTION_TYPES = ['open_url', 'launch_app', 'set_volume', 'wait'];
export const MULTI_ACTION_GAP_MS = 120;
const MAX_ACTIONS = 20;

export function parseActionLines(text) {
  const lines = String(text || '').split(/\r?\n/);
  const actions = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [rawType, rawTarget = '', rawDelay = ''] = trimmed.split('|').map((part) => part.trim());
    const type = rawType.toLowerCase();
    if (!MULTI_ACTION_TYPES.includes(type)) continue;

    // Dòng `wait | 800` dùng cột tham số làm thời gian chờ.
    if (type === 'wait') {
      const ms = Math.max(0, Math.min(60000, Number(rawTarget) || 0));
      actions.push({ type, target: '', delayMs: ms });
      if (actions.length >= MAX_ACTIONS) break;
      continue;
    }

    const target = rawTarget;
    if (!target) continue;
    if (type === 'set_volume') {
      const level = Number(target);
      if (!Number.isFinite(level) || level < 0 || level > 100) continue;
    }
    const delayMs = Math.max(0, Math.min(60000, Number(rawDelay) || 0));
    actions.push({ type, target, delayMs });
    if (actions.length >= MAX_ACTIONS) break;
  }
  return actions;
}

export function formatActionLines(actions) {
  if (!Array.isArray(actions) || !actions.length) return '';
  return actions
    .map((action) => {
      if (action.type === 'wait') return `wait | ${action.delayMs || 0}`;
      const parts = [action.type, action.target || ''];
      if (action.delayMs) parts.push(String(action.delayMs));
      return parts.join(' | ');
    })
    .join('\n');
}

export function parseActionsCfg(cfg) {
  const list = cfg && Array.isArray(cfg.actions) ? cfg.actions : [];
  return list
    .filter(
      (action) =>
        action &&
        MULTI_ACTION_TYPES.includes(action.type) &&
        (action.type === 'wait' || !!action.target)
    )
    .slice(0, MAX_ACTIONS)
    .map((action) => ({
      type: action.type,
      target: String(action.target || ''),
      delayMs: Math.max(0, Math.min(60000, Number(action.delayMs) || 0)),
    }));
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Chạy tuần tự. `isCancelled()` được kiểm tra trước mỗi bước;
 * trả về số bước đã chạy và cờ huỷ.
 */
export async function runActions(
  actions,
  { callAction, sleep = defaultSleep, onStep, isCancelled, gapMs = MULTI_ACTION_GAP_MS } = {}
) {
  let ran = 0;
  for (let index = 0; index < actions.length; index += 1) {
    if (isCancelled?.()) return { ran, cancelled: true };
    const action = actions[index];
    onStep?.(index + 1, actions.length, action);
    try {
      if (action.type === 'wait') {
        await sleep(action.delayMs || gapMs);
      } else {
        await callAction?.(action.type, action.target);
      }
    } catch (err) {
      console.error('Đa hành động lỗi ở bước', index + 1, err);
      return { ran, cancelled: false, error: err };
    }
    ran += 1;
    if (index < actions.length - 1) {
      await sleep(gapMs + (action.delayMs || 0));
    }
  }
  return { ran, cancelled: false };
}
