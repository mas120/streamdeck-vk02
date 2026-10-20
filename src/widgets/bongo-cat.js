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

function setupBongoCatEventListener() {
  const eventApi = window.__TAURI__ && (window.__TAURI__.event || window.__TAURI__.core);
  if (!eventApi) return;
  const listenFn = eventApi.listen || eventApi.addListener;
  if (typeof listenFn !== 'function') return;
  listenFn.call(eventApi, 'bongo-key-event', (event) => {
    const payload = (event && typeof event === 'object' && 'payload' in event) ? event.payload : event;
    if (!payload || !payload.hand || !payload.action) return;
    const hand = payload.hand === 'left' || payload.hand === 'right' ? payload.hand : null;
    const action = payload.action === 'down' || payload.action === 'up' ? payload.action : null;
    if (!hand || !action) return;
    if (document.body.classList.contains('idle')) return;

    document.querySelectorAll('.grid-stack-item[data-type="bongo_cat"]').forEach((el) => {
      const content = keyContent(el);
      const widget = content.querySelector('.bongo-cat-widget');
      if (!widget) return;
      widget.dataset.hand = hand;
      widget.dataset.action = action;

      widget.querySelectorAll('.bongo-key').forEach((key) => {
        const isLeft = key.classList.contains('bongo-key-left');
        const isRight = key.classList.contains('bongo-key-right');
        const shouldLight = action === 'down' && ((hand === 'left' && isLeft) || (hand === 'right' && isRight));
        key.classList.toggle('is-lit', shouldLight);
      });

      if (action === 'down') {
        const state = el.__bongoState || { events: [] };
        const now = performance.now();
        state.events.push(now);
        state.events = state.events.filter((ts) => ts > now - 1000);
        el.__bongoState = state;
        const kps = widget.querySelector('.bongo-kps');
        if (kps) kps.textContent = `KPS ${state.events.length.toFixed(1)}`;
      }
    });
  });
}

function setupBongoCatPointer(widget) {
  if (!widget || widget.dataset.pointerReady === '1') return;
  widget.dataset.pointerReady = '1';
  const el = widget.closest('.grid-stack-item');
  const state = el ? (el.__bongoState || (el.__bongoState = { events: [] })) : {};
  const press = (hand) => {
    widget.dataset.hand = hand;
    widget.dataset.action = 'down';
    widget.querySelectorAll('.bongo-key').forEach((key) => {
      key.classList.toggle('is-lit', key.classList.contains(`bongo-key-${hand}`));
    });
    clearTimeout(state.pointerRelease);
    state.pointerRelease = setTimeout(() => release(), 130);
  };
  const release = () => {
    widget.dataset.action = 'up';
    widget.querySelectorAll('.bongo-key').forEach((key) => key.classList.remove('is-lit'));
  };
  widget.addEventListener('pointermove', (event) => {
    if (document.body.classList.contains('idle')) return;
    const rect = widget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / Math.max(rect.width, 1);
    const y = (event.clientY - rect.top) / Math.max(rect.height, 1);
    widget.style.setProperty('--look-x', `${((x - 0.5) * 5).toFixed(1)}px`);
    widget.style.setProperty('--look-y', `${((y - 0.45) * 3).toFixed(1)}px`);
    const hand = x < 0.5 ? 'left' : 'right';
    const now = performance.now();
    if (now - (state.lastPointerTap || 0) > 115) {
      state.lastPointerTap = now;
      press(hand);
    }
  });
  widget.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
    const rect = widget.getBoundingClientRect();
    press(event.clientX < rect.left + rect.width / 2 ? 'left' : 'right');
  });
  widget.addEventListener('pointerup', release);
  widget.addEventListener('pointercancel', release);
  widget.addEventListener('pointerleave', () => {
    widget.style.setProperty('--look-x', '0px');
    widget.style.setProperty('--look-y', '0px');
    release();
  });
}

