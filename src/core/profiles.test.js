import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PROFILE_STORAGE_KEY,
  createProfileWatcher,
  loadProfiles,
  resolveProfilePage,
  sanitizeProfiles,
  saveProfiles,
} from './profiles.js';

const fakeStorage = () => {
  const map = new Map();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, String(value)),
    map,
  };
};

test('sanitizeProfiles: mặc định tắt, key viết thường, bỏ mục rỗng', () => {
  assert.deepEqual(sanitizeProfiles(null), { enabled: false, map: {} });
  const clean = sanitizeProfiles({
    enabled: true,
    map: { 'Chrome.EXE': 'p2', '': 'p3', 'spotify.exe': '' },
  });
  assert.equal(clean.enabled, true);
  assert.deepEqual(clean.map, { 'chrome.exe': 'p2' });
});

test('loadProfiles/saveProfiles dùng localStorage', () => {
  const storage = fakeStorage();
  assert.deepEqual(loadProfiles(storage), { enabled: false, map: {} });
  saveProfiles({ enabled: true, map: { 'code.exe': 'p1' } }, storage);
  const stored = JSON.parse(storage.map.get(PROFILE_STORAGE_KEY));
  assert.equal(stored.enabled, true);
  assert.deepEqual(loadProfiles(storage).map, { 'code.exe': 'p1' });
});

test('resolveProfilePage: bỏ qua chính app, tôn trọng cờ bật/tắt', () => {
  const profiles = { enabled: true, map: { 'chrome.exe': 'p2' } };
  assert.equal(resolveProfilePage(profiles, 'chrome.exe'), 'p2');
  assert.equal(resolveProfilePage(profiles, 'CHROME.EXE'), 'p2');
  assert.equal(resolveProfilePage(profiles, 'streamdeck-vk02.exe'), null);
  assert.equal(resolveProfilePage(profiles, 'notepad.exe'), null);
  assert.equal(resolveProfilePage({ enabled: false, map: profiles.map }, 'chrome.exe'), null);
  assert.equal(resolveProfilePage(profiles, ''), null);
});

test('watcher chuyển trang khi tiến trình foreground khớp map', async () => {
  const calls = [];
  const watcher = createProfileWatcher({
    invokeCmd: async (command) => {
      assert.equal(command, 'get_foreground_process');
      return 'chrome.exe';
    },
    getTauri: () => true,
    getActivePageId: () => 'p1',
    switchPage: (id) => calls.push(id),
    getProfiles: () => ({ enabled: true, map: { 'chrome.exe': 'p2' } }),
  });
  await watcher.tick();
  assert.deepEqual(calls, ['p2']);
});

test('watcher im lặng khi tắt / đang tạm dừng / đã đúng trang', async () => {
  let switches = 0;
  const build = (profiles, active, shouldPause) =>
    createProfileWatcher({
      invokeCmd: async () => 'chrome.exe',
      getTauri: () => true,
      getActivePageId: () => active,
      switchPage: () => (switches += 1),
      getProfiles: () => profiles,
      shouldPause,
    });

  await build({ enabled: false, map: { 'chrome.exe': 'p2' } }, 'p1').tick();
  await build({ enabled: true, map: { 'chrome.exe': 'p2' } }, 'p1', () => true).tick();
  await build({ enabled: true, map: { 'chrome.exe': 'p2' } }, 'p2').tick();
  assert.equal(switches, 0);
});
