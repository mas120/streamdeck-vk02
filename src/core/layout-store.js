export const LAYOUT_SCHEMA_VERSION = 2;
const MIN_MIGRATABLE_VERSION = 1;

let idCounter = 0;

/** Sinh id ổn định cho phím (dùng crypto khi có, nếu không thì bộ đếm). */
function makeLayoutId() {
  idCounter += 1;
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }
  return 'w-' + Date.now().toString(36) + '-' + idCounter.toString(36);
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Nâng layout lên schema hiện tại: giữ nguyên phím, thêm `id` nếu thiếu và
 * chuẩn hoá `cfg` thành object. Phím rác (thiếu x/y) bị bỏ qua thay vì làm
 * hỏng cả layout.
 */
export function migrateLayout(items, fromVersion = MIN_MIGRATABLE_VERSION) {
  const version = Number(fromVersion);
  const list = Array.isArray(items) ? items : [];
  const seen = new Set();
  if (!(version >= MIN_MIGRATABLE_VERSION)) return [];
  return list
    .filter(
      (widget) =>
        widget &&
        typeof widget === 'object' &&
        Number.isFinite(widget.x) &&
        Number.isFinite(widget.y)
    )
    .map((widget) => {
      let id = typeof widget.id === 'string' && widget.id ? widget.id : makeLayoutId();
      if (seen.has(id)) id = makeLayoutId();
      seen.add(id);
      return {
        ...widget,
        id,
        cfg: isPlainObject(widget.cfg) ? { ...widget.cfg } : {},
      };
    });
}

function getLayoutItems(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (isPlainObject(parsed) && Array.isArray(parsed.widgets)) return parsed.widgets;
  return null;
}

function parseLayout(parsed) {
  const items = getLayoutItems(parsed);
  if (!items) return [];
  const fromVersion = Array.isArray(parsed)
    ? MIN_MIGRATABLE_VERSION
    : Number(parsed.schemaVersion) || MIN_MIGRATABLE_VERSION;
  return migrateLayout(items, fromVersion);
}

function validLayoutItems(parsed) {
  return parseLayout(parsed);
}

function versionedLayout(items) {
  return { schemaVersion: LAYOUT_SCHEMA_VERSION, widgets: items };
}

/* Đọc layout đã lưu; trả về mảng phím hợp lệ hoặc null (rồi xoá dữ liệu hỏng). */
export function readSavedLayout(storageKey) {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return null;
  try {
    const items = validLayoutItems(JSON.parse(raw));
    if (!items.length) throw new Error('layout không có phím hợp lệ');
    return items;
  } catch (err) {
    console.warn('Layout hỏng, dùng mặc định:', err.message);
    localStorage.removeItem(storageKey);
    return null;
  }
}

export function writeLayout(storageKey, items) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(versionedLayout(migrateLayout(items))));
  } catch (err) {
    console.warn('Không lưu được layout (đầy bộ nhớ?):', err);
  }
}

/* Ghi tuần tự để bản cũ không bao giờ về sau bản mới. */
let fileWriteChain = Promise.resolve();

export function writeLayoutFile(invoke, items) {
  const json = JSON.stringify(versionedLayout(migrateLayout(items)));
  fileWriteChain = fileWriteChain
    .then(() => invoke('save_layout', { json }))
    .catch((err) => console.error('Không ghi được layout.json:', err));
  return fileWriteChain;
}

/* Nạp layout; lần đầu trên Tauri thì chuyển localStorage cũ sang file rồi xoá bản cũ. */
export async function loadLayout(storageKey, invoke) {
  if (!invoke) return readSavedLayout(storageKey);

  try {
    const raw = await invoke('load_layout');
    if (raw) {
      const items = validLayoutItems(JSON.parse(raw));
      if (items.length) return items;
    }
  } catch (err) {
    console.warn('Không đọc được layout.json:', err);
  }

  const legacy = readSavedLayout(storageKey);
  if (legacy) {
    try {
      await invoke('save_layout', { json: JSON.stringify(versionedLayout(legacy)) });
      localStorage.removeItem(storageKey);
    } catch (err) {
      console.warn('Chuyển layout sang file thất bại, giữ localStorage:', err);
    }
  }
  return legacy;
}
