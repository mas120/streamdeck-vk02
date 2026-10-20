/**
 * Sao lưu / khôi phục toàn bộ dữ liệu deck: layout + cấu hình + việc cần làm.
 *
 * File sao lưu là JSON thuần, tự mô tả:
 *   { app: 'streamdeck-vk02', version: 1, createdAt, layout: {schemaVersion, widgets}, config, todo }
 *
 * - Xuất: tải file qua Blob (chạy được cả web và WebView2).
 * - Nhập: đọc file, validate, ghi đè layout/config (qua IPC hoặc localStorage) rồi tải lại app.
 */
import { migrateLayout, migrateLayoutDoc, singlePageDoc } from './layout-store.js';

export const BACKUP_VERSION = 1;
export const BACKUP_APP_ID = 'streamdeck-vk02';
export const TODO_STORAGE_KEY = 'STREAMDECK_VK02_TODO';
const BRIGHTNESS_KEY = 'STREAMDECK_VK02_BRIGHTNESS';
const IDLE_KEY = 'STREAMDECK_VK02_IDLE_MS';

const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

/** Gom dữ liệu hiện tại thành object sao lưu (layout là tài liệu nhiều trang v3). */
export function createBackup({ layout, config, todo, now = new Date() }) {
  return {
    app: BACKUP_APP_ID,
    version: BACKUP_VERSION,
    createdAt: now.toISOString(),
    layout: normalizeLayout(layout),
    config: isObject(config) ? config : {},
    todo: todo ?? null,
  };
}

function normalizeLayout(layout) {
  const doc = migrateLayoutDoc(layout);
  if (doc) return doc;
  const items = Array.isArray(layout) ? layout : [];
  const fallback = singlePageDoc(migrateLayout(items));
  fallback.activePageId = fallback.pages[0]?.id || null;
  return fallback;
}

/**
 * Kiểm tra file sao lưu trước khi ghi đè. Trả `{ ok, error?, backup? }`.
 * Chấp nhận file cũ chỉ có `layout` dạng mảng hoặc `{widgets}`.
 */
export function validateBackup(raw) {
  let data = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      return { ok: false, error: 'File không phải JSON hợp lệ.' };
    }
  }
  if (!isObject(data)) return { ok: false, error: 'Nội dung sao lưu không hợp lệ.' };
  if (data.app && data.app !== BACKUP_APP_ID) {
    return { ok: false, error: 'File sao lưu này của ứng dụng khác.' };
  }
  const rawLayout = data.layout;
  const widgets = Array.isArray(rawLayout)
    ? rawLayout
    : isObject(rawLayout) && Array.isArray(rawLayout.widgets)
      ? rawLayout.widgets
      : isObject(rawLayout) && Array.isArray(rawLayout.pages)
        ? rawLayout.pages.flatMap((page) => (Array.isArray(page?.widgets) ? page.widgets : []))
        : null;
  if (!widgets) return { ok: false, error: 'Thiếu danh sách phím (layout) trong file.' };
  if (!widgets.length) return { ok: false, error: 'Layout trong file đang trống.' };

  const doc = migrateLayoutDoc(rawLayout);
  if (!doc) return { ok: false, error: 'Không có phím hợp lệ trong file.' };

  return {
    ok: true,
    backup: {
      app: BACKUP_APP_ID,
      version: Number(data.version) || 1,
      createdAt: typeof data.createdAt === 'string' ? data.createdAt : '',
      layout: doc,
      config: isObject(data.config) ? data.config : {},
      todo: data.todo ?? null,
    },
  };
}

/** Tổng số phím trong tài liệu nhiều trang. */
export function countWidgets(doc) {
  return (doc?.pages || []).reduce(
    (total, page) => total + (Array.isArray(page.widgets) ? page.widgets.length : 0),
    0
  );
}

/**
 * Ghi đè dữ liệu bằng bản sao lưu.
 * `invoke` là hàm IPC (null khi chạy web) — web ghi localStorage.
 */
export async function restoreBackup(backup, { invoke } = {}) {
  // Chặn mọi lần ghi layout đang chờ (debounce/pagehide) ghi đè bản vừa khôi phục.
  globalThis.__deckRestoring = true;
  try {
    const layoutJson = JSON.stringify(backup.layout);
    if (invoke) {
      await invoke('save_layout', { json: layoutJson });
      await invoke('save_app_config', { json: JSON.stringify(backup.config) });
    } else {
      localStorage.setItem('STREAMDECK_VK02_LAYOUT', layoutJson);
      if (Number.isFinite(Number(backup.config.brightness))) {
        localStorage.setItem(BRIGHTNESS_KEY, String(backup.config.brightness));
      }
      if (Number.isFinite(Number(backup.config.idleMs))) {
        localStorage.setItem(IDLE_KEY, String(backup.config.idleMs));
      }
    }
    if (backup.todo !== null && backup.todo !== undefined) {
      localStorage.setItem(
        TODO_STORAGE_KEY,
        typeof backup.todo === 'string' ? backup.todo : JSON.stringify(backup.todo)
      );
    }
    return countWidgets(backup.layout);
  } catch (err) {
    globalThis.__deckRestoring = false;
    throw err;
  }
}

/** Tên file gợi ý khi tải về. */
export function backupFileName(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    'streamdeck-backup-' +
    now.getFullYear() +
    pad(now.getMonth() + 1) +
    pad(now.getDate()) +
    '-' +
    pad(now.getHours()) +
    pad(now.getMinutes()) +
    '.json'
  );
}

/** Tải file JSON về máy (web + WebView2). */
export function downloadBackup(backup, filename = backupFileName()) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' })
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return filename;
}