function bongoCatMarkup(cfg = { size: '2x1', showKps: true }) {
  const size = normalizeBongoSize(cfg.size);
  const showKps = !!cfg.showKps;
  return `
    <div class="bongo-cat-widget ${showKps ? '' : 'hide-kps'}" data-size="${size}" data-action="up" data-hand="left">
      <div class="bongo-kps">${showKps ? 'KPS 0.0' : ''}</div>
      <div class="bongo-scene">
        <svg class="bongo-svg" viewBox="0 0 320 190" aria-hidden="true">
          <path class="bongo-trackpad" d="M7 112 L91 95 L133 111 L113 165 L2 144 Z"/>
          <path class="bongo-trackpad-mark" d="M19 116 L88 102 L121 114 L106 154 L11 137 Z"/>
          <path class="bongo-cat-shape" d="M69 145 C61 131 63 111 69 91 C79 61 103 42 139 31 L155 12 Q160 5 165 14 L178 35 C210 42 236 56 259 73 L278 60 Q285 57 284 67 L279 111 C289 124 292 138 286 151 L269 161 L84 161 Z"/>
          <path class="bongo-ear-inner" d="M151 24 L159 39 L170 37 Z M270 72 L278 68 L275 96 Z"/>
          <g class="bongo-eyes">
            <circle cx="143" cy="79" r="4.5"/>
            <circle cx="204" cy="91" r="4.5"/>
            <path d="M160 86 Q165 96 170 87 Q177 100 184 90"/>
          </g>
          <g class="bongo-whiskers">
            <path d="M133 93 L111 89 M133 98 L108 101 M213 102 L235 98 M212 107 L237 111"/>
          </g>
          <path class="bongo-keyboard-case" d="M113 112 L314 128 L292 184 L88 162 Z"/>
          <path class="bongo-keyboard-row" d="M119 119 L307 134 M113 130 L303 146 M106 142 L299 158 M99 153 L295 171"/>
          <path class="bongo-keyboard-cols" d="M142 114 L126 166 M164 116 L151 169 M186 118 L176 172 M208 120 L201 175 M230 122 L226 177 M252 124 L251 180 M274 126 L276 182"/>
          <g class="bongo-key bongo-key-left"><path d="M120 121 L140 123 L137 132 L117 130 Z"/></g>
          <g class="bongo-key bongo-key-right"><path d="M231 130 L251 132 L248 141 L228 139 Z"/></g>
          <g class="bongo-key bongo-key-left secondary"><path d="M111 143 L130 145 L127 154 L108 152 Z"/></g>
          <g class="bongo-key bongo-key-right secondary"><path d="M218 153 L237 155 L234 164 L215 162 Z"/></g>
          <path class="bongo-spacebar" d="M148 155 L208 160 L205 169 L145 164 Z"/>
          <g class="bongo-arm bongo-arm-left">
            <path class="bongo-paw" d="M94 99 C83 113 75 121 66 125 C54 130 47 123 50 114 C54 104 69 94 79 84 Z"/>
            <path class="bongo-paw-line" d="M65 122 Q70 112 77 106"/>
          </g>
          <g class="bongo-arm bongo-arm-right">
            <path class="bongo-paw" d="M231 111 C239 120 248 124 255 127 C266 132 275 126 271 117 C267 108 257 101 248 94 Z"/>
            <path class="bongo-paw-pad" d="M250 112 C246 107 250 102 254 105 C257 100 263 104 261 109 C266 112 263 118 257 118 C254 118 252 116 250 112Z"/>
          </g>
        </svg>
      </div>
    </div>
  `;
}


export const bongoCatWidget = {
  type: 'bongo_cat',
  markup: bongoCatMarkup,
  setup(el) {
    const widget = keyContent(el).querySelector('.bongo-cat-widget');
    if (!widget) return;
    widget.dataset.action = 'up';
    widget.dataset.hand = 'left';
    setupBongoCatPointer(widget);
  },
  register(el) {
    const widget = keyContent(el).querySelector('.bongo-cat-widget');
    return widget ? { el, type: 'bongo_cat', widget, keys: Array.from(widget.querySelectorAll('.bongo-key')), kps: widget.querySelector('.bongo-kps') } : null;
  },
  update() {},
  destroy(el) {
    const state = el.__bongoState;
    if (state?.pointerRelease) clearTimeout(state.pointerRelease);
    delete el.__bongoState;
  },
  setupKeyboardListener: setupBongoCatEventListener,
};
