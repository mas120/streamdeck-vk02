import assert from 'node:assert/strict';
import test from 'node:test';
import { createDeckPages } from './deck-pages.js';
import { LAYOUT_SCHEMA_VERSION } from './layout-store.js';

const widget = (type) => ({ x: 0, y: 0, w: 1, h: 1, type });

function sampleDoc() {
  return {
    pages: [
      { id: 'p1', name: 'Chính', widgets: [widget('open_url')] },
      { id: 'p2', name: 'Phụ', widgets: [widget('mic_widget')] },
      { id: 'p3', name: 'Khác', widgets: [] },
    ],
    activePageId: 'p2',
  };
}

test('giữ nguyên trang + trang đang xem, có ít nhất 1 trang', () => {
  const pages = createDeckPages(sampleDoc());
  assert.equal(pages.count(), 3);
  assert.equal(pages.activeId(), 'p2');
  assert.equal(pages.active().name, 'Phụ');
  assert.equal(pages.activeIndex(), 1);

  const empty = createDeckPages(null);
  assert.equal(empty.count(), 1);
  assert.equal(empty.active().name, 'Trang 1');
});

test('next chạy vòng và prev lùi đúng', () => {
  const pages = createDeckPages(sampleDoc());
  assert.equal(pages.next().id, 'p3');
  assert.equal(pages.next().id, 'p1');
  assert.equal(pages.next(-1).id, 'p3');
});

test('setActive từ chối id lạ', () => {
  const pages = createDeckPages(sampleDoc());
  assert.equal(pages.setActive('không-có'), false);
  assert.equal(pages.activeId(), 'p2');
  assert.equal(pages.setActive('p1'), true);
  assert.equal(pages.active().name, 'Chính');
});

test('thêm trang đặt tên tự động và có thể đổi tên', () => {
  const pages = createDeckPages(null);
  const page = pages.addPage();
  assert.equal(page.name, 'Trang 2');
  assert.equal(pages.count(), 2);
  assert.equal(pages.renamePage(page.id, '  Việc  '), true);
  assert.equal(pages.active().name, 'Trang 1');
  assert.equal(pages.list()[1].name, 'Việc');
  assert.equal(pages.renamePage('không-có', 'x'), false);
});

test('xoá trang: không xoá trang cuối, trang đang xem chuyển sang trang kề', () => {
  const pages = createDeckPages(sampleDoc());
  assert.equal(pages.removePage('p2'), true);
  assert.deepEqual(
    pages.list().map((page) => page.id),
    ['p1', 'p3']
  );
  assert.equal(pages.activeId(), 'p3');

  const single = createDeckPages(null);
  assert.equal(single.removePage(single.activeId()), false);
  assert.equal(single.count(), 1);
});

test('setActiveWidgets thay phím trang hiện tại; toDoc xuất schema v3', () => {
  const pages = createDeckPages(sampleDoc());
  pages.setActiveWidgets([widget('todo_list'), widget('media_player')]);
  const doc = pages.toDoc();
  assert.equal(doc.schemaVersion, LAYOUT_SCHEMA_VERSION);
  assert.equal(doc.activePageId, 'p2');
  assert.equal(doc.pages.find((page) => page.id === 'p2').widgets.length, 2);
  // Các trang khác không bị đụng.
  assert.equal(doc.pages.find((page) => page.id === 'p1').widgets.length, 1);
});

test('replace nhận tài liệu mới (dùng sau khi nạp từ đĩa)', () => {
  const pages = createDeckPages(sampleDoc());
  pages.replace({
    pages: [{ id: 'z', name: 'Mới', widgets: [widget('page_switch')] }],
    activePageId: 'z',
  });
  assert.equal(pages.count(), 1);
  assert.equal(pages.active().name, 'Mới');
  assert.equal(pages.active().widgets[0].type, 'page_switch');
});
