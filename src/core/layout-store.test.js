import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import {
  FIRST_PAGE_NAME,
  LAYOUT_SCHEMA_VERSION,
  getActivePage,
  loadLayoutDoc,
  migrateLayout,
  normalizeLayoutDoc,
  readSavedLayout,
  readSavedLayoutDoc,
  writeLayout,
  writeLayoutDoc,
  writeLayoutFileDoc,
} from './layout-store.js';

const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const storage = new Map();

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  },
});

beforeEach(() => storage.clear());
after(() => {
  if (storageDescriptor) Object.defineProperty(globalThis, 'localStorage', storageDescriptor);
  else delete globalThis.localStorage;
});

const sample = [{ x: 1, y: 2, w: 1, h: 1, type: 'open_url' }];

function assertOnePage(doc, expectedWidgets = 1) {
  assert.equal(doc.schemaVersion, LAYOUT_SCHEMA_VERSION);
  assert.equal(doc.pages.length, 1);
  assert.equal(doc.pages[0].name, FIRST_PAGE_NAME);
  assert.equal(doc.pages[0].widgets.length, expectedWidgets);
  assert.equal(doc.activePageId, doc.pages[0].id);
  for (const widget of doc.pages[0].widgets) {
    assert.equal(typeof widget.id, 'string');
    assert.deepEqual(widget.cfg, {});
  }
}

test('đọc layout mảng cũ, v1, v2 và v3 đều thành tài liệu nhiều trang', () => {
  storage.set('legacy', JSON.stringify(sample));
  storage.set('v1', JSON.stringify({ schemaVersion: 1, widgets: sample }));
  storage.set('v2', JSON.stringify({ schemaVersion: 2, widgets: sample }));

  assertOnePage(readSavedLayoutDoc('legacy'));
  assertOnePage(readSavedLayoutDoc('v1'));
  assertOnePage(readSavedLayoutDoc('v2'));

  const doc = {
    schemaVersion: 3,
    pages: [
      { id: 'a', name: 'Chính', widgets: sample },
      { id: 'b', name: 'Phụ', widgets: [{ x: 0, y: 0, w: 1, h: 1, type: 'mic_widget' }] },
    ],
    activePageId: 'b',
  };
  storage.set('v3', JSON.stringify(doc));
  const loaded = readSavedLayoutDoc('v3');
  assert.equal(loaded.pages.length, 2);
  assert.equal(loaded.activePageId, 'b');
  assert.equal(getActivePage(loaded).name, 'Phụ');

  // API cũ trả phím của trang đang xem.
  const activeItems = readSavedLayout('v3');
  assert.equal(activeItems.length, 1);
  assert.equal(activeItems[0].type, 'mic_widget');
});

test('ghi tài liệu nhiều trang vào localStorage và file Tauri', async () => {
  const doc = {
    pages: [
      { id: 'a', name: 'Một', widgets: sample },
      { id: 'b', name: 'Hai', widgets: sample },
    ],
    activePageId: 'b',
  };
  writeLayoutDoc('deck', doc);
  const stored = JSON.parse(storage.get('deck'));
  assert.equal(stored.schemaVersion, LAYOUT_SCHEMA_VERSION);
  assert.equal(stored.pages.length, 2);
  assert.equal(stored.activePageId, 'b');

  let saved;
  await writeLayoutFileDoc(async (_command, args) => {
    saved = JSON.parse(args.json);
  }, doc);
  assert.equal(saved.schemaVersion, LAYOUT_SCHEMA_VERSION);
  assert.equal(saved.pages.length, 2);
});

test('writeLayout kiểu cũ (mảng phím) tạo tài liệu 1 trang', () => {
  writeLayout('deck', sample);
  const stored = JSON.parse(storage.get('deck'));
  assertOnePage(stored);
});

test('nạp file v1 trên Tauri rồi ghi lại v3', async () => {
  const calls = [];
  const result = await loadLayoutDoc('deck', async (command, args) => {
    if (command === 'load_layout') return JSON.stringify({ schemaVersion: 1, widgets: sample });
    calls.push([command, JSON.parse(args.json)]);
    return null;
  });
  assertOnePage(result);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'save_layout');
  assert.equal(calls[0][1].schemaVersion, LAYOUT_SCHEMA_VERSION);
  assertOnePage(calls[0][1]);
});

test('chuyển layout localStorage cũ sang file khi chạy Tauri', async () => {
  storage.set('deck', JSON.stringify(sample));
  const savedCalls = [];
  const invoke = async (command, args) => {
    if (command === 'load_layout') return null;
    savedCalls.push(JSON.parse(args.json));
  };

  const result = await loadLayoutDoc('deck', invoke);
  assertOnePage(result);
  assert.equal(savedCalls.length, 1);
  assertOnePage(savedCalls[0]);
  assert.equal(storage.has('deck'), false);
});

test('migrateLayout giữ id/cfg cũ, thêm cho phím thiếu, bỏ phím rác', () => {
  const items = migrateLayout(
    [
      { x: 0, y: 0, w: 1, h: 1, type: 'open_url', id: 'giữ-nguyên', cfg: { a: 1 } },
      { x: 1, y: 0, w: 1, h: 1, type: 'launch_app', id: 'giữ-nguyên' },
      { x: 2, y: 0, w: 1, h: 1, type: 'mic_widget', cfg: 'hỏng' },
      { type: 'open_url' },
      null,
    ],
    3
  );
  assert.equal(items.length, 3);
  assert.equal(items[0].id, 'giữ-nguyên');
  assert.deepEqual(items[0].cfg, { a: 1 });
  assert.notEqual(items[1].id, 'giữ-nguyên'); // id trùng -> sinh id mới
  assert.deepEqual(items[1].cfg, {});
  assert.deepEqual(items[2].cfg, {}); // cfg không phải object -> {}
});

test('normalizeLayoutDoc bỏ trang rỗng, chống trùng id, active luôn hợp lệ', () => {
  const doc = normalizeLayoutDoc({
    pages: [
      { id: 'x', name: '', widgets: sample },
      { id: 'x', name: 'Trùng', widgets: sample },
      { id: 'z', name: 'Rỗng', widgets: [] },
    ],
    activePageId: 'không-có',
  });
  assert.equal(doc.pages.length, 2);
  assert.notEqual(doc.pages[0].id, doc.pages[1].id);
  assert.equal(doc.pages[0].name, 'Trang 1');
  assert.equal(doc.activePageId, doc.pages[0].id);
  assert.equal(normalizeLayoutDoc({ pages: [] }), null);
});
