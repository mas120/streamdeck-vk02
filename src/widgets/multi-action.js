/**
 * Phím đa hành động: chạm để chạy lần lượt các bước trong cfg.actions.
 * Chạm lần nữa khi đang chạy = huỷ (dừng sau bước hiện tại).
 */
import { flashKeycap, isEditMode } from '../core/mode-manager.js';
import { widgetRegistry } from '../core/widget-registry.js';
import { parseActionsCfg, runActions } from '../core/multi-action.js';
import '../styles/widgets/multi-action.css';

function readCfg(el) {
  try {
    return JSON.parse(el.dataset.cfg || '{}') || {};
  } catch {
    return {};
  }
}

widgetRegistry.registerWidget({
  type: 'multi_action',
  label: 'Đa hành động',
  icon: '🔗',
  defaultSize: [1, 1],
  configFields: [],
  create: ({ el, services }) => {
    const actions = parseActionsCfg(readCfg(el));
    const state = { running: false, cancel: false };
    let handler = null;
    let resetTimer = null;

    function unit() {
      return el.querySelector('.multi-action-unit');
    }

    function setStep(text) {
      const node = unit()?.querySelector('.ma-step');
      if (node) node.textContent = text;
    }

    return {
      markup: `
        <div class="multi-action-unit${actions.length ? '' : ' is-empty'}" data-count="${actions.length}">
          <span class="ma-count">${actions.length ? actions.length + ' bước' : '—'}</span>
          <span class="ma-label">${actions.length ? 'Chuỗi hành động' : 'Chưa cấu hình'}</span>
          <span class="ma-step" aria-live="polite"></span>
        </div>`,
      setup: () => {
        const node = unit();
        if (!node) return;
        handler = async (event) => {
          if (isEditMode) return;
          event.preventDefault();
          event.stopPropagation();
          if (state.running) {
            state.cancel = true;
            setStep('Đang huỷ…');
            return;
          }
          if (!actions.length) {
            setStep('Chưa có bước nào');
            return;
          }
          state.running = true;
          state.cancel = false;
          clearTimeout(resetTimer);
          node.classList.add('is-running');
          try {
            const result = await runActions(actions, {
              callAction: services.callTauriAction,
              onStep: (index, total) => setStep(`${index}/${total}`),
              isCancelled: () => state.cancel,
            });
            if (result.cancelled) setStep('Đã huỷ');
            else if (result.error) setStep('Lỗi');
            else {
              setStep('Xong');
              flashKeycap(el, true);
            }
          } finally {
            state.running = false;
            node.classList.remove('is-running');
            resetTimer = setTimeout(() => {
              if (!state.running) setStep('');
            }, 1500);
          }
        };
        node.addEventListener('click', handler);
      },
      destroy: () => {
        clearTimeout(resetTimer);
        if (handler) unit()?.removeEventListener('click', handler);
        handler = null;
      },
    };
  },
});
