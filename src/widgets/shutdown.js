import { isEditMode } from '../core/mode-manager.js';
import { hydrateVectorIcons, loadIconSet, vectorMarkup } from '../icons.js';
import '../styles/widgets/shutdown.css';

export function createShutdownWidget({ invokeCmd, flashKeycap }) {
  let activeDialog = null;

  function markup() {
    return `
      <div class="shutdown-unit">
        <button class="shutdown-button" type="button" aria-label="Tắt máy tính">
          <span class="deck-icon-core" data-fit="contain" aria-hidden="true">
            <span class="icon-chip">${vectorMarkup('lucide:power')}</span>
          </span>
        </button>
        <span class="shutdown-status" aria-live="polite"></span>
      </div>`;
  }

  function confirmShutdown(el, button) {
    if (activeDialog) return Promise.resolve(false);

    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'shutdown-confirm-backdrop';
      overlay.innerHTML = `
        <section class="shutdown-confirm-dialog" role="alertdialog" aria-modal="true"
          aria-labelledby="shutdownConfirmTitle" aria-describedby="shutdownConfirmMessage">
          <div class="shutdown-confirm-heading">
            <span class="shutdown-confirm-icon" aria-hidden="true">${vectorMarkup('lucide:power')}</span>
            <div class="shutdown-confirm-copy">
              <h2 id="shutdownConfirmTitle">Tắt máy tính?</h2>
              <p id="shutdownConfirmMessage">Máy tính sẽ tắt ngay. Hãy lưu công việc đang mở trước khi tiếp tục.</p>
            </div>
          </div>
          <div class="shutdown-confirm-actions">
            <button class="shutdown-confirm-cancel" type="button">Hủy</button>
            <button class="shutdown-confirm-accept" type="button">
              <span class="shutdown-confirm-button-icon" aria-hidden="true">${vectorMarkup('lucide:power')}</span>
              <span>Tắt máy</span>
            </button>
          </div>
        </section>`;

      const cancel = overlay.querySelector('.shutdown-confirm-cancel');
      const accept = overlay.querySelector('.shutdown-confirm-accept');
      let settled = false;
      const close = (confirmed) => {
        if (settled) return;
        settled = true;
        activeDialog = null;
        window.removeEventListener('keydown', onKeyDown);
        overlay.remove();
        if (el.__shutdownClose === close) delete el.__shutdownClose;
        delete el.__shutdownDialog;
        if (!confirmed && button.isConnected) button.focus({ preventScroll: true });
        resolve(confirmed);
      };
      const onKeyDown = (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          close(false);
        } else if (event.key === 'Tab') {
          const focusables = [cancel, accept];
          const current = focusables.indexOf(document.activeElement);
          if (event.shiftKey && current <= 0) {
            event.preventDefault();
            accept.focus();
          } else if (!event.shiftKey && current === focusables.length - 1) {
            event.preventDefault();
            cancel.focus();
          }
        }
      };

      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) close(false);
      });
      cancel.addEventListener('click', () => close(false));
      accept.addEventListener('click', () => close(true));
      window.addEventListener('keydown', onKeyDown);
      document.body.appendChild(overlay);
      activeDialog = overlay;
      el.__shutdownDialog = overlay;
      el.__shutdownClose = close;
      loadIconSet('lucide').then(() => hydrateVectorIcons(overlay));
      requestAnimationFrame(() => cancel.focus({ preventScroll: true }));
    });
  }

  function setup(el) {
    const button = el.querySelector('.shutdown-button');
    const status = el.querySelector('.shutdown-status');
    if (!button || el.__shutdownButton === button) return;
    loadIconSet('lucide').then(() => hydrateVectorIcons(el));
    if (el.__shutdownButton && el.__shutdownHandler) {
      el.__shutdownButton.removeEventListener('click', el.__shutdownHandler);
    }

    el.__shutdownButton = button;
    el.__shutdownHandler = async (event) => {
      if (isEditMode) return;
      event.preventDefault();
      event.stopPropagation();
      if (button.disabled) return;

      if (!window.__TAURI__) {
        if (status) status.textContent = 'Chỉ dùng trong ứng dụng desktop';
        return;
      }
      if (!await confirmShutdown(el, button)) return;

      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      if (status) status.textContent = 'Đang gửi lệnh tắt máy...';
      try {
        await invokeCmd('shutdown_computer');
        if (status) status.textContent = 'Đang tắt máy';
        flashKeycap(el, true);
      } catch (error) {
        console.error('shutdown_computer lỗi:', error);
        button.disabled = false;
        button.removeAttribute('aria-busy');
        if (status) status.textContent = 'Không thể gửi lệnh tắt máy';
        flashKeycap(el, false);
      }
    };
    button.addEventListener('click', el.__shutdownHandler);
  }

  function destroy(el) {
    el.__shutdownClose?.(false);
    if (el.__shutdownButton && el.__shutdownHandler) {
      el.__shutdownButton.removeEventListener('click', el.__shutdownHandler);
    }
    delete el.__shutdownButton;
    delete el.__shutdownHandler;
  }

  return { type: 'shutdown_widget', markup, setup, destroy };
}