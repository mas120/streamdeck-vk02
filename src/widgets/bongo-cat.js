import { keyContent } from '../core/mode-manager.js';

export function normalizeBongoSize(value) {
  const v = String(value || '2x1').trim().toLowerCase();
  return (v === '2x2') ? '2x2' : '2x1';
}

export function parseBongoCfg(el) {
  let cfg = {};
  try {
    cfg = JSON.parse(el.dataset.cfg || '{}');
  } catch (_) {
    cfg = {};
  }
  const size = normalizeBongoSize(cfg.size || el.dataset.target || '2x1');
  const showKps = cfg.showKps !== undefined ? !!cfg.showKps : (el.dataset.showKps === '1');
  return { size, showKps };
}

const KPS_WINDOW_MS = 1000;

/* ---------------------------------------------------------------- layout 75%
   Bàn phím 75%: 16u mỗi hàng, 6 hàng (Esc/F1-F12 + 5 hàng chính).
   `code` trùng tên biến thể rdev::Key để Rust gửi đúng phím đã bấm. */
const F_KEYS = Array.from({ length: 12 }, (_, i) => ({ code: `F${i + 1}`, label: `F${i + 1}` }));
const ROW_LETTERS_Q = 'QWERTYUIOP'.split('');
const ROW_LETTERS_A = 'ASDFGHJKL'.split('');
const ROW_LETTERS_Z = 'ZXCVBNM'.split('');

const digitKeys = [
  { code: 'Num1', label: '1', sub: '!' },
  { code: 'Num2', label: '2', sub: '@' },
  { code: 'Num3', label: '3', sub: '#' },
  { code: 'Num4', label: '4', sub: '$' },
  { code: 'Num5', label: '5', sub: '%' },
  { code: 'Num6', label: '6', sub: '^' },
  { code: 'Num7', label: '7', sub: '&' },
  { code: 'Num8', label: '8', sub: '*' },
  { code: 'Num9', label: '9', sub: '(' },
  { code: 'Num0', label: '0', sub: ')' },
];

const KEY_ROWS = [
  [
    { code: 'Escape', label: 'Esc' },
    ...F_KEYS,
    { code: 'PrintScreen', label: 'Prt' },
    { code: 'Insert', label: 'Ins' },
    { code: 'Delete', label: 'Del' },
  ],
  [
    { code: 'BackQuote', label: '`', sub: '~' },
    ...digitKeys,
    { code: 'Minus', label: '-', sub: '_' },
    { code: 'Equal', label: '=', sub: '+' },
    { code: 'Backspace', label: '⌫', w: 2 },
    { code: 'Home', label: 'Home' },
  ],
  [
    { code: 'Tab', label: 'Tab', w: 1.5 },
    ...ROW_LETTERS_Q.map((ch) => ({ code: `Key${ch}`, label: ch })),
    { code: 'LeftBracket', label: '[', sub: '{' },
    { code: 'RightBracket', label: ']', sub: '}' },
    { code: 'BackSlash', label: '\\', sub: '|', w: 1.5 },
    { code: 'PageUp', label: 'PgUp' },
  ],
  [
    { code: 'CapsLock', label: 'Caps', w: 1.75 },
    ...ROW_LETTERS_A.map((ch) => ({ code: `Key${ch}`, label: ch })),
    { code: 'SemiColon', label: ';', sub: ':' },
    { code: 'Quote', label: "'", sub: '"' },
    { code: 'Return', label: 'Enter', w: 2.25 },
    { code: 'PageDown', label: 'PgDn' },
  ],
  [
    { code: 'ShiftLeft', label: 'Shift', w: 2.25 },
    ...ROW_LETTERS_Z.map((ch) => ({ code: `Key${ch}`, label: ch })),
    { code: 'Comma', label: ',', sub: '<' },
    { code: 'Dot', label: '.', sub: '>' },
    { code: 'Slash', label: '/', sub: '?' },
    { code: 'ShiftRight', label: 'Shift', w: 1.75 },
    { code: 'UpArrow', label: '↑' },
    { code: 'End', label: 'End' },
  ],
  [
    { code: 'ControlLeft', label: 'Ctrl', w: 1.25 },
    { code: 'MetaLeft', label: 'Win', w: 1.25 },
    { code: 'Alt', label: 'Alt', w: 1.25 },
    { code: 'Space', label: '', w: 5.5 },
    { code: 'AltGr', label: 'Alt', w: 1.25 },
    { code: 'Function', label: 'Fn', w: 1.25 },
    { code: 'ControlRight', label: 'Ctrl', w: 1.25 },
    { code: 'LeftArrow', label: '←' },
    { code: 'DownArrow', label: '↓' },
    { code: 'RightArrow', label: '→' },
  ],
];

