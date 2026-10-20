export const liveWidgetRegistry = new Map();

export const CLOCK_TICK_DIGITAL_MS = 1000;
export const CLOCK_TICK_ANALOG_MS = 100;
export const CLOCK_TICK_FLIP_MS = 1000;
export const LIVE_WIDGET_TICK_MS = 100;

const clockSchedulerState = {
  lastDigital: 0,
  lastFlip: 0,
  lastAnalog: 0,
};

export function registerLiveWidget(el) {
  const type = el.dataset.type;
  if (type === 'mini_clock') {
    const unit = el.querySelector('.clock-unit');
    if (!unit) return liveWidgetRegistry.delete(el);
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
    if (!unit) return liveWidgetRegistry.delete(el);
    liveWidgetRegistry.set(el, { el, type, unit, icon: unit.querySelector('.weather-icon') });
  } else {
    liveWidgetRegistry.delete(el);
  }
}

export function unregisterLiveWidget(el) {
  liveWidgetRegistry.delete(el);
  if (el.__pomo && el.__pomo.treeTimers) {
    el.__pomo.treeTimers.forEach(clearTimeout);
    el.__pomo.treeTimers = [];
  }
}

export function tickLiveWidgets({ isDeckPaused, getClockFace, updateClockWidget }) {
  if (isDeckPaused()) return;
  const now = Date.now();
  const dueFaces = new Set();

  if (now - clockSchedulerState.lastDigital >= CLOCK_TICK_DIGITAL_MS) {
    clockSchedulerState.lastDigital = now;
    dueFaces.add('digital');
  }
  if (now - clockSchedulerState.lastFlip >= CLOCK_TICK_FLIP_MS) {
    clockSchedulerState.lastFlip = now;
    dueFaces.add('flip');
  }
  if (now - clockSchedulerState.lastAnalog >= CLOCK_TICK_ANALOG_MS) {
    clockSchedulerState.lastAnalog = now;
    dueFaces.add('analog');
  }

  for (const refs of liveWidgetRegistry.values()) {
    if (refs.type === 'mini_clock' && dueFaces.has(getClockFace(refs.el))) {
      updateClockWidget(refs.el);
    }
  }
}

export function startLiveWidgetScheduler(handlers) {
  return setInterval(() => tickLiveWidgets(handlers), LIVE_WIDGET_TICK_MS);
}
