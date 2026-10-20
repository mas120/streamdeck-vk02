import {
  isEditMode,
  keyContent,
  pressFeedback,
  releaseFeedback,
  flashKeycap,
} from '../core/mode-manager.js';
import { clampInt } from '../core/utils.js';

const POMO_RADIUS = 42;
const POMO_CIRCUMFERENCE = 2 * Math.PI * POMO_RADIUS;

export function parsePomoTarget(target) {
  const parts = String(target || '').split(',');
  return [clampInt(parts[0], 1, 180, 25), clampInt(parts[1], 1, 120, 5)];
}

function formatMMSS(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

import { widgetRegistry } from '../core/widget-registry.js';

export function createPomodoroWidget({ TREE_SVGS, applyWidgetTier, clampInt, saveCurrentLayout }) {
  let audioContext = null;

  /* Khởi tạo state timer; gọi TRƯỚC markup() để markup() không còn tác dụng phụ. */
  function prepare(el) {
    const init = el.__pomoInit || {};
    const [workMin, breakMin] = parsePomoTarget(el.dataset.target);
    initialize(el, init.workMin ?? workMin, init.breakMin ?? breakMin, init.restore || null);
    el.__pomoInit = null;
  }

  function markup() {
    return `
      <div class="pomodoro-unit forest-theme" data-mode="work" data-state="idle" data-tree="seed">
        <div class="forest-dial" aria-label="Cây Pomodoro">
          <div class="forest-plate" aria-hidden="true">
            <div class="forest-tree tree-seed">${TREE_SVGS.seed}</div>
            <div class="forest-tree tree-sprout">${TREE_SVGS.sprout}</div>
            <div class="forest-tree tree-growing">${TREE_SVGS.growing}</div>
            <div class="forest-tree tree-full">${TREE_SVGS.full}</div>
            <div class="forest-tree tree-dead">${TREE_SVGS.dead}</div>
          </div>
          <svg class="pomodoro-ring" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
            <defs>
              <linearGradient id="pomoGradWork" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="#e1f9ff"></stop>
                <stop offset="55%" stop-color="#9fe6ff"></stop>
                <stop offset="100%" stop-color="#48b6ff"></stop>
              </linearGradient>
              <linearGradient id="pomoGradBreak" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="#d9f7d8"></stop>
                <stop offset="55%" stop-color="#7ae0a0"></stop>
                <stop offset="100%" stop-color="#2ea86a"></stop>
              </linearGradient>
            </defs>
            <circle class="timer-bg" cx="50" cy="50" r="42"></circle>
            <circle class="timer-progress work" cx="50" cy="50" r="42" transform="rotate(-90 50 50)" stroke-dasharray="263.894" stroke-linecap="round"></circle>
          </svg>
        </div>
        <svg class="pomodoro-perimeter" viewBox="0 0 100 240" preserveAspectRatio="none" aria-hidden="true">
          <rect class="timer-bg" x="2" y="2" width="96" height="236" rx="7" pathLength="263.894"></rect>
          <rect class="timer-progress work" x="2" y="2" width="96" height="236" rx="7" pathLength="263.894" stroke-dasharray="263.894" stroke-linecap="round"></rect>
        </svg>
        <span class="forest-tag"><span aria-hidden="true">●</span> Tập trung</span>
        <div class="pomodoro-center"><span class="timer-time pomo-time-display">25:00</span></div>
        <button class="forest-btn" type="button">Plant</button>
        <span class="pomo-sr pomodoro-mode">POMODORO</span>
        <span class="pomo-sr pomodoro-state">CHẠM ĐỂ CHẠY</span>
      </div>`;
  }

  function initialize(el, workMin, breakMin, restore) {
    const work = clampInt(workMin, 1, 180, 25);
    const rest = clampInt(breakMin, 1, 120, 5);
    el.dataset.work = String(work);
    el.dataset.break = String(rest);
    if (restore && typeof restore === 'object') {
      const mode = ['work', 'break', 'idle'].includes(restore.mode) ? restore.mode : 'idle';
      const freshTotal = (mode === 'break' ? rest : work) * 60;
      const remaining =
        typeof restore.remainingSeconds === 'number' ? restore.remainingSeconds : freshTotal;
      const state = {
        mode,
        workMin: work,
        breakMin: rest,
        totalSeconds:
          typeof restore.totalSeconds === 'number' && restore.totalSeconds > 0
            ? restore.totalSeconds
            : freshTotal,
        remainingSeconds: Math.max(0, Math.round(remaining)),
        isRunning: !!restore.isRunning,
        endAt: null,
        treeTimers: [],
      };
      if (state.isRunning) {
        const base = typeof restore.savedAt === 'number' ? restore.savedAt : Date.now();
        state.endAt = base + state.remainingSeconds * 1000;
        state.remainingSeconds = Math.max(0, Math.round((state.endAt - Date.now()) / 1000));
      }
      el.__pomo = state;
      return;
    }
    el.__pomo = {
      mode: 'idle',
      workMin: work,
      breakMin: rest,
      totalSeconds: work * 60,
      remainingSeconds: work * 60,
      isRunning: false,
      endAt: null,
      treeTimers: [],
    };
  }

  function register(el) {
    const unit = el.querySelector('.pomodoro-unit');
    if (!unit) return null;
    return {
      el,
      type: 'pomodoro',
      unit,
      ring: unit.querySelector('.timer-progress'),
      perimeter: unit.querySelector('.pomodoro-perimeter .timer-progress'),
      time: unit.querySelector('.pomo-time-display'),
      mode: unit.querySelector('.pomodoro-mode'),
      state: unit.querySelector('.pomodoro-state'),
      button: unit.querySelector('.forest-btn'),
    };
  }

  function update(entry) {
    if (!entry) return;
    const state = entry.el.__pomo;
    if (!state || !entry.ring || !entry.time) return;
    const ratio =
      state.mode !== 'idle' && state.totalSeconds > 0
        ? Math.max(0, Math.min(1, 1 - state.remainingSeconds / state.totalSeconds))
        : 0;
    const dashOffset = String(POMO_CIRCUMFERENCE * (1 - ratio));
    entry.ring.style.strokeDashoffset = dashOffset;
    if (entry.perimeter) entry.perimeter.style.strokeDashoffset = dashOffset;
    entry.time.textContent = formatMMSS(state.remainingSeconds);
  }

  function treeState(state) {
    if (state.mode === 'idle') return 'seed';
    if (state.mode === 'break') return 'full';
    const progress = state.totalSeconds > 0 ? 1 - state.remainingSeconds / state.totalSeconds : 0;
    return progress >= 0.8
      ? 'full'
      : progress >= 0.3
        ? 'growing'
        : progress >= 0.06
          ? 'sprout'
          : 'seed';
  }

  function scheduleTree(el, unit, state) {
    state.treeTimers.forEach(clearTimeout);
    state.treeTimers = [];
    unit.dataset.tree = treeState(state);
    if (!state.isRunning || state.mode !== 'work' || state.totalSeconds <= 0) return;
    const elapsed = state.totalSeconds - state.remainingSeconds;
    [
      [0.06, 'sprout'],
      [0.3, 'growing'],
      [0.8, 'full'],
    ].forEach(([threshold, tree]) => {
      const delay = threshold * state.totalSeconds - elapsed;
      if (delay <= 0) return;
      state.treeTimers.push(
        setTimeout(() => {
          if (el.__pomo === state && state.isRunning && state.mode === 'work')
            unit.dataset.tree = tree;
        }, delay * 1000)
      );
    });
  }

  function renderState(el) {
    const entry = register(el);
    const state = el.__pomo;
    if (!entry || !state) return;
    update(entry);
    const isBreak = state.mode === 'break';
    const isIdle = !state.isRunning && state.mode === 'idle';
    entry.ring.classList.toggle('break', isBreak);
    entry.ring.classList.toggle('work', !isBreak);
    entry.ring.style.stroke = isBreak ? 'url(#pomoGradBreak)' : 'url(#pomoGradWork)';
    if (entry.perimeter) {
      entry.perimeter.classList.toggle('break', isBreak);
      entry.perimeter.classList.toggle('work', !isBreak);
    }
    entry.unit.classList.add('forest-theme');
    entry.unit.classList.toggle('is-break', isBreak);
    entry.unit.classList.toggle('is-running', state.isRunning);
    entry.unit.classList.toggle('is-paused', !state.isRunning && !isIdle);
    entry.unit.classList.toggle('is-idle', isIdle);
    applyWidgetTier(el, entry.unit);
    entry.unit.dataset.mode = isBreak ? 'break' : 'work';
    entry.unit.dataset.state = state.isRunning ? 'running' : isIdle ? 'idle' : 'paused';
    scheduleTree(el, entry.unit, state);
    const modeText = isBreak ? 'NGHỈ NGƠI' : isIdle ? 'POMODORO' : 'LÀM VIỆC';
    const stateText = state.isRunning ? 'ĐANG CHẠY' : isIdle ? 'CHẠM ĐỂ CHẠY' : 'TẠM DỪNG';
    if (entry.mode) entry.mode.textContent = modeText;
    if (entry.state) entry.state.textContent = stateText;
    if (entry.button) {
      entry.button.textContent = state.isRunning
        ? el.__pomoCancelConfirm
          ? 'Dừng?'
          : 'Dừng phiên'
        : isIdle
          ? 'Bắt đầu'
          : 'Tiếp tục';
      entry.button.setAttribute(
        'aria-label',
        state.isRunning
          ? el.__pomoCancelConfirm
            ? 'Xác nhận dừng phiên'
            : 'Dừng phiên, cần xác nhận lần nữa'
          : isIdle
            ? 'Bắt đầu phiên tập trung'
            : 'Tiếp tục phiên tập trung'
      );
    }
    entry.unit.title = `${modeText} · ${stateText}`;
  }

  function start(el) {
    const state = el.__pomo;
    if (!state) return;
    clearCancelConfirmation(el);
    if (state.mode === 'idle') {
      state.mode = 'work';
      state.totalSeconds = state.workMin * 60;
    }
    if (state.remainingSeconds <= 0) state.remainingSeconds = state.totalSeconds;
    state.isRunning = true;
    state.endAt = Date.now() + state.remainingSeconds * 1000;
    renderState(el);
  }

  function pause(el) {
    const state = el.__pomo;
    if (!state?.isRunning) return;
    clearCancelConfirmation(el);
    state.remainingSeconds = Math.max(0, Math.round((state.endAt - Date.now()) / 1000));
    state.isRunning = false;
    state.endAt = null;
    renderState(el);
  }

  function cancel(el) {
    const state = el.__pomo;
    if (!state) return;
    clearCancelConfirmation(el);
    state.mode = 'idle';
    state.isRunning = false;
    state.endAt = null;
    state.totalSeconds = state.workMin * 60;
    state.remainingSeconds = state.totalSeconds;
    renderState(el);
    saveCurrentLayout();
  }

  function reset(el) {
    const state = el.__pomo;
    if (!state) return;
    clearCancelConfirmation(el);
    state.mode = 'work';
    state.isRunning = false;
    state.endAt = null;
    state.totalSeconds = state.workMin * 60;
    state.remainingSeconds = state.totalSeconds;
    renderState(el);
    flashKeycap(el, true);
    saveCurrentLayout();
  }

  function blink(el) {
    const content = keyContent(el);
    content.classList.remove('pomo-finish');
    clearTimeout(content.__pomoFinishTimer);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        content.classList.add('pomo-finish');
        content.__pomoFinishTimer = setTimeout(() => content.classList.remove('pomo-finish'), 1600);
      })
    );
  }

  function beep() {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      audioContext = audioContext || new AudioContextClass();
      if (audioContext.state === 'suspended') audioContext.resume();
      const startAt = audioContext.currentTime;
      [0, 0.22, 0.44].forEach((delay, index) => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880 + index * 130, startAt + delay);
        gain.gain.setValueAtTime(0.0001, startAt + delay);
        gain.gain.exponentialRampToValueAtTime(0.14, startAt + delay + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, startAt + delay + 0.18);
        oscillator.connect(gain).connect(audioContext.destination);
        oscillator.start(startAt + delay);
        oscillator.stop(startAt + delay + 0.2);
      });
    } catch (_) {}
  }

  function complete(el) {
    const state = el.__pomo;
    if (!state) return;
    clearCancelConfirmation(el);
    const now = Date.now();
    let mode = state.mode;
    let endAt = typeof state.endAt === 'number' ? state.endAt : now;
    let total = state.totalSeconds;
    let guard = 0;
    do {
      mode = mode === 'break' ? 'work' : 'break';
      total = (mode === 'break' ? state.breakMin : state.workMin) * 60;
      endAt += total * 1000;
      guard++;
    } while (endAt <= now && guard < 1000);
    if (endAt <= now) endAt = now + total * 1000;
    state.mode = mode;
    state.totalSeconds = total;
    state.endAt = endAt;
    state.remainingSeconds = Math.max(0, Math.round((endAt - now) / 1000));
    state.isRunning = true;
    renderState(el);
    blink(el);
    beep();
    saveCurrentLayout();
  }

  function setup(el) {
    const content = keyContent(el);
    if (el.__pomoWiredTo === content) return;
    let pressTimer = null;
    let longPressed = false;
    const buttonClick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (isEditMode) return;
      if (el.__pomo?.isRunning) {
        if (el.__pomoCancelConfirm) {
          cancel(el);
          return;
        }
        el.__pomoCancelConfirm = true;
        renderState(el);
        el.__pomoCancelTimer = setTimeout(() => {
          clearCancelConfirmation(el);
          renderState(el);
        }, 2500);
      } else {
        start(el);
        saveCurrentLayout();
      }
    };
    const pointerDown = (event) => {
      if (event.target.closest('.forest-btn') || isEditMode || event.button) return;
      longPressed = false;
      pressFeedback(el);
      clearTimeout(pressTimer);
      pressTimer = setTimeout(() => {
        longPressed = true;
        reset(el);
      }, 500);
    };
    const finishPress = (event) => {
      if (event.target.closest('.forest-btn')) return;
      clearTimeout(pressTimer);
      releaseFeedback(el);
      if (longPressed) {
        longPressed = false;
        return;
      }
      if (isEditMode) return;
      if (el.__pomo?.isRunning) pause(el);
      else start(el);
      saveCurrentLayout();
    };
    const cancelPress = () => {
      clearTimeout(pressTimer);
      releaseFeedback(el);
    };
    // Ủy quyền trên content: nút .forest-btn được dựng lại mỗi lần render mà setup() chỉ chạy 1 lần.
    const contentClick = (event) => {
      if (event.target.closest('.forest-btn')) buttonClick(event);
    };
    content.addEventListener('click', contentClick);
    content.addEventListener('pointerdown', pointerDown);
    content.addEventListener('pointerup', finishPress);
    content.addEventListener('pointercancel', cancelPress);
    content.addEventListener('pointerleave', cancelPress);
    el.__pomoWiredTo = content;
    el.__pomoListeners = { content, contentClick, pointerDown, finishPress, cancelPress };
  }

  function destroy(el) {
    const listeners = el.__pomoListeners;
    if (listeners) {
      listeners.content.removeEventListener('pointerdown', listeners.pointerDown);
      listeners.content.removeEventListener('pointerup', listeners.finishPress);
      listeners.content.removeEventListener('pointercancel', listeners.cancelPress);
      listeners.content.removeEventListener('pointerleave', listeners.cancelPress);
      listeners.content.removeEventListener('click', listeners.contentClick);
    }
    el.__pomo?.treeTimers?.forEach(clearTimeout);
    clearCancelConfirmation(el);
    if (el.__pomo) el.__pomo.treeTimers = [];
    delete el.__pomoListeners;
    delete el.__pomoWiredTo;
  }

  function clearCancelConfirmation(el) {
    clearTimeout(el.__pomoCancelTimer);
    delete el.__pomoCancelTimer;
    delete el.__pomoCancelConfirm;
  }

  function tick(registry) {
    for (const refs of registry.values()) {
      if (refs.type !== 'pomodoro') continue;
      const el = refs.el;
      const state = el.__pomo;
      if (!state || !state.isRunning) continue;
      const remaining = Math.max(0, Math.round((state.endAt - Date.now()) / 1000));
      if (remaining !== state.remainingSeconds) {
        state.remainingSeconds = remaining;
        update(refs);
      }
      if (remaining <= 0) complete(el);
    }
  }

  function saveRunning(registry) {
    for (const refs of registry.values()) {
      if (refs.type === 'pomodoro' && refs.el.__pomo?.isRunning) {
        saveCurrentLayout();
        return;
      }
    }
  }

  return {
    type: 'pomodoro',
    prepare,
    markup,
    setup,
    register,
    update,
    destroy,
    render: renderState,
    tick,
    saveRunning,
  };
}

widgetRegistry.registerWidget({
  type: 'pomodoro',
  label: 'Pomodoro',
  icon: '🌲',
  defaultSize: [2, 2],
  configFields: [
    { key: 'work', type: 'number', label: 'Phút làm việc', min: 1, max: 180 },
    { key: 'break', type: 'number', label: 'Phút nghỉ', min: 1, max: 120 },
  ],
  create: ({ el, content, services }) => {
    const widget = services.pomodoroWidget;
    widget.prepare(el);
    return {
      markup: widget.markup(),
      setup: () => {
        widget.setup(el);
        widget.render(el);
      },
      destroy: () => widget.destroy(el),
    };
  },
});
