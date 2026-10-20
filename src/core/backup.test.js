import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import {
  BACKUP_APP_ID,
  backupFileName,
  countWidgets,
  createBackup,
  restoreBackup,
  validateBackup,
} from './backup.js';

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

const widgets = [
  { x: 0, y: 0, w: 1, h: 1, type: 'open_url', target: 'https://a.dev' },
  { x: 1, y: 0, w: 1, h: 1, type: 'mic_widget' },
];

test('createBackup gói layout mảng thành tài liệu nhiều trang v3', () => {
  const backup = createBackup({
    layout: widgets,
    config: { brightness: 80 },
    todo: '{"v":1,"items":[]}',
    now: new Date('2026-01-02T03:04:05Z'),
  });
  assert.equal(backup.app, BACKUP_APP_ID);
  assert.equal(backup.createdAt, '2026-01-02T03:04:05.000Z');
  assert.equal(backup.layout.schemaVersion, 3);
  assert.equal(backup.layout.pages.length, 1);
  assert.equal(backup.layout.pages[0].widgets.length, 2);
  assert.equal(countWidgets(backup.layout), 2);
  assert.equal(backup.config.brightness, 80);
  assert.equal(typeof backup.todo, 'string');
});

test('createBackup giữ nguyên nhiều trang + trang đang xem', () => {
  const doc = {
    schemaVersion: 3,
    pages: [
      { id: 'a', name: 'Một', widgets: [widgets[0]] },
      { id: 'b', name: 'Hai', widgets: [widgets[1]] },
    ],
    activePageId: 'b',
  };
  const backup = createBackup({ layout: doc, config: {} });
  assert.equal(backup.layout.pages.length, 2);
  assert.equal(backup.layout.activePageId, 'b');
  assert.equal(countWidgets(backup.layout), 2);
});

test('validateBackup nhận JSON string, thêm id/cfg còn thiếu', () => {
  const result = validateBackup(
    JSON.stringify({ app: BACKUP_APP_ID, version: 1, layout: { widgets } })
  );
  assert.equal(result.ok, true);
  const page = result.backup.layout.pages[0];
  assert.equal(page.widgets.length, 2);
  for (const widget of page.widgets) {
    assert.equal(typeof widget.id, 'string');
    assert.deepEqual(widget.cfg, {});
  }
});

test('validateBackup nhận file nhiều trang và giữ activePageId hợp lệ', () => {
  const raw = JSON.stringify({
    app: BACKUP_APP_ID,
    layout: {
      schemaVersion: 3,
      pages: [
        { id: 'a', name: 'Một', widgets: [widgets[0]] },
        { id: 'b', name: 'Hai', widgets: [widgets[1]] },
      ],
      activePageId: 'b',
    },
  });
  const result = validateBackup(raw);
  assert.equal(result.ok, true);
  assert.equal(result.backup.layout.pages.length, 2);
  assert.equal(result.backup.layout.activePageId, 'b');
});

test('validateBackup từ chối file hỏng / sai app / layout rỗng', () => {
  assert.equal(validateBackup('không phải json').ok, false);
  assert.match(validateBackup('[]').error, /không hợp lệ/);
  assert.match(validateBackup(JSON.stringify({ app: 'app-khác' })).error, /ứng dụng khác/);
  assert.match(validateBackup(JSON.stringify({ app: BACKUP_APP_ID, layout: [] })).error, /trống/);
  assert.match(
    validateBackup(JSON.stringify({ app: BACKUP_APP_ID, layout: [{ x: 'a' }] })).error,
    /phím hợp lệ/
  );
});

test('restoreBackup ghi qua IPC khi chạy desktop', async () => {
  const calls = [];
  const backup = validateBackup(
    JSON.stringify({
      app: BACKUP_APP_ID,
      layout: { widgets },
      config: { brightness: 90 },
      todo: '{"v":1,"items":[{"id":"a"}]}',
    })
  ).backup;

  const count = await restoreBackup(backup, {
    invoke: async (command, args) => calls.push([command, args]),
  });

  assert.equal(count, 2);
  assert.deepEqual(
    calls.map(([command]) => command),
    ['save_layout', 'save_app_config']
  );
  const savedLayout = JSON.parse(calls[0][1].json);
  assert.equal(savedLayout.schemaVersion, 3);
  assert.equal(savedLayout.pages.length, 1);
  assert.equal(savedLayout.pages[0].widgets.length, 2);
  assert.equal(JSON.parse(calls[1][1].json).brightness, 90);
  assert.equal(storage.get('STREAMDECK_VK02_TODO'), '{"v":1,"items":[{"id":"a"}]}');
});

test('restoreBackup trên web ghi localStorage (layout/config/todo)', async () => {
  const backup = validateBackup(
    JSON.stringify({
      layout: { widgets },
      config: { brightness: 70, idleMs: 90000 },
      todo: { v: 1, items: [] },
    })
  ).backup;

  await restoreBackup(backup, { invoke: null });

  const stored = JSON.parse(storage.get('STREAMDECK_VK02_LAYOUT'));
  assert.equal(stored.schemaVersion, 3);
  assert.equal(stored.pages[0].widgets.length, 2);
  assert.equal(storage.get('STREAMDECK_VK02_BRIGHTNESS'), '70');
  assert.equal(storage.get('STREAMDECK_VK02_IDLE_MS'), '90000');
  assert.deepEqual(JSON.parse(storage.get('STREAMDECK_VK02_TODO')), { v: 1, items: [] });
});

test('backupFileName có tiền tố + ngày giờ cố định', () => {
  assert.equal(backupFileName(new Date(2026, 0, 2, 3, 4)), 'streamdeck-backup-20260102-0304.json');
});
