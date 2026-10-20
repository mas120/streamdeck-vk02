import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatActionLines,
  parseActionLines,
  parseActionsCfg,
  runActions,
} from './multi-action.js';

test('parseActionLines đọc đúng cú pháp, bỏ dòng trống/ghi chú', () => {
  const actions = parseActionLines(`
    # mở nhạc
    open_url | https://youtube.com
    wait | 800
    launch_app | notepad
    set_volume | 40 | 200
    loại_lạ | x
  `);
  assert.deepEqual(actions, [
    { type: 'open_url', target: 'https://youtube.com', delayMs: 0 },
    { type: 'wait', target: '', delayMs: 800 },
    { type: 'launch_app', target: 'notepad', delayMs: 0 },
    { type: 'set_volume', target: '40', delayMs: 200 },
  ]);
});

test('parseActionLines từ chối target rỗng, âm lượng ngoài 0..100, quá 20 bước', () => {
  assert.deepEqual(parseActionLines('open_url |'), []);
  assert.deepEqual(parseActionLines('set_volume | 140'), []);
  assert.deepEqual(parseActionLines('set_volume'), []);
  const many = Array.from({ length: 25 }, () => 'launch_app | notepad').join('\n');
  assert.equal(parseActionLines(many).length, 20);
});

test('formatActionLines là nghịch đảo của parseActionLines', () => {
  const text = 'open_url | https://a.dev\nwait | 500\nset_volume | 30 | 100';
  assert.equal(formatActionLines(parseActionLines(text)), text);
  assert.equal(formatActionLines([]), '');
});

test('parseActionsCfg lọc cfg hỏng từ dataset', () => {
  const actions = parseActionsCfg({
    actions: [
      { type: 'open_url', target: '' },
      { type: 'wait', delayMs: 250 },
      { type: 'bậy', target: 'x' },
      { type: 'launch_app', target: 'notepad', delayMs: 999999 },
    ],
  });
  assert.deepEqual(actions, [
    { type: 'wait', target: '', delayMs: 250 },
    { type: 'launch_app', target: 'notepad', delayMs: 60000 },
  ]);
  assert.deepEqual(parseActionsCfg({}), []);
});

test('runActions chạy tuần tự, có gap giữa bước', async () => {
  const called = [];
  const slept = [];
  const actions = [
    { type: 'open_url', target: 'https://a.dev', delayMs: 0 },
    { type: 'wait', target: '', delayMs: 500 },
    { type: 'set_volume', target: '30', delayMs: 100 },
  ];

  const result = await runActions(actions, {
    callAction: async (type, target) => called.push([type, target]),
    sleep: async (ms) => slept.push(ms),
    isCancelled: () => false,
  });

  assert.equal(result.cancelled, false);
  assert.equal(result.ran, 3);
  assert.deepEqual(called, [
    ['open_url', 'https://a.dev'],
    ['set_volume', '30'],
  ]);
  // Chờ sau bước 1 (gap), chờ của lệnh wait, rồi gap + delay riêng của bước wait.
  assert.deepEqual(slept, [120, 500, 620]);
});

test('runActions dừng ngay khi bị huỷ', async () => {
  const called = [];
  const result = await runActions(
    [
      { type: 'open_url', target: 'https://a.dev', delayMs: 0 },
      { type: 'set_volume', target: '30', delayMs: 0 },
    ],
    {
      callAction: async (type) => called.push(type),
      sleep: async () => {},
      isCancelled: () => called.length >= 1,
      gapMs: 0,
    }
  );
  assert.equal(result.cancelled, true);
  assert.equal(result.ran, 1);
  assert.deepEqual(called, ['open_url']);
});

test('runActions dừng và trả error khi một bước lỗi', async () => {
  const result = await runActions(
    [
      { type: 'launch_app', target: 'notepad', delayMs: 0 },
      { type: 'set_volume', target: '30', delayMs: 0 },
    ],
    {
      callAction: async (type) => {
        if (type === 'set_volume') throw new Error('hỏng');
      },
      sleep: async () => {},
      gapMs: 0,
    }
  );
  assert.equal(result.ran, 1);
  assert.match(String(result.error), /hỏng/);
});
