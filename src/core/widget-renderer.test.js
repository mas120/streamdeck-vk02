import assert from 'node:assert/strict';
import test from 'node:test';
import { createWidgetRenderer } from './widget-renderer.js';
import { createWidgetRegistry } from './widget-registry.js';

function setupDemo(create) {
  const calls = [];
  const content = { innerHTML: '' };
  const el = { dataset: { type: 'demo' }, querySelector: () => content };
  const registry = createWidgetRegistry();
  registry.registerWidget({ type: 'demo', create });
  const renderer = createWidgetRenderer({
    widgetRegistry: registry,
    unregisterLiveWidget: () => calls.push('unregister'),
    registerLiveWidget: () => calls.push('register'),
    applyKeyTitle: () => calls.push('title'),
  });
  return { calls, content, el, renderer };
}

test('gỡ widget đã render trước khi dựng kiểu mới', () => {
  const { calls, el, renderer } = setupDemo(() => ({
    markup: '<div></div>',
    destroy: () => calls.push('destroy'),
  }));

  renderer.renderWidgetContent(el);
  renderer.renderWidgetContent(el);

  assert.deepEqual(calls, [
    'unregister',
    'title',
    'register',
    'unregister',
    'destroy',
    'title',
    'register',
  ]);
  assert.equal(el.__renderedWidgetType, 'demo');
});

test('renderer ưu tiên widget đã đăng ký registry và gọi đúng vòng đời', () => {
  const { calls, content, el, renderer } = setupDemo(() => ({
    markup: '<b>demo</b>',
    setup: () => calls.push('setup'),
    destroy: () => calls.push('destroy'),
  }));

  renderer.renderWidgetContent(el);
  assert.equal(content.innerHTML, '<b>demo</b>');
  assert.deepEqual(calls, ['unregister', 'setup', 'title', 'register']);

  renderer.destroyWidgetContent(el);
  assert.deepEqual(calls, ['unregister', 'setup', 'title', 'register', 'unregister', 'destroy']);
  assert.equal('__renderedWidgetType' in el, false);
});
