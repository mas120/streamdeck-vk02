import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import {
  LAYOUT_SCHEMA_VERSION,
  loadLayout,
  migrateLayout,
  readSavedLayout,
  writeLayout,
  writeLayoutFile,
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

/** Mọi phím sau migrate phải có id chuỗi + cfg object. */
function assertMigrated(items) {
  assert.equal(items.length, 1);
  assert.equal(items[0].x, 1);
  assert.equal(items[0].type, 'open_url');
  assert.equal(typeof items[0].id, 'string');
  assert.ok(items[0].id.length > 0);
  assert.deepEqual(items[0].cfg, {});
}

test('reads legacy arrays and v1/v2 layouts from localStorage', () => {
  storage.set('legacy', JSON.stringify(sample));
  storage.set('v1', JSON.stringify({ schemaVersion: 1, widgets: sample }));
  storage.set('v2', JSON.stringify({ schemaVersion: 2, widgets: sample }));

  assertMigrated(readSavedLayout('legacy'));
  assertMigrated(readSavedLayout('v1'));
  assertMigrated(readSavedLayout('v2'));
});

test('writes versioned v2 layouts to localStorage and the Tauri file', async () => {
  writeLayout('deck', sample);
  const stored = JSON.parse(storage.get('deck'));
  assert.equal(stored.schemaVersion, LAYOUT_SCHEMA_VERSION);
  assertMigrated(stored.widgets);

  let saved;
  await writeLayoutFile(async (_command, args) => {
    saved = JSON.parse(args.json);
  }, sample);
  assert.equal(saved.schemaVersion, LAYOUT_SCHEMA_VERSION);
  assertMigrated(saved.widgets);
});

test('loads a v1 Tauri layout and keeps the same keys', async () => {
  const result = await loadLayout('deck', async () =>
    JSON.stringify({ schemaVersion: 1, widgets: sample })
  );
  assertMigrated(result);
});

test('migrates a legacy localStorage array to v2 on Tauri', async () => {
  storage.set('deck', JSON.stringify(sample));
  const savedCalls = [];
  const invoke = async (command, args) => {
    if (command === 'load_layout') return null;
    savedCalls.push(JSON.parse(args.json));
  };

  const result = await loadLayout('deck', invoke);
  assertMigrated(result);
  assert.equal(savedCalls.length, 1);
  assert.equal(savedCalls[0].schemaVersion, LAYOUT_SCHEMA_VERSION);
  assertMigrated(savedCalls[0].widgets);
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
    2
  );
  assert.equal(items.length, 3);
  assert.equal(items[0].id, 'giữ-nguyên');
  assert.deepEqual(items[0].cfg, { a: 1 });
  assert.notEqual(items[1].id, 'giữ-nguyên'); // id trùng -> sinh id mới
  assert.deepEqual(items[1].cfg, {});
  assert.deepEqual(items[2].cfg, {}); // cfg không phải object -> {}
});

test('layout rác không làm mất toàn bộ layout', () => {
  const items = migrateLayout([{ garbage: true }, { x: 0, y: 0 }]);
  assert.equal(items.length, 1);
  assert.equal(items[0].x, 0);
  assert.equal(typeof items[0].id, 'string');
  assert.deepEqual(items[0].cfg, {});
});
