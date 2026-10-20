/**
 * Lưu trữ deck: MỘT tài liệu nhiều trang.
 *
 *   { schemaVersion: 3,
 *     pages: [{ id, name, widgets: [...] }],
 *     activePageId }
 *
 * Tương thích ngược:
 *   - mảng phím (bản rất cũ)            -> 1 trang "Trang 1"
 *   - { schemaVersion: 1|2, widgets }   -> 1 trang "Trang 1"
 *
 * Mỗi phím được chuẩn hoá: thêm `id` ổn định và `cfg` là object.
 */
export const LAYOUT_SCHEMA_VERSION = 3;
export const FIRST_PAGE_NAME = 'Trang 1';
const MIN_MIGRATABLE_VERSION = 1;

let idCounter = 0;

function uniqueId(prefix) {
  idCounter += 1;
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }
  return prefix + Date.now().toString(36) + '-' + idCounter.toString(36);
}

/** Sinh id ổn định cho phím. */
export function makeLayoutId() {
  return uniqueId('w-');
}

/** Sinh id cho trang. */
export function makePageId() {
  return uniqueId('p-');
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Nâng danh sách phím: giữ nguyên phím, thêm `id` nếu thiếu và chuẩn hoá `cfg`.
 * Phím rác (thiếu x/y) bị bỏ qua thay vì làm hỏng cả layout.
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

/** Chuẩn hoá 1 trang (giữ id/tên cũ, migrate phím). */
function normalizePage(page, index) {
  const name =
    typeof page?.name === 'string' && page.name.trim() ? page.name.trim() : 'Trang ' + (index + 1);
  return {
    id: typeof page?.id === 'string' && page.id ? page.id : makePageId(),
    name,
    widgets: migrateLayout(page?.widgets, LAYOUT_SCHEMA_VERSION),
  };
}

/** Tạo tài liệu 1 trang từ mảng phím (dùng khi reset/lưu kiểu cũ). */
export function singlePageDoc(items, name = FIRST_PAGE_NAME) {
  return {
    schemaVersion: LAYOUT_SCHEMA_VERSION,
    pages: [{ id: makePageId(), name, widgets: migrateLayout(items) }],
    activePageId: null,
  };
}

/** Chuẩn hoá tài liệu trước khi lưu: bỏ trang không có phím, active luôn hợp lệ. */
export function normalizeLayoutDoc(doc) {
  const rawPages = Array.isArray(doc?.pages) ? doc.pages : [];
  const seen = new Set();
  const pages = rawPages
    .map((page, index) => normalizePage(page, index))
    .map((page) => {
      if (seen.has(page.id)) page.id = makePageId();
      seen.add(page.id);
      return page;
    })
    .filter((page) => page.widgets.length > 0);
  if (!pages.length) return null;
  const wanted = typeof doc?.activePageId === 'string' ? doc.activePageId : null;
  const activePageId = pages.some((page) => page.id === wanted) ? wanted : pages[0].id;
  return { schemaVersion: LAYOUT_SCHEMA_VERSION, pages, activePageId };
}

/** Nâng mọi định dạng cũ lên tài liệu nhiều trang; trả null nếu không có phím. */
export function migrateLayoutDoc(parsed) {
  if (isPlainObject(parsed) && Array.isArray(parsed.pages)) {
    return normalizeLayoutDoc({
      pages: parsed.pages,
      activePageId: parsed.activePageId,
    });
  }
  const items = parseLegacyWidgets(parsed);
  if (!items.length) return null;
  const doc = singlePageDoc(items);
  doc.activePageId = doc.pages[0].id;
  return normalizeLayoutDoc(doc);
}

function parseLegacyWidgets(parsed) {
  if (Array.isArray(parsed)) return migrateLayout(parsed, MIN_MIGRATABLE_VERSION);
  if (!isPlainObject(parsed)) return [];
  const items = Array.isArray(parsed.widgets) ? parsed.widgets : null;
  if (!items) return [];
  const fromVersion = Number(parsed.schemaVersion) || MIN_MIGRATABLE_VERSION;
  return migrateLayout(items, fromVersion);
}

export function getActivePage(doc) {
  if (!doc || !Array.isArray(doc.pages)) return null;
  return doc.pages.find((page) => page.id === doc.activePageId) || doc.pages[0] || null;
}

/* ---------------------------- localStorage ---------------------------- */

export function readSavedLayoutDoc(storageKey) {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return null;
  try {
    const doc = migrateLayoutDoc(JSON.parse(raw));
    if (!doc) throw new Error('layout không có phím hợp lệ');
    return doc;
  } catch (err) {
    console.warn('Layout hỏng, dùng mặc định:', err.message);
    localStorage.removeItem(storageKey);
    return null;
  }
}

export function writeLayoutDoc(storageKey, doc) {
  const normalized = normalizeLayoutDoc(doc);
  if (!normalized) return false;
  try {
    localStorage.setItem(storageKey, JSON.stringify(normalized));
    return true;
  } catch (err) {
    console.warn('Không lưu được layout (đầy bộ nhớ?):', err);
    return false;
  }
}

/* ------------------------------- Tauri -------------------------------- */

/* Ghi tuần tự để bản cũ không bao giờ về sau bản mới. */
let fileWriteChain = Promise.resolve();

export function writeLayoutFileDoc(invoke, doc) {
  const normalized = normalizeLayoutDoc(doc);
  if (!normalized) return fileWriteChain;
  const json = JSON.stringify(normalized);
  fileWriteChain = fileWriteChain
    .then(() => invoke('save_layout', { json }))
    .catch((err) => console.error('Không ghi được layout.json:', err));
  return fileWriteChain;
}

/* Nạp tài liệu; lần đầu trên Tauri thì chuyển localStorage cũ sang file rồi xoá bản cũ. */
export async function loadLayoutDoc(storageKey, invoke) {
  if (!invoke) return readSavedLayoutDoc(storageKey);

  try {
    const raw = await invoke('load_layout');
    if (raw) {
      const parsed = JSON.parse(raw);
      const doc = migrateLayoutDoc(parsed);
      if (doc) {
        // File cũ (v1/v2/array) -> ghi lại dạng nhiều trang để lần sau đọc nhanh.
        if (parsed?.schemaVersion !== LAYOUT_SCHEMA_VERSION) {
          await invoke('save_layout', { json: JSON.stringify(doc) });
        }
        return doc;
      }
    }
  } catch (err) {
    console.warn('Không đọc được layout.json:', err);
  }

  const legacy = readSavedLayoutDoc(storageKey);
  if (legacy) {
    try {
      await invoke('save_layout', { json: JSON.stringify(legacy) });
      localStorage.removeItem(storageKey);
    } catch (err) {
      console.warn('Chuyển layout sang file thất bại, giữ localStorage:', err);
    }
  }
  return legacy;
}

/* ------------------- API kiểu cũ (1 trang, tương thích) --------------- */

export function readSavedLayout(storageKey) {
  const doc = readSavedLayoutDoc(storageKey);
  return doc ? getActivePage(doc).widgets : null;
}

export function writeLayout(storageKey, items) {
  return writeLayoutDoc(storageKey, singlePageDoc(items));
}

export function writeLayoutFile(invoke, items) {
  return writeLayoutFileDoc(invoke, singlePageDoc(items));
}

export async function loadLayout(storageKey, invoke) {
  const doc = await loadLayoutDoc(storageKey, invoke);
  return doc ? getActivePage(doc).widgets : null;
}
