import { STORAGE_KEY } from './grid.js';
import { singlePageDoc, writeLayoutDoc, writeLayoutFileDoc } from './layout-store.js';
import { serializeNode } from './layout-helpers.js';

const LAYOUT_SAVE_DEBOUNCE_MS = 300;

/**
 * Gom nhiều thay đổi liên tiếp (kéo thả, slider, pomodoro) thành một lần ghi.
 * `pages` (createDeckPages) giữ các trang; lần ghi nào cũng cập nhật trang đang xem
 * rồi ghi CẢ tài liệu để không mất trang khác.
 * `onSaved` chạy sau mỗi lần ghi thật (dùng để đồng bộ hook bàn phím Bongo Cat).
 */
export function createLayoutPersistence({ grid, pages, getTauri, invokeCmd, onSaved }) {
  // true trong lúc dựng layout ban đầu: tránh ghi đè layout đã lưu bằng trạng thái dở dang.
  let loading = true;
  let saveTimer = null;

  function snapshotDoc() {
    const items = grid.engine.nodes.map(serializeNode);
    if (pages) {
      pages.setActiveWidgets(items);
      return pages.toDoc();
    }
    return singlePageDoc(items);
  }

  function saveCurrentLayout() {
    if (loading || globalThis.__deckRestoring) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushLayout, LAYOUT_SAVE_DEBOUNCE_MS);
  }

  function flushLayout() {
    if (loading || globalThis.__deckRestoring) return;
    clearTimeout(saveTimer);
    saveTimer = null;
    const doc = snapshotDoc();
    if (getTauri()) writeLayoutFileDoc(invokeCmd, doc);
    else writeLayoutDoc(STORAGE_KEY, doc);
    onSaved?.();
    return doc;
  }

  function setLoading(value) {
    loading = !!value;
  }

  return { saveCurrentLayout, flushLayout, setLoading };
}
