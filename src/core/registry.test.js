import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { liveWidgetRegistry, nextTickDelay, tickLiveWidgets } from './registry.js';

afterEach(() => liveWidgetRegistry.clear());

function fakeClock(id) {
  const el = { id };
  liveWidgetRegistry.set(el, { el, type: 'mini_clock' });
  return el;
}

test('nextTickDelay: analog chạy 100ms, digital bám mốc giây kế tiếp', () => {
  assert.equal(nextTickDelay(true), 100);
  assert.equal(nextTickDelay(false, 10_000), 1008);
  assert.equal(nextTickDelay(false, 10_123), 885);
  assert.equal(nextTickDelay(false, 10_999), 9);
});

test('digital chỉ vẽ lại khi sang giây mới', () => {
  const el = fakeClock('digital');
  const updated = [];
  const handlers = {
    getClockFace: () => 'digital',
    updateClockWidget: (target) => updated.push(target.id),
  };

  tickLiveWidgets(handlers, 10_000);
  tickLiveWidgets(handlers, 10_500);
  tickLiveWidgets(handlers, 11_000);

  assert.deepEqual(updated, ['digital', 'digital']);
});

test('analog vẽ lại mỗi lần tick, kể cả trong cùng một giây', () => {
  const el = fakeClock('analog');
  const updated = [];
  const handlers = {
    getClockFace: () => 'analog',
    updateClockWidget: (target) => updated.push(target.id),
  };

  tickLiveWidgets(handlers, 10_000);
  tickLiveWidgets(handlers, 10_100);
  tickLiveWidgets(handlers, 10_200);

  assert.deepEqual(updated, ['analog', 'analog', 'analog']);
});

test('bỏ qua widget không phải đồng hồ', () => {
  const el = { id: 'pomodoro' };
  liveWidgetRegistry.set(el, { el, type: 'pomodoro' });
  const updated = [];
  const handlers = {
    getClockFace: () => 'digital',
    updateClockWidget: (target) => updated.push(target.id),
  };

  tickLiveWidgets(handlers, 10_000);

  assert.deepEqual(updated, []);
});
