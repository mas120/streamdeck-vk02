import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDiagnostics, createIpcCounter, installDiagnostics, installIpcCounter } from './diagnostics.js';

test('ring buffer giữ tối đa `limit` bản ghi mới nhất', () => {
  const diag = createDiagnostics({ limit: 3, now: () => 1700000000000 });

  for (let i = 1; i <= 5; i++) diag.record('console', `lỗi ${i}`);

  const entries = diag.list();
  assert.equal(entries.length, 3);
  assert.deepEqual(entries.map((entry) => entry.message), ['lỗi 3', 'lỗi 4', 'lỗi 5']);
});

test('format có tiêu đề, số bản ghi, mốc thời gian và detail nhiều dòng', () => {
  const diag = createDiagnostics({ limit: 10, now: () => Date.UTC(2026, 0, 2, 3, 4, 5) });
  diag.record('error', 'bùm', 'dòng 1\ndòng 2');

  const text = diag.format({ title: 'CHẨN ĐOÁN' });

  assert.match(text, /^CHẨN ĐOÁN/);
  assert.match(text, /Số bản ghi: 1\/10/);
  assert.match(text, /\[2026-01-02T03:04:05\.000Z\] ERROR: bùm/);
  assert.match(text, / {4}dòng 1\n {4}dòng 2/);
});

test('Error và object được chuyển thành chuỗi an toàn', () => {
  const diag = createDiagnostics({ limit: 10 });
  const circular = {};
  circular.self = circular;

  diag.record('error', new Error('hỏng'));
  diag.record('console', circular);

  const [errEntry, objEntry] = diag.list();
  assert.match(errEntry.message, /hỏng/);
  assert.equal(objEntry.message, '[object Object]');
});

test('install bắt error, unhandledrejection và console.error', () => {  const handlers = new Map();
  const calls = [];
  const fakeConsole = { error: (...args) => calls.push(args) };
  const fakeWindow = { addEventListener: (type, handler) => handlers.set(type, handler) };

  installDiagnostics({ window: fakeWindow, console: fakeConsole });

  handlers.get('error')({ message: 'lỗi đồng bộ', filename: 'a.js', lineno: 3, colno: 7 });
  handlers.get('unhandledrejection')({ reason: new Error('promise hỏng') });
  fakeConsole.error('lỗi chủ động', { code: 5 });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], ['lỗi chủ động', { code: 5 }]);

  const text = installDiagnostics({ window: fakeWindow, console: fakeConsole }).format();
  assert.match(text, /ERROR: lỗi đồng bộ/);
  assert.match(text, /a\.js:3:7/);
  assert.match(text, /PROMISE: promise hỏng/);
  assert.match(text, /CONSOLE: lỗi chủ động \{"code":5\}/);
});

test('ipc counter đếm theo lệnh và trượt khỏi cửa sổ 60 giây', () => {
  let now = 1000;
  const counter = createIpcCounter({ windowMs: 60_000, now: () => now });

  counter.record('get_master_volume');
  counter.record('get_master_volume');
  counter.record('get_audio_sessions');
  assert.deepEqual(counter.counts(), { get_master_volume: 2, get_audio_sessions: 1 });

  now += 59_000;
  counter.record('get_master_volume');
  assert.deepEqual(counter.summary(), {
    windowMs: 60_000,
    total: 4,
    counts: { get_master_volume: 3, get_audio_sessions: 1 },
  });

  now += 2_000;   // các lệnh cũ đã ra khỏi cửa sổ
  assert.deepEqual(counter.counts(), { get_master_volume: 1 });

  counter.reset();
  assert.deepEqual(counter.summary(), { windowMs: 60_000, total: 0, counts: {} });
});

test('installIpcCounter gắn window.__ipcCount và đọc counter dùng chung', () => {
  const fakeWindow = {};

  const counter = installIpcCounter({ window: fakeWindow });
  assert.ok(counter);
  assert.equal(typeof fakeWindow.__ipcCount, 'function');

  counter.reset();
  counter.record('get_master_volume');
  assert.equal(fakeWindow.__ipcCount().total, 1);
  assert.deepEqual(fakeWindow.__ipcCount.counts(), { get_master_volume: 1 });

  fakeWindow.__ipcCount.reset();
  assert.equal(fakeWindow.__ipcCount().total, 0);

  // Không có window -> không gắn hook, trả null.
  assert.equal(installIpcCounter({}), null);
});