/* Hình học scene: bàn phím neo đáy, mèo ngồi phía sau.
   2x1 thu nhỏ chiều cao phím cho vừa ô ngang; 2x2 phím cao hơn, ký tự dễ đọc. */
function bongoGeometry(square) {
  const geo = square
    ? {
      viewW: 300, viewH: 300,
      caseX: 8, caseW: 284, caseBottom: 292, radius: 10,
      pad: 6, keyH: 14, gapY: 1.6,
      catScale: 0.95, catX: 150, catY: 200, pawScale: 0.68,
    }
    : {
      viewW: 320, viewH: 190,
      caseX: 8, caseW: 304, caseBottom: 184, radius: 8,
      pad: 4.5, keyH: 9, gapY: 1.1,
      catScale: 0.8, catX: 160, catY: 148, pawScale: 0.55,
    };
  geo.caseH = KEY_ROWS.length * geo.keyH + (KEY_ROWS.length - 1) * geo.gapY + 2 * geo.pad;
  geo.caseY = geo.caseBottom - geo.caseH;
  geo.keyX0 = geo.caseX + geo.pad;
  geo.keyAreaW = geo.caseW - 2 * geo.pad;
  geo.pitch = geo.keyAreaW / 16;
  geo.gapX = geo.pitch * 0.11;
  geo.homeRowY = geo.caseY + geo.pad + 3 * (geo.keyH + geo.gapY) + geo.keyH / 2;
  geo.homeLeftX = geo.keyX0 + 5.25 * geo.pitch; // phím F
  geo.homeRightX = geo.keyX0 + 8.25 * geo.pitch; // phím J
  geo.pawH = 28 * geo.pawScale;
  return geo;
}

