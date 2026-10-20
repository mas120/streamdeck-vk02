import { check } from '@tauri-apps/plugin-updater';
import { getVersion } from '@tauri-apps/api/app';

/** Chờ vài giây sau khi app mở để không tranh CPU/mạng với lúc khởi động deck. */
const STARTUP_CHECK_DELAY_MS = 5000;
const CHECK_TIMEOUT_MS = 20000;

function formatError(err) {
  if (!err) return 'lỗi không xác định';
  if (typeof err === 'string') return err;
  return err.message || String(err);
}

function formatBytes(bytes) {
  if (!bytes || bytes < 0) return '';
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${mb.toFixed(1)} MB`;
}

/**
 * Tự cập nhật qua GitHub Releases.
 *
 * - `start()`: kiểm tra ngầm sau khi app mở; chỉ hiện hộp thoại khi CÓ bản mới.
 * - `checkNow()`: kiểm tra thủ công (nút trong Cài đặt Deck), trả về kết quả để UI báo.
 * - Khi người dùng đồng ý: tải installer đã ký rồi chạy; trên Windows app tự thoát
 *   và installer tự mở lại app (mặc định của updater).
 *
 * Không có IPC (chạy web bằng `npm run dev`): mọi hàm trả về `unsupported`,
 * không đụng tới DOM.
 */
export function createUpdater({ getTauri } = {}) {
  let modal = null;
  let currentUpdate = null;
  let checking = false;
  let installing = false;
  let startupTimer = null;

  function hasTauri() {
    return !!getTauri?.();
  }

  async function currentVersion() {
    try {
      return await getVersion();
    } catch {
      return '';
    }
  }

  /* ---------------------------------------------------------------- modal */
  function ensureModal() {
    if (modal) return modal;

    const root = document.createElement('div');
    root.className = 'update-overlay';
    root.hidden = true;
    root.innerHTML = `
      <div class="update-card" role="dialog" aria-modal="true" aria-labelledby="updateTitle">
        <div class="update-title" id="updateTitle">Có bản cập nhật mới</div>
        <div class="update-version"></div>
        <div class="update-notes"></div>
        <div class="update-progress" hidden>
          <div class="update-progress-bar"></div>
        </div>
        <div class="update-status" role="status"></div>
        <div class="update-actions">
          <button class="btn" type="button" data-update-action="later">Để sau</button>
          <button class="btn btn-save" type="button" data-update-action="install">Cập nhật ngay</button>
        </div>
      </div>
    `;
    document.body.appendChild(root);

    const card = root.querySelector('.update-card');
    modal = {
      root,
      card,
      version: root.querySelector('.update-version'),
      notes: root.querySelector('.update-notes'),
      progress: root.querySelector('.update-progress'),
      bar: root.querySelector('.update-progress-bar'),
      status: root.querySelector('.update-status'),
      btnLater: root.querySelector('[data-update-action="later"]'),
      btnInstall: root.querySelector('[data-update-action="install"]'),
    };

    modal.btnLater.addEventListener('click', () => dismiss());
    modal.btnInstall.addEventListener('click', () => install());
    return modal;
  }

  function setStatus(text) {
    const ui = ensureModal();
    ui.status.textContent = text;
  }

  function setProgress(ratio, { indeterminate = false } = {}) {
    const ui = ensureModal();
    ui.progress.hidden = false;
    ui.progress.classList.toggle('is-indeterminate', indeterminate);
    ui.bar.style.width = indeterminate ? '' : `${Math.round(ratio * 100)}%`;
  }

  function showUpdate(update) {
    const ui = ensureModal();
    const from = update.currentVersion ? ` (đang dùng v${update.currentVersion})` : '';
    ui.version.textContent = `v${update.version}${from}`;
    const notes = (update.body || '').trim();
    ui.notes.textContent = notes;
    ui.notes.hidden = !notes;
    ui.status.textContent = '';
    ui.progress.hidden = true;
    ui.progress.classList.remove('is-indeterminate');
    ui.bar.style.width = '0%';
    ui.btnInstall.disabled = false;
    ui.btnLater.disabled = false;
    ui.btnInstall.textContent = 'Cập nhật ngay';
    ui.root.hidden = false;
  }

  function hideModal() {
    if (modal) modal.root.hidden = true;
  }

  async function dismiss() {
    hideModal();
    if (!installing && currentUpdate) {
      try {
        await currentUpdate.close();
      } catch {
        /* bỏ qua: resource đã đóng */
      }
      currentUpdate = null;
    }
  }

  /* ------------------------------------------------------------- checking */
  async function checkNow({ auto = false } = {}) {
    if (!hasTauri()) return { outcome: 'unsupported' };
    if (checking || installing) return { outcome: 'busy' };

    checking = true;
    try {
      const update = await check({ timeout: CHECK_TIMEOUT_MS });
      if (!update) {
        return { outcome: 'latest', version: await currentVersion() };
      }
      if (currentUpdate) {
        try {
          await currentUpdate.close();
        } catch {
          /* bỏ qua */
        }
      }
      currentUpdate = update;
      showUpdate(update);
      return { outcome: 'available', version: update.version };
    } catch (err) {
      console.error('Kiểm tra cập nhật lỗi:', err);
      if (!auto) return { outcome: 'error', error: formatError(err) };
      return { outcome: 'error', error: formatError(err), auto: true };
    } finally {
      checking = false;
    }
  }

  /* ------------------------------------------------------------ installing */
  async function install() {
    if (!currentUpdate || installing) return;
    const ui = ensureModal();
    installing = true;
    ui.btnInstall.disabled = true;
    ui.btnLater.disabled = true;
    ui.btnInstall.textContent = 'Đang cập nhật…';

    let received = 0;
    let total = 0;
    setProgress(0, { indeterminate: true });
    setStatus('Đang tải bản cập nhật…');

    try {
      await currentUpdate.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          total = event.data?.contentLength || 0;
          received = 0;
          setProgress(0, { indeterminate: !total });
          return;
        }
        if (event.event === 'Progress') {
          received += event.data?.chunkLength || 0;
          if (total) {
            setProgress(Math.min(1, received / total));
            setStatus(
              `Đang tải ${Math.round((received / total) * 100)}% (${formatBytes(received)}/${formatBytes(total)})`
            );
          } else {
            setProgress(0, { indeterminate: true });
            setStatus(`Đang tải… ${formatBytes(received)}`);
          }
          return;
        }
        if (event.event === 'Finished') {
          setProgress(1);
          setStatus('Đang cài đặt… app sẽ tự khởi động lại.');
        }
      });
      /* Trên Windows app thường đã thoát ở bước trên; nếu vẫn còn chạy thì báo trạng thái. */
      installing = false;
      ui.btnInstall.textContent = 'Đang cài đặt…';
      setStatus('Đang cài đặt… app sẽ tự khởi động lại.');
    } catch (err) {
      console.error('Cập nhật thất bại:', err);
      installing = false;
      ui.btnInstall.disabled = false;
      ui.btnLater.disabled = false;
      ui.btnInstall.textContent = 'Thử lại';
      setStatus(`Cập nhật thất bại: ${formatError(err)}`);
    }
  }

  /* ---------------------------------------------------------------- start */
  function start() {
    if (!hasTauri()) return;
    clearTimeout(startupTimer);
    startupTimer = setTimeout(() => {
      checkNow({ auto: true });
    }, STARTUP_CHECK_DELAY_MS);
  }

  return {
    start,
    checkNow,
    get isInstalling() {
      return installing;
    },
  };
}
