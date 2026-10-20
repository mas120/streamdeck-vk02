import assert from 'node:assert/strict';
import test from 'node:test';
import { createWidgetRegistry } from './widget-registry.js';

const descriptor = (type, extra = {}) => ({
  type,
  label: type,
  create: () => ({ markup: '<div></div>' }),
  ...extra,
});

test('đăng ký + đọc lại descriptor', () => {
  const registry = createWidgetRegistry();
  const def = registry.registerWidget(descriptor('demo', { label: 'Demo', defaultSize: [2, 1] }));
  assert.equal(def.type, 'demo');
  assert.equal(registry.getWidget('demo').label, 'Demo');
  assert.deepEqual(registry.getWidget('demo').defaultSize, [2, 1]);
  assert.equal(registry.hasWidget('demo'), true);
});

test('đăng ký trùng type thì ghi đè', () => {
  const registry = createWidgetRegistry();
  registry.registerWidget(descriptor('demo', { label: 'Cũ' }));
  registry.registerWidget(descriptor('demo', { label: 'Mới' }));
  assert.equal(registry.listWidgets().length, 1);
  assert.equal(registry.getWidget('demo').label, 'Mới');
});

test('type không tồn tại trả null, danh sách rỗng lúc đầu', () => {
  const registry = createWidgetRegistry();
  assert.equal(registry.getWidget('khong_co'), null);
  assert.deepEqual(registry.listWidgets(), []);
});

test('descriptor thiếu type hoặc create bị từ chối', () => {
  const registry = createWidgetRegistry();
  assert.throws(() => registry.registerWidget({ create: () => ({ markup: '' }) }), /thiếu type/);
  assert.throws(() => registry.registerWidget({ type: 'x' }), /thiếu hàm create/);
});

test('descriptor được đóng băng (không sửa tại chỗ)', () => {
  const registry = createWidgetRegistry();
  const def = registry.registerWidget(descriptor('demo'));
  assert.equal(Object.isFrozen(def), true);
});