function escText(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function legendSize(label, keyH) {
  const n = String(label || '').length;
  if (!n) return 0;
  if (n === 1) return keyH * 0.58;
  if (n === 2) return keyH * 0.46;
  if (n === 3) return keyH * 0.4;
  return keyH * 0.33;
}

function keyMarkup(spec, x, y, w, h, side, geo) {
  const label = spec.label || '';
  const sub = spec.sub || '';
  const radius = Math.max(1, h * 0.2);
  const cx = x + w / 2;
  const cy = y + h / 2 + (sub ? h * 0.16 : 0);
  const mainSize = legendSize(label, h);
  const subSize = h * 0.34;
  const isHome = spec.code === 'KeyF' || spec.code === 'KeyJ';
  const main = label
    ? `<text class="bongo-legend" x="${cx.toFixed(2)}" y="${cy.toFixed(2)}" font-size="${mainSize.toFixed(2)}" text-anchor="middle" dominant-baseline="central">${escText(label)}</text>`
    : '';
  const subText = sub
    ? `<text class="bongo-legend bongo-legend-sub" x="${(x + 1.3).toFixed(2)}" y="${(y + 1.5).toFixed(2)}" font-size="${subSize.toFixed(2)}" text-anchor="start" dominant-baseline="central">${escText(sub)}</text>`
    : '';
  const shape = spec.code === 'Space'
    ? `<rect class="bongo-key-rect bongo-spacebar" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx="${radius.toFixed(2)}"/>`
    : `<rect class="bongo-key-rect" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx="${radius.toFixed(2)}"/>`;
  return `<g class="bongo-key${isHome ? ' is-home' : ''}" data-code="${spec.code}" data-side="${side}">${shape}${subText}${main}</g>`;
}

/* Sinh toàn bộ bàn phím 75%: case + 81 phím, mỗi phím có ký tự như bàn phím thật. */
function bongoKeyboardMarkup(geo) {
  let y = geo.caseY + geo.pad;
  const keys = [];
  KEY_ROWS.forEach((row) => {
    let offset = 0;
    row.forEach((spec) => {
      const units = spec.w || 1;
      const x = geo.keyX0 + offset * geo.pitch + geo.gapX / 2;
      const w = units * geo.pitch - geo.gapX;
      const side = (offset + units / 2) < 8 ? 'left' : 'right';
      keys.push(keyMarkup(spec, x, y, w, geo.keyH, side, geo));
      offset += units;
    });
    y += geo.keyH + geo.gapY;
  });
  return `
    <g class="bongo-keyboard">
      <rect class="bongo-keyboard-case" x="${geo.caseX}" y="${geo.caseY.toFixed(2)}" width="${geo.caseW}" height="${geo.caseH.toFixed(2)}" rx="${geo.radius}"/>
      <g class="bongo-keys">${keys.join('')}</g>
    </g>`;
}

function pawMarkup(cls, homeX, homeY, pawScale, mirrored) {
  const scaleX = mirrored ? -pawScale : pawScale;
  return `
    <g class="bongo-arm ${cls}" data-home-x="${homeX.toFixed(2)}" data-home-y="${homeY.toFixed(2)}" data-paw-h="${(28 * pawScale).toFixed(2)}">
      <g transform="translate(${homeX.toFixed(2)} ${homeY.toFixed(2)}) scale(${scaleX} ${pawScale}) translate(-91 -149)">
        <path class="bongo-paw" d="M72 150 C72 141 80 135 91 135 C102 135 110 141 110 150 L110 155 C110 160 105 163 100 161 C97 160 94 159 91 159 C88 159 85 160 82 161 C77 163 72 160 72 155 Z"/>
        <path class="bongo-paw-line" d="M84 139 Q84 145 84 150 M91 138 Q91 144 91 150 M98 139 Q98 145 98 150"/>
      </g>
    </g>`;
}

function bongoCatMarkup(cfg = { size: '2x1', showKps: true }) {
  const size = normalizeBongoSize(cfg.size);
  const showKps = !!cfg.showKps;
  const geo = bongoGeometry(size === '2x2');
  const catTransform = `translate(${geo.catX} ${geo.catY}) scale(${geo.catScale}) translate(-160 -178)`;
  return `
    <div class="bongo-cat-widget ${showKps ? '' : 'hide-kps'}" data-size="${size}" data-left="up" data-right="up">
      <div class="bongo-kps">${showKps ? 'KPS 0.0' : ''}</div>
      <div class="bongo-scene">
        <svg class="bongo-svg" viewBox="0 0 ${geo.viewW} ${geo.viewH}" aria-hidden="true">
          <g class="bongo-art">
            <g class="bongo-cat" transform="${catTransform}">
              <g class="bongo-head">
                <g class="bongo-ears">
                  <path class="bongo-ear" d="M116 62 L102 20 Q100 13 107 16 L150 44 Z"/>
                  <path class="bongo-ear" d="M204 62 L218 20 Q220 13 213 16 L170 44 Z"/>
                  <path class="bongo-ear-inner" d="M120 54 L110 26 L139 43 Z"/>
                  <path class="bongo-ear-inner" d="M200 54 L210 26 L181 43 Z"/>
                </g>
                <path class="bongo-body" d="M100 178 C94 156 94 132 98 112 C102 74 126 46 160 46 C194 46 218 74 222 112 C226 132 226 156 220 178 Z"/>
                <g class="bongo-face">
                  <ellipse class="bongo-eye" cx="137" cy="88" rx="6.8" ry="8.8"/>
                  <ellipse class="bongo-eye" cx="183" cy="88" rx="6.8" ry="8.8"/>
                  <circle class="bongo-eye-glint" cx="139.5" cy="84.5" r="2.2"/>
                  <circle class="bongo-eye-glint" cx="185.5" cy="84.5" r="2.2"/>
                  <ellipse class="bongo-blush" cx="118" cy="103" rx="7.5" ry="3.6"/>
                  <ellipse class="bongo-blush" cx="202" cy="103" rx="7.5" ry="3.6"/>
                  <g class="bongo-whiskers">
                    <path d="M122 92 L96 88 M122 99 L94 101"/>
                    <path d="M198 92 L224 88 M198 99 L226 101"/>
                  </g>
                  <path class="bongo-nose" d="M155.5 95 Q160 91.5 164.5 95 Q160 101 155.5 95 Z"/>
                  <path class="bongo-mouth" d="M160 98 C158 104 152 105 149 100 M160 98 C162 104 168 105 171 100"/>
                </g>
              </g>
            </g>
            ${bongoKeyboardMarkup(geo)}
            ${pawMarkup('bongo-arm-left', geo.homeLeftX, geo.homeRowY, geo.pawScale, false)}
            ${pawMarkup('bongo-arm-right', geo.homeRightX, geo.homeRowY, geo.pawScale, true)}
          </g>
        </svg>
      </div>
    </div>
  `;
}

/* ------------------------------------------------------------- trạng thái */

function createState() {
  return {
    events: [],
    down: new Map(), // code -> 'left' | 'right'
    lastKey: { left: null, right: null },
    pointerCode: null,
  };
}

function ensureState(state) {
  if (!state.events) state.events = [];
  if (!(state.down instanceof Map)) state.down = new Map();
  if (!state.lastKey) state.lastKey = { left: null, right: null };
  if (state.pointerCode === undefined) state.pointerCode = null;
  return state;
}

function setKpsText(widget, count) {
  const kps = widget.querySelector('.bongo-kps');
  if (kps) kps.textContent = `KPS ${Number(count).toFixed(1)}`;
}

function recordKeyPress(widget, state) {
  const now = performance.now();
  state.events.push(now);
  state.events = state.events.filter((ts) => ts > now - KPS_WINDOW_MS);
  setKpsText(widget, state.events.length);
  clearTimeout(state.kpsTimer);
  state.kpsTimer = setTimeout(() => {
    state.events = [];
    setKpsText(widget, 0);
  }, KPS_WINDOW_MS);
}

function findKeyEl(widget, code) {
  if (!code) return null;
  return widget.querySelector(`.bongo-key[data-code="${code}"]`);
}

function setKeyLit(widget, code, lit) {
  const key = findKeyEl(widget, code);
  if (!key) return null;
  key.classList.toggle('is-lit', !!lit);
  return key;
}

/* Đưa bàn tay tới đúng phím; key = null thì trả tay về phím home (F/J). */
function movePaw(widget, hand, key) {
  const arm = widget.querySelector(hand === 'left' ? '.bongo-arm-left' : '.bongo-arm-right');
  if (!arm) return;
  if (!key) {
    arm.style.setProperty('--paw-dx', '0px');
    arm.style.setProperty('--paw-dy', '0px');
    return;
  }
  const rect = key.querySelector('.bongo-key-rect');
  if (!rect) return;
  const homeX = Number(arm.dataset.homeX);
  const homeY = Number(arm.dataset.homeY);
  const pawH = Number(arm.dataset.pawH) || 14;
  const keyX = Number(rect.getAttribute('x'));
  const keyY = Number(rect.getAttribute('y'));
  const keyW = Number(rect.getAttribute('width'));
  const keyH = Number(rect.getAttribute('height'));
  // Đặt bàn tay ngay trên phím (chỉ chờm ~15% mép trên) để vẫn thấy phím sáng.
  const cx = keyX + keyW / 2;
  const cy = keyY + keyH * 0.15 - pawH / 2;
  arm.style.setProperty('--paw-dx', `${(cx - homeX).toFixed(2)}px`);
  arm.style.setProperty('--paw-dy', `${(cy - homeY).toFixed(2)}px`);
}

function refreshHands(widget, state) {
  const sides = new Set(state.down.values());
  widget.dataset.left = sides.has('left') ? 'down' : 'up';
  widget.dataset.right = sides.has('right') ? 'down' : 'up';
}

function pressKey(widget, state, code, side, key) {
  ensureState(state);
  const token = code || `__${side}`;
  state.down.set(token, side);
  state.lastKey[side] = key || null;
  if (key) {
    key.classList.add('is-lit');
    movePaw(widget, side, key);
  }
  refreshHands(widget, state);
  recordKeyPress(widget, state);
}

function releaseKey(widget, state, code, side) {
  ensureState(state);
  const token = code || `__${side}`;
  state.down.delete(token);
  if (code) setKeyLit(widget, code, false);
  const stillDown = Array.from(state.down.values()).includes(side);
  if (!stillDown) {
    state.lastKey[side] = null;
    movePaw(widget, side, null);
  } else if (state.lastKey[side]) {
    movePaw(widget, side, state.lastKey[side]);
  }
  refreshHands(widget, state);
}

/* ------------------------------------------------------ sự kiện bàn phím */

/* Áp vị trí con trỏ (chuẩn hoá 0..1 theo màn chính) cho mọi widget Bongo Cat:
   mắt liếc theo, tai nghiêng theo hướng ngang của chuột.
   Dùng khi chuột bị giữ ở màn chính nên không thể di chuột qua widget. */
function applyCursorLook(x, y) {
  if (typeof x !== 'number' || typeof y !== 'number') return;
  if (document.body.classList.contains('idle')) return;
  document.querySelectorAll('.bongo-cat-widget').forEach((widget) => {
    widget.style.setProperty('--look-x', `${((x - 0.5) * 5).toFixed(1)}px`);
    widget.style.setProperty('--look-y', `${((y - 0.45) * 3).toFixed(1)}px`);
    widget.style.setProperty('--ear-turn', `${((x - 0.5) * 24).toFixed(1)}deg`);
  });
}

function setupBongoCatEventListener() {
  const eventApi = window.__TAURI__ && (window.__TAURI__.event || window.__TAURI__.core);
  if (!eventApi) return;
  const listenFn = eventApi.listen || eventApi.addListener;
  if (typeof listenFn !== 'function') return;
  listenFn.call(eventApi, 'bongo-cursor', (event) => {
    const payload = (event && typeof event === 'object' && 'payload' in event) ? event.payload : event;
    if (!payload) return;
    applyCursorLook(payload.x, payload.y);
  });
  listenFn.call(eventApi, 'bongo-key-event', (event) => {
    const payload = (event && typeof event === 'object' && 'payload' in event) ? event.payload : event;
    if (!payload || !payload.action) return;
    const action = payload.action === 'down' ? 'down' : (payload.action === 'up' ? 'up' : null);
    const fallbackHand = payload.hand === 'left' || payload.hand === 'right' ? payload.hand : null;
    if (!action || !fallbackHand) return;
    if (document.body.classList.contains('idle')) return;

    const code = typeof payload.code === 'string' ? payload.code : '';
    document.querySelectorAll('.grid-stack-item[data-type="bongo_cat"]').forEach((el) => {
      const widget = keyContent(el).querySelector('.bongo-cat-widget');
      if (!widget) return;
      const state = ensureState(el.__bongoState || (el.__bongoState = createState()));
      const key = findKeyEl(widget, code);
      // Ưu tiên vị trí phím trong layout: tay trái/phải khớp đúng nửa bàn phím.
      const side = (key && key.dataset.side) || fallbackHand;
      if (action === 'down') pressKey(widget, state, code, side, key);
      else releaseKey(widget, state, code, side);
    });
  });
}

/* --------------------------------------------------------- chạm trên widget */

function setupBongoCatPointer(widget) {
  if (!widget || widget.dataset.pointerReady === '1') return;
  widget.dataset.pointerReady = '1';
  const el = widget.closest('.grid-stack-item');
  const state = ensureState(el ? (el.__bongoState || (el.__bongoState = createState())) : createState());
  const isInteractive = () => !document.body.classList.contains('idle')
    && !document.body.classList.contains('edit-mode');

  const releasePointerKey = () => {
    if (!state.pointerCode) return;
    const key = findKeyEl(widget, state.pointerCode);
    const side = (key && key.dataset.side) || 'left';
    releaseKey(widget, state, state.pointerCode, side);
    state.pointerCode = null;
  };

  widget.addEventListener('pointermove', (event) => {
    if (!isInteractive()) return;
    const rect = widget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / Math.max(rect.width, 1);
    const y = (event.clientY - rect.top) / Math.max(rect.height, 1);
    widget.style.setProperty('--look-x', `${((x - 0.5) * 5).toFixed(1)}px`);
    widget.style.setProperty('--look-y', `${((y - 0.45) * 3).toFixed(1)}px`);
    // Tai nghiêng theo hướng ngang của chuột (trái âm, phải dương).
    widget.style.setProperty('--ear-turn', `${((x - 0.5) * 24).toFixed(1)}deg`);
  });

  widget.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
    if (!isInteractive()) return;
    releasePointerKey();
    const target = event.target && event.target.closest ? event.target.closest('.bongo-key') : null;
    if (target && target.dataset.code) {
      state.pointerCode = target.dataset.code;
      pressKey(widget, state, target.dataset.code, target.dataset.side || 'left', target);
      return;
    }
    const rect = widget.getBoundingClientRect();
    const hand = event.clientX < rect.left + rect.width / 2 ? 'left' : 'right';
    pressKey(widget, state, '', hand, null);
    clearTimeout(state.pointerRelease);
    state.pointerRelease = setTimeout(() => releaseKey(widget, state, '', hand), 130);
  });

  widget.addEventListener('pointerup', releasePointerKey);
  widget.addEventListener('pointercancel', releasePointerKey);
  widget.addEventListener('pointerleave', () => {
    widget.style.setProperty('--look-x', '0px');
    widget.style.setProperty('--look-y', '0px');
    widget.style.setProperty('--ear-turn', '0deg');
    releasePointerKey();
  });
}

export const bongoCatWidget = {
  type: 'bongo_cat',
  markup: bongoCatMarkup,
  setup(el) {
    const widget = keyContent(el).querySelector('.bongo-cat-widget');
    if (!widget) return;
    widget.dataset.left = 'up';
    widget.dataset.right = 'up';
    setupBongoCatPointer(widget);
  },
  register(el) {
    const widget = keyContent(el).querySelector('.bongo-cat-widget');
    return widget ? {
      el,
      type: 'bongo_cat',
      widget,
      keys: Array.from(widget.querySelectorAll('.bongo-key')),
      kps: widget.querySelector('.bongo-kps'),
    } : null;
  },
  update() {},
  destroy(el) {
    const state = el.__bongoState;
    if (state?.pointerRelease) clearTimeout(state.pointerRelease);
    if (state?.kpsTimer) clearTimeout(state.kpsTimer);
    delete el.__bongoState;
  },
  setupKeyboardListener: setupBongoCatEventListener,
};
