export const LAYOUT_SCHEMA_VERSION = 1;

function getLayoutItems(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && parsed.schemaVersion === LAYOUT_SCHEMA_VERSION && Array.isArray(parsed.widgets)) {
    return parsed.widgets;
  }
  return null;
}

function validLayoutItems(parsed) {
  const items = getLayoutItems(parsed);
  return (
    items?.filter(
      (widget) =>
        widget &&
        typeof widget === 'object' &&
        Number.isFinite(widget.x) &&
        Number.isFinite(widget.y)
    ) || []
  );
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
    localStorage.setItem(storageKey, JSON.stringify(versionedLayout(items)));
  } catch (err) {
    console.warn('Không lưu được layout (đầy bộ nhớ?):', err);
  }
}

/* Ghi tuần tự để bản cũ không bao giờ về sau bản mới. */
let fileWriteChain = Promise.resolve();

export function writeLayoutFile(invoke, items) {
  const json = JSON.stringify(versionedLayout(items));
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
