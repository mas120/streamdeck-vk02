import { STORAGE_KEY } from './grid.js';
import { writeLayout, writeLayoutFile } from './layout-store.js';
import { serializeNode } from './layout-helpers.js';

const LAYOUT_SAVE_DEBOUNCE_MS = 300;

/**
 * Gom nhiều thay đổi liên tiếp (kéo thả, slider, pomodoro) thành một lần ghi.
 * `onSaved` chạy sau mỗi lần ghi thật (dùng để đồng bộ hook bàn phím Bongo Cat).
 */
export function createLayoutPersistence({ grid, getTauri, invokeCmd, onSaved }) {
  // true trong lúc dựng layout ban đầu: tránh ghi đè layout đã lưu bằng trạng thái dở dang.
  let loading = true;
  let saveTimer = null;

  function saveCurrentLayout() {
    if (loading) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushLayout, LAYOUT_SAVE_DEBOUNCE_MS);
  }

  function flushLayout() {
    if (loading) return;
    clearTimeout(saveTimer);
    saveTimer = null;
    const items = grid.engine.nodes.map(serializeNode);
    if (getTauri()) writeLayoutFile(invokeCmd, items);
    else writeLayout(STORAGE_KEY, items);
    onSaved?.();
  }

  function setLoading(value) {
    loading = !!value;
  }

  return { saveCurrentLayout, flushLayout, setLoading };
}
