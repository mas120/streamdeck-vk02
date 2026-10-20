export const liveWidgetRegistry = new Map();

export const CLOCK_TICK_ANALOG_MS = 100;
const SECOND_MS = 1000;
/** Cộng thêm vài ms để không rơi lại đúng giây cũ khi setTimeout nhanh hơn đồng hồ. */
const SECOND_PAD_MS = 8;
const IDLE_EVENT = 'deck-idle-change';

export function registerLiveWidget(el) {
  const type = el.dataset.type;
  if (type === 'mini_clock') {
    const unit = el.querySelector('.clock-unit');
    if (!unit) {
      liveWidgetRegistry.delete(el);
      return;
    }
    liveWidgetRegistry.set(el, {
      el,
      type,
      unit,
      label: unit.querySelector('.clock-label'),
      handSecond: unit.querySelector('.hand-second'),
      handMinute: unit.querySelector('.hand-minute'),
      handHour: unit.querySelector('.hand-hour'),
      arc: unit.querySelector('.clock-arc'),
      dateMini: unit.querySelector('.clock-date-mini'),
      wideDate: unit.querySelector('.clock-wide-date'),
      wideZone: unit.querySelector('.clock-wide-zone'),
      flipCards: Array.from(unit.querySelectorAll('.flip-card')),
      time: unit.querySelector('.clock-time'),
      seconds: unit.querySelector('.clock-secs'),
      date: unit.querySelector('.clock-date'),
      bar: unit.querySelector('.clock-bar-fill'),
    });
  } else if (type === 'pomodoro') {
    const content = el.querySelector('.grid-stack-item-content') || el;
    liveWidgetRegistry.set(el, {
      el,
      type,
      unit: content.querySelector('.pomodoro-unit'),
      ring: content.querySelector('.timer-progress'),
      perimeter: content.querySelector('.pomodoro-perimeter .timer-progress'),
      time: content.querySelector('.pomo-time-display'),
    });
  } else if (type === 'weather_widget') {
    const unit = el.querySelector('.weather-unit');
    if (!unit) {
      liveWidgetRegistry.delete(el);
      return;
    }
    liveWidgetRegistry.set(el, { el, type, unit, icon: unit.querySelector('.weather-icon') });
  } else {
    liveWidgetRegistry.delete(el);
    return;
  }
  kickScheduler();
}

export function unregisterLiveWidget(el) {
  liveWidgetRegistry.delete(el);
  if (el.__pomo && el.__pomo.treeTimers) {
    el.__pomo.treeTimers.forEach(clearTimeout);
    el.__pomo.treeTimers = [];
  }
}

/** Có ít nhất một đồng hồ cần vẽ lại theo nhịp? */
function hasClockWidget() {
  for (const refs of liveWidgetRegistry.values()) {
    if (refs.type === 'mini_clock') return true;
  }
  return false;
}

function hasAnalogClock(getClockFace) {
  for (const refs of liveWidgetRegistry.values()) {
    if (refs.type === 'mini_clock' && getClockFace(refs.el) === 'analog') return true;
  }
  return false;
}

/**
 * Thời gian tới lần tick kế tiếp.
 * - Có mặt analog: 100ms (kim giây mượt).
 * - Chỉ digital/flip: bám đúng mốc giây kế tiếp thay vì cộng dồn 1s gây trôi.
 */
export function nextTickDelay(hasAnalog, now = Date.now()) {
  if (hasAnalog) return CLOCK_TICK_ANALOG_MS;
  return SECOND_MS - (now % SECOND_MS) + SECOND_PAD_MS;
}

/**
 * Cập nhật đồng hồ đang có.
 * Digital/flip chỉ vẽ lại khi sang giây mới; analog vẽ mỗi lần gọi.
 */
export function tickLiveWidgets({ getClockFace, updateClockWidget }, now = Date.now()) {
  const second = Math.floor(now / SECOND_MS);
  for (const refs of liveWidgetRegistry.values()) {
    if (refs.type !== 'mini_clock') continue;
    const face = getClockFace(refs.el);
    if (face === 'analog') {
      updateClockWidget(refs.el);
    } else if (refs.lastSecond !== second) {
      refs.lastSecond = second;
      updateClockWidget(refs.el);
    }
  }
}

/* =========================================================================
   SCHEDULER: tự hẹn lại, dừng khi không còn đồng hồ / deck tối / cửa sổ ẩn
   ========================================================================= */

let scheduler = null;
let timer = null;
let paused = false;

function clearTimer() {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
}

function schedule(delay) {
  if (!scheduler || timer !== null || delay == null) return;
  timer = setTimeout(runTick, delay);
}

function runTick() {
  timer = null;
  if (!scheduler) return;
  if (scheduler.handlers.isDeckPaused()) {
    paused = true;
    return;
  }
  paused = false;
  tickLiveWidgets(scheduler.handlers);
  if (!hasClockWidget()) return; // không còn gì để vẽ -> chờ registerLiveWidget đánh thức
  schedule(nextTickDelay(hasAnalogClock(scheduler.handlers.getClockFace)));
}

function resume() {
  if (!scheduler || timer !== null) return;
  if (scheduler.handlers.isDeckPaused()) return;
  paused = false;
  schedule(0);
}

/** Widget sống vừa được thêm -> khởi động lại nếu scheduler đang nghỉ. */
function kickScheduler() {
  if (!scheduler || timer !== null || paused) return;
  if (!hasClockWidget()) return;
  resume();
}

function onVisibilityChange() {
  if (!document.hidden) resume();
}

function onIdleChange(event) {
  if (event && event.detail && event.detail.idle) {
    clearTimer();
    paused = true;
  } else {
    resume();
  }
}

function onWindowFocus() {
  resume();
}

function bindPauseSignals() {
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange);
  }
  if (typeof window !== 'undefined') {
    window.addEventListener(IDLE_EVENT, onIdleChange);
    window.addEventListener('focus', onWindowFocus);
  }
}

function unbindPauseSignals() {
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', onVisibilityChange);
  }
  if (typeof window !== 'undefined') {
    window.removeEventListener(IDLE_EVENT, onIdleChange);
    window.removeEventListener('focus', onWindowFocus);
  }
}

export function stopLiveWidgetScheduler() {
  clearTimer();
  unbindPauseSignals();
  scheduler = null;
  paused = false;
}

export function startLiveWidgetScheduler(handlers) {
  stopLiveWidgetScheduler();
  scheduler = { handlers };
  paused = false;
  bindPauseSignals();
  resume();
  return { stop: stopLiveWidgetScheduler };
}
