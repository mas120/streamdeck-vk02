import assert from 'node:assert/strict';
import test from 'node:test';
import { createWidgetRenderer } from './widget-renderer.js';
import { createWidgetRegistry } from './widget-registry.js';

test('tears down the previously rendered widget type before a type change', () => {
  const calls = [];
  const widget = (name) => ({ destroy: () => calls.push(name) });
  const renderer = createWidgetRenderer({
    volumeWidget: widget('volume'),
    appSliderWidget: widget('app_slider'),
    micWidget: widget('mic'),
    mediaWidget: widget('media'),
    pomodoroWidget: widget('pomodoro'),
    clockWidget: widget('clock'),
    weatherWidget: widget('weather'),
    bongoCatWidget: widget('bongo'),
    todoWidget: widget('todo'),
    unregisterLiveWidget: () => calls.push('unregister'),
  });
  const el = { dataset: { type: 'open_url' }, __renderedWidgetType: 'pomodoro' };

  renderer.destroyWidgetContent(el);

  assert.deepEqual(calls, ['unregister', 'pomodoro']);
  assert.equal('__renderedWidgetType' in el, false);
});

test('renderer ưu tiên widget đã đăng ký registry và gọi đúng vòng đời', () => {
  const calls = [];
  const content = { innerHTML: '' };
  const el = { dataset: { type: 'demo' }, querySelector: () => content };
  const registry = createWidgetRegistry();
  registry.registerWidget({
    type: 'demo',
    create: () => ({
      markup: '<b>demo</b>',
      setup: () => calls.push('setup'),
      destroy: () => calls.push('destroy'),
    }),
  });
  const renderer = createWidgetRenderer({
    widgetRegistry: registry,
    unregisterLiveWidget: () => calls.push('unregister'),
    registerLiveWidget: () => calls.push('register'),
    applyKeyTitle: () => calls.push('title'),
  });

  renderer.renderWidgetContent(el);
  assert.equal(content.innerHTML, '<b>demo</b>');
  assert.deepEqual(calls, ['unregister', 'setup', 'title', 'register']);

  renderer.destroyWidgetContent(el);
  assert.deepEqual(calls, ['unregister', 'setup', 'title', 'register', 'unregister', 'destroy']);
});
