import { isEditMode, keyContent, pressFeedback, releaseFeedback } from '../core/mode-manager.js';

export const CLOCK_DEFAULT = { face: 'digital', tz: 7, label: 'HÀ NỘI' };
const CLOCK_WEEKDAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const CLOCK_ARC_LEN = 2 * Math.PI * 45.6;

function clampFloat(value, min, max, fallback) {
  const number = parseFloat(String(value).replace(',', '.'));
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(number, min), max);
}

export function normalizeClockFace(value) {
  return value === 'analog' || value === 'flip' ? value : 'digital';
}

export function parseClockCfg(el) {
  let raw = {};
  try {
    raw = JSON.parse(el.dataset.cfg || '{}') || {};
  } catch (_) {}
  const parts = String(el.dataset.target || '').split(',');
  const face = normalizeClockFace(raw.face || parts[0] || CLOCK_DEFAULT.face);
  const tz = clampFloat(raw.tz !== undefined ? raw.tz : parts[1], -12, 14, CLOCK_DEFAULT.tz);
  const label =
    typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim() : (parts[2] || '').trim();
  return { face, tz, label: label.toUpperCase() };
}

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character]
  );
}

export function clockZoneLabel(tz) {
  const sign = tz < 0 ? '-' : '+';
  const abs = Math.abs(tz);
  const hours = Math.floor(abs);
  const minutes = Math.round((abs - hours) * 60);
  return `UTC${sign}${hours}${minutes ? ':' + String(minutes).padStart(2, '0') : ''}`;
}

function nowInZone(tzHours) {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utcMs + tzHours * 3600000);
}

export function clockDateShort(now) {
  const weekday = CLOCK_WEEKDAY[now.getDay()] || '';
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${weekday}, ${day}/${month}`;
}

function clockTickMarkup() {
  const ticks = [];
  for (let index = 0; index < 60; index++) {
    const major = index % 5 === 0;
    const quarter = index % 15 === 0;
    const radius = quarter ? 38.6 : major ? 40.4 : 42.2;
    const className = 'clock-tick' + (quarter ? ' is-quarter' : major ? ' is-major' : '');
    ticks.push(
      `<line class="${className}" x1="50" y1="6.40" x2="50" y2="${(50 - radius).toFixed(2)}" transform="rotate(${index * 6} 50 50)"></line>`
    );
  }
  return ticks.join('');
}

function clockNumeralMarkup() {
  const label = (text, x, y) => `<text class="clock-num" x="${x}" y="${y}">${text}</text>`;
  return label('12', 50, 19) + label('3', 81, 50) + label('6', 50, 81) + label('9', 19, 50);
}

function clockAnalogMarkup(label) {
  return `
      <div class="clock-unit keycap-clock-analog" data-face="analog">
        <div class="clock-bezel">
          <svg class="clock-face" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
            <defs>
              <radialGradient id="clockDialGrad" cx="50%" cy="34%" r="74%">
                <stop offset="0%" stop-color="#141c2e"></stop>
                <stop offset="62%" stop-color="#0a0f1c"></stop>
                <stop offset="100%" stop-color="#04060b"></stop>
              </radialGradient>
              <linearGradient id="clockRimGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="rgba(255,255,255,0.30)"></stop>
                <stop offset="55%" stop-color="rgba(0,229,255,0.22)"></stop>
                <stop offset="100%" stop-color="rgba(255,255,255,0.05)"></stop>
              </linearGradient>
              <radialGradient id="clockGlareGrad" cx="30%" cy="22%" r="60%">
                <stop offset="0%" stop-color="rgba(255,255,255,0.13)"></stop>
                <stop offset="100%" stop-color="rgba(255,255,255,0)"></stop>
              </radialGradient>
            </defs>
            <circle class="clock-rim" cx="50" cy="50" r="47.4"></circle>
            <circle class="clock-dial" cx="50" cy="50" r="43.6"></circle>
            <circle class="clock-glare" cx="50" cy="50" r="43.6"></circle>
            ${clockTickMarkup()}
            ${clockNumeralMarkup()}
            <circle class="clock-arc-track" cx="50" cy="50" r="45.6" transform="rotate(-90 50 50)"></circle>
            <circle class="clock-arc" cx="50" cy="50" r="45.6" transform="rotate(-90 50 50)"></circle>
            <polygon class="clock-hand hand-hour" points="50,22.6 51.9,52.2 50,55.2 48.1,52.2"></polygon>
            <polygon class="clock-hand hand-minute" points="50,9.4 51.5,52 50,55.6 48.5,52"></polygon>
            <g class="clock-hand hand-second">
              <line x1="50" y1="57.8" x2="50" y2="8.6"></line>
              <circle cx="50" cy="57.8" r="1.7"></circle>
            </g>
            <text class="clock-date-mini" x="50" y="68.6">--/--</text>
            <circle class="clock-center-cap" cx="50" cy="50" r="3.4"></circle>
            <circle class="clock-center-dot" cx="50" cy="50" r="1.3"></circle>
          </svg>
          <div class="clock-wide-meta" aria-hidden="true">
            <span class="clock-wide-date">--</span>
            <span class="clock-wide-zone">UTC+0</span>
          </div>
          <span class="clock-label wx-sr">${escapeHtml(label)}</span>
        </div>
      </div>`;
}

function clockDigitalMarkup(label) {
  return `
      <div class="clock-unit keycap-clock-digital" data-face="digital">
        <div class="clock-top">
          <span class="clock-date">--/--</span>
          <span class="clock-secs-chip"><i class="clock-pulse"></i><span class="clock-secs">--</span></span>
        </div>
        <div class="clock-hero"><span class="clock-time">--:--</span></div>
        <div class="clock-bar"><span class="clock-bar-fill"></span></div>
        <span class="clock-label wx-sr">${escapeHtml(label)}</span>
      </div>`;
}

function clockFlipMarkup(label) {
  const card = (digit) => `
      <div class="flip-card" data-digit="0">
        <div class="flip-half flip-top"><span class="flip-digit">0</span></div>
        <div class="flip-half flip-bottom"><span class="flip-digit">0</span></div>
        <div class="flip-fold flip-fold-top"><span class="flip-digit">0</span></div>
        <div class="flip-fold flip-fold-bottom"><span class="flip-digit">0</span></div>
      </div>`;
  return `
      <div class="clock-unit keycap-clock-flip" data-face="flip">
        <div class="flip-row">${card('0')}${card('0')}<span class="flip-colon" aria-hidden="true"><i></i><i></i></span>${card('0')}${card('0')}</div>
        <span class="clock-label wx-sr">${escapeHtml(label)}</span>
      </div>`;
}

function setFlipCard(card, next) {
  if (!card || next === undefined) return;
  const normalized = /^\d$/.test(String(next)) ? String(next) : '0';
  const previous = card.dataset.digit || '';
  if (previous === normalized) return;
  card.dataset.digit = normalized;
  const top = card.querySelector('.flip-top > .flip-digit');
  const foldTop = card.querySelector('.flip-fold-top > .flip-digit');
  const foldBottom = card.querySelector('.flip-fold-bottom > .flip-digit');
  const bottom = card.querySelector('.flip-bottom > .flip-digit');
  if (top) top.textContent = normalized;
  if (foldBottom) foldBottom.textContent = normalized;
  if (!previous) {
    if (foldTop) foldTop.textContent = normalized;
    if (bottom) bottom.textContent = normalized;
    return;
  }
  if (foldTop) foldTop.textContent = previous;
  if (bottom) bottom.textContent = previous;
  card.classList.remove('is-flipping');
  requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('is-flipping')));
}

function setClockHand(hand, degrees) {
  if (hand) hand.style.setProperty('--angle', degrees.toFixed(2) + 'deg');
}

function handleFlipAnimationEnd(event) {
  if (!event.target.classList?.contains('flip-fold-bottom')) return;
  const card = event.target.closest('.flip-card');
  if (!card) return;
  const bottom = card.querySelector('.flip-bottom > .flip-digit');
  if (bottom) bottom.textContent = card.dataset.digit || bottom.textContent;
  card.classList.remove('is-flipping');
}

function register(el) {
  const unit = el.querySelector('.clock-unit');
  if (!unit) return null;
  return {
    el,
    type: 'mini_clock',
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
  };
}

function update(entry, { applyWidgetTier }) {
  if (!entry) return;
  const { el, unit } = entry;
  const cfg = parseClockCfg(el);
  const now = nowInZone(cfg.tz);
  applyWidgetTier(el, unit);

  const labelText = cfg.label || clockZoneLabel(cfg.tz);
  if (entry.label && entry.label.textContent !== labelText) entry.label.textContent = labelText;
  const titleText = cfg.label ? `${cfg.label} · ${clockZoneLabel(cfg.tz)}` : labelText;
  if (unit.title !== titleText) unit.title = titleText;

  const milliseconds =
    (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) * 1000 +
    now.getMilliseconds();
  const minuteFraction = (now.getSeconds() * 1000 + now.getMilliseconds()) / 60000;
  const dateText = clockDateShort(now);

  if (cfg.face === 'analog') {
    setClockHand(entry.handSecond, (milliseconds / 1000) * 6);
    setClockHand(entry.handMinute, (milliseconds / 60000) * 6);
    setClockHand(entry.handHour, (milliseconds / 3600000) * 30);
    if (entry.arc)
      entry.arc.style.setProperty(
        '--sec-offset',
        (CLOCK_ARC_LEN * (1 - minuteFraction)).toFixed(2)
      );
    if (entry.dateMini && entry.dateMini.textContent !== dateText)
      entry.dateMini.textContent = dateText;
    if (entry.wideDate && entry.wideDate.textContent !== dateText)
      entry.wideDate.textContent = dateText;
    const zoneText = clockZoneLabel(cfg.tz);
    if (entry.wideZone && entry.wideZone.textContent !== zoneText)
      entry.wideZone.textContent = zoneText;
    return;
  }

  if (cfg.face === 'flip') {
    const digits =
      String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');
    entry.flipCards.forEach((card, index) => setFlipCard(card, digits[index]));
    return;
  }

  const timeText = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  if (entry.time && entry.time.textContent !== timeText) entry.time.textContent = timeText;
  const secondsText = String(now.getSeconds()).padStart(2, '0');
  if (entry.seconds && entry.seconds.textContent !== secondsText)
    entry.seconds.textContent = secondsText;
  if (entry.date && entry.date.textContent !== dateText) entry.date.textContent = dateText;
  if (entry.bar) entry.bar.style.width = (minuteFraction * 100).toFixed(2) + '%';
}

function setup(el) {
  const content = keyContent(el);
  if (el.__clockWiredTo === content) return;
  if (el.__clockListeners) {
    const { target, handlers } = el.__clockListeners;
    target.removeEventListener('pointerdown', handlers.pointerdown);
    target.removeEventListener('pointerup', handlers.release);
    target.removeEventListener('pointercancel', handlers.release);
    target.removeEventListener('pointerleave', handlers.release);
    target.removeEventListener('animationend', handlers.animationend);
  }
  const handlers = {
    pointerdown: (event) => {
      if (isEditMode || event.button) return;
      pressFeedback(el);
    },
    release: () => releaseFeedback(el),
    animationend: handleFlipAnimationEnd,
  };
  content.addEventListener('pointerdown', handlers.pointerdown);
  content.addEventListener('pointerup', handlers.release);
  content.addEventListener('pointercancel', handlers.release);
  content.addEventListener('pointerleave', handlers.release);
  content.addEventListener('animationend', handlers.animationend);
  el.__clockWiredTo = content;
  el.__clockListeners = { target: content, handlers };
  requestAnimationFrame(() => {
    const unit = el.querySelector('.clock-unit');
    if (unit) unit.classList.add('is-animating');
  });
}

function destroy(el) {
  if (!el.__clockListeners) return;
  const { target, handlers } = el.__clockListeners;
  target.removeEventListener('pointerdown', handlers.pointerdown);
  target.removeEventListener('pointerup', handlers.release);
  target.removeEventListener('pointercancel', handlers.release);
  target.removeEventListener('pointerleave', handlers.release);
  target.removeEventListener('animationend', handlers.animationend);
  delete el.__clockListeners;
  delete el.__clockWiredTo;
}

export const clockWidget = {
  type: 'mini_clock',
  markup(cfg) {
    const label = cfg.label || clockZoneLabel(cfg.tz);
    return cfg.face === 'analog'
      ? clockAnalogMarkup(label)
      : cfg.face === 'flip'
        ? clockFlipMarkup(label)
        : clockDigitalMarkup(label);
  },
  setup,
  register,
  update,
  destroy,
};
