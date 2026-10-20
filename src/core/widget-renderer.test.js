import assert from 'node:assert/strict';
import test from 'node:test';
import { createWidgetRenderer } from './widget-renderer.js';

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