import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import {
  LAYOUT_SCHEMA_VERSION,
  loadLayout,
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

test('reads legacy arrays and versioned layouts from localStorage', () => {
  storage.set('legacy', JSON.stringify(sample));
  storage.set('versioned', JSON.stringify({ schemaVersion: 1, widgets: sample }));

  assert.deepEqual(readSavedLayout('legacy'), sample);
  assert.deepEqual(readSavedLayout('versioned'), sample);
});

test('writes versioned layouts to localStorage and the Tauri file', async () => {
  writeLayout('deck', sample);
  assert.deepEqual(JSON.parse(storage.get('deck')), {
    schemaVersion: LAYOUT_SCHEMA_VERSION,
    widgets: sample,
  });

  let saved;
  await writeLayoutFile(async (_command, args) => { saved = JSON.parse(args.json); }, sample);
  assert.deepEqual(saved, { schemaVersion: LAYOUT_SCHEMA_VERSION, widgets: sample });
});

test('loads a versioned Tauri layout', async () => {
  const result = await loadLayout('deck', async () => JSON.stringify({ schemaVersion: 1, widgets: sample }));
  assert.deepEqual(result, sample);
});

test('migrates a legacy localStorage array to the versioned Tauri format', async () => {
  storage.set('deck', JSON.stringify(sample));
  const savedCalls = [];
  const invoke = async (command, args) => {
    if (command === 'load_layout') return null;
    savedCalls.push(JSON.parse(args.json));
  };

  const result = await loadLayout('deck', invoke);
  assert.deepEqual(result, sample);
  assert.deepEqual(savedCalls, [{ schemaVersion: 1, widgets: sample }]);
  assert.equal(storage.has('deck'), false);
});