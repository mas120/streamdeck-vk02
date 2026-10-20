/**
 * Trạng thái nhiều trang deck (không đụng DOM).
 * Tài liệu vào/ra đúng schema của layout-store; trang luôn có ít nhất 1 phần tử.
 */
import { FIRST_PAGE_NAME, LAYOUT_SCHEMA_VERSION, makePageId } from './layout-store.js';

function ensureDoc(doc) {
  const pages =
    Array.isArray(doc?.pages) && doc.pages.length
      ? doc.pages.map((page, index) => ({
          id: page?.id || makePageId(),
          name:
            typeof page?.name === 'string' && page.name.trim()
              ? page.name.trim()
              : 'Trang ' + (index + 1),
          widgets: Array.isArray(page?.widgets) ? page.widgets : [],
        }))
      : [{ id: makePageId(), name: FIRST_PAGE_NAME, widgets: [] }];
  const wanted = doc?.activePageId;
  return {
    pages,
    activePageId: pages.some((page) => page.id === wanted) ? wanted : pages[0].id,
  };
}

export function createDeckPages(initialDoc) {
  let state = ensureDoc(initialDoc);

  const list = () => state.pages;
  const count = () => state.pages.length;
  const activeId = () => state.activePageId;
  const active = () => state.pages.find((page) => page.id === state.activePageId) || state.pages[0];
  const activeIndex = () => state.pages.findIndex((page) => page.id === state.activePageId);

  function setActive(id) {
    if (!state.pages.some((page) => page.id === id)) return false;
    state.activePageId = id;
    return true;
  }

  function next(step = 1) {
    const index = Math.max(0, activeIndex());
    const size = state.pages.length;
    const target = (index + step + size * 2) % size;
    state.activePageId = state.pages[target].id;
    return state.pages[target];
  }

  function addPage(name, widgets = []) {
    const index = count() + 1;
    const page = {
      id: makePageId(),
      name: typeof name === 'string' && name.trim() ? name.trim() : 'Trang ' + index,
      widgets: Array.isArray(widgets) ? widgets : [],
    };
    state.pages.push(page);
    return page;
  }

  function removePage(id) {
    if (state.pages.length <= 1) return false;
    const index = state.pages.findIndex((page) => page.id === id);
    if (index < 0) return false;
    state.pages.splice(index, 1);
    if (state.activePageId === id) {
      const fallback = state.pages[Math.min(index, state.pages.length - 1)];
      state.activePageId = fallback.id;
    }
    return true;
  }

  function renamePage(id, name) {
    const page = state.pages.find((entry) => entry.id === id);
    if (!page || typeof name !== 'string' || !name.trim()) return false;
    page.name = name.trim();
    return true;
  }

  /** Ghi đè danh sách phím của trang đang xem (trước khi lưu/đổi trang). */
  function setActiveWidgets(widgets) {
    const page = active();
    if (page) page.widgets = Array.isArray(widgets) ? widgets : [];
    return page;
  }

  /** Thay toàn bộ tài liệu (dùng sau khi nạp từ đĩa). */
  function replace(doc) {
    state = ensureDoc(doc);
  }

  function toDoc() {
    return {
      schemaVersion: LAYOUT_SCHEMA_VERSION,
      pages: state.pages.map((page) => ({ ...page, widgets: [...page.widgets] })),
      activePageId: state.activePageId,
    };
  }

  return {
    list,
    count,
    active,
    activeId,
    activeIndex,
    setActive,
    next,
    addPage,
    removePage,
    renamePage,
    setActiveWidgets,
    replace,
    toDoc,
  };
}
