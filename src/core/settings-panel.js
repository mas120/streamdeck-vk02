import { diagnostics } from './diagnostics.js';
import { getVersion } from '@tauri-apps/api/app';
import {
  TODO_STORAGE_KEY,
  backupFileName,
  countWidgets,
  createBackup,
  downloadBackup,
  restoreBackup,
  validateBackup,
} from './backup.js';
import { loadProfiles, saveProfiles } from './profiles.js';

const RESET_CONFIRM_MS = 3000;

/** Ghép báo cáo chẩn đoán: môi trường hiện tại + ring buffer lỗi. */
function buildReport() {
  const header = [
    `Thời gian: ${new Date().toISOString()}`,
    `Chế độ: ${document.body.classList.contains('edit-mode') ? 'chỉnh sửa' : 'chạy'}`,
    `Số phím: ${document.querySelectorAll('.grid-stack-item').length}`,
    `Cửa sổ: ${window.innerWidth}x${window.innerHeight}`,
    `Nền tảng: ${navigator.userAgent}`,
  ].join('\n');
  return `${header}\n\n${diagnostics.format({ title: 'Nhật ký lỗi' })}`;
}

/** Fallback khi chạy web (không có IPC): tải file .txt qua Blob. */
function downloadText(text, filename) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Modal "Cài đặt Deck": mở/đóng, xác nhận 2 bước cho "Đặt lại bố cục",
 * xuất chẩn đoán, và đóng khi chạm ra vùng nền tối.
 */
export function initSettingsPanel({
  onResetLayout,
  onAddPage,
  onDeletePage,
  getPageInfo,
  getPages,
  invokeCmd,
  getTauri,
  updater,
}) {
  const modal = document.getElementById('settingsModal');
  const btnExport = document.getElementById('btnExportDiagnostics');
  const status = document.getElementById('diagnosticsStatus');
  const btnCheckUpdates = document.getElementById('btnCheckUpdates');
  const updateStatus = document.getElementById('updateStatus');
  const appVersionLabel = document.getElementById('appVersionLabel');

  function setUpdateStatus(message) {
    if (!updateStatus) return;
    updateStatus.textContent = message;
    updateStatus.hidden = !message;
  }

  /* Hiện phiên bản đang chạy cạnh nút cập nhật (chỉ trong app desktop). */
  if (appVersionLabel && getTauri && getTauri()) {
    getVersion()
      .then((v) => {
        appVersionLabel.textContent = v ? `v${v}` : '';
      })
      .catch(() => {});
  }

  if (btnCheckUpdates) {
    btnCheckUpdates.addEventListener('click', async () => {
      if (!getTauri || !getTauri()) {
        setUpdateStatus('Chỉ kiểm tra được cập nhật trong app desktop.');
        return;
      }
      if (!updater) {
        setUpdateStatus('Tính năng cập nhật chưa sẵn sàng.');
        return;
      }
      btnCheckUpdates.disabled = true;
      setUpdateStatus('Đang kiểm tra cập nhật…');
      try {
        const result = await updater.checkNow();
        if (result.outcome === 'available') {
          setUpdateStatus(`Có bản v${result.version}. Làm theo hộp thoại vừa hiện để cập nhật.`);
        } else if (result.outcome === 'latest') {
          setUpdateStatus(
            `Bạn đang dùng bản mới nhất${result.version ? ` (v${result.version})` : ''}.`
          );
        } else if (result.outcome === 'busy') {
          setUpdateStatus('Đang kiểm tra hoặc đang cập nhật, chờ một chút…');
        } else if (result.outcome === 'unsupported') {
          setUpdateStatus('Chỉ kiểm tra được cập nhật trong app desktop.');
        } else {
          setUpdateStatus(`Không kiểm tra được cập nhật: ${result.error || 'lỗi không xác định'}`);
        }
      } finally {
        btnCheckUpdates.disabled = false;
      }
    });
  }

  function setStatus(message) {
    if (!status) return;
    status.textContent = message;
    status.hidden = !message;
  }

  // Mỗi nhóm đăng ký hàm làm mới để số trang/tên trang đúng tại thời điểm mở.
  const openHandlers = [];

  function open() {
    setStatus('');
    openHandlers.forEach((refresh) => {
      try {
        refresh();
      } catch (err) {
        console.warn('Làm mới Cài đặt lỗi:', err);
      }
    });
    modal?.classList.add('active');
  }

  function close() {
    modal?.classList.remove('active');
  }

  function isOpen() {
    return !!modal?.classList.contains('active');
  }

  /* "Đặt lại bố cục" là thao tác PHÁ HUỶ (xoá sạch layout đã lưu) và trên màn cảm ứng rất
     dễ chạm nhầm -> cần XÁC NHẬN: chạm lần 1 đổi nhãn + màu cảnh báo (tự hết hạn sau 3s),
     chạm lần 2 trong thời gian đó mới thực sự đặt lại. */
  const btnResetLayout = document.getElementById('btnResetLayout');
  if (btnResetLayout) {
    const RESET_LABEL = btnResetLayout.textContent;
    let resetArmedTimer = null;
    const disarmReset = () => {
      clearTimeout(resetArmedTimer);
      resetArmedTimer = null;
      btnResetLayout.textContent = RESET_LABEL;
      btnResetLayout.classList.remove('is-armed');
    };
    btnResetLayout.addEventListener('click', () => {
      if (resetArmedTimer === null) {
        btnResetLayout.textContent = 'Chạm lại để xác nhận';
        btnResetLayout.classList.add('is-armed');
        resetArmedTimer = setTimeout(disarmReset, RESET_CONFIRM_MS);
        return;
      }
      disarmReset();
      onResetLayout();
    });
  }

  /* ---------- Sao lưu / khôi phục toàn bộ dữ liệu ---------- */
  function setBackupStatus(message) {
    const el = document.getElementById('backupStatus');
    if (!el) return;
    el.textContent = message;
    el.hidden = !message;
  }

  async function collectBackup() {
    let layout = null;
    let config = {};
    if (getTauri && getTauri()) {
      const [rawLayout, rawConfig] = await Promise.all([
        invokeCmd('load_layout'),
        invokeCmd('load_app_config'),
      ]);
      try {
        layout = rawLayout ? JSON.parse(rawLayout) : null;
      } catch {
        layout = null;
      }
      try {
        config = rawConfig ? JSON.parse(rawConfig) : {};
      } catch {
        config = {};
      }
    } else {
      try {
        layout = JSON.parse(localStorage.getItem('STREAMDECK_VK02_LAYOUT') || 'null');
      } catch {
        layout = null;
      }
      config = {
        brightness: parseInt(localStorage.getItem('STREAMDECK_VK02_BRIGHTNESS') ?? '100', 10),
        idleMs: parseInt(localStorage.getItem('STREAMDECK_VK02_IDLE_MS') ?? '45000', 10),
      };
    }
    const todo = localStorage.getItem(TODO_STORAGE_KEY);
    return createBackup({ layout, config, todo });
  }

  const modalActions = modal?.querySelector('.modal-actions');
  if (modalActions) {
    const backupGroup = document.createElement('div');
    backupGroup.className = 'form-group';
    backupGroup.innerHTML = `
      <label>Sao lưu dữ liệu</label>
      <div class="settings-update-row">
        <button class="btn" id="btnBackupExport" type="button">Sao lưu ra file</button>
        <button class="btn" id="btnBackupImport" type="button">Khôi phục từ file…</button>
      </div>
      <input type="file" id="inpBackupFile" accept="application/json,.json" hidden />
      <div class="settings-note" id="backupStatus" role="status" hidden></div>`;
    modalActions.before(backupGroup);

    const btnBackupExport = backupGroup.querySelector('#btnBackupExport');
    const btnBackupImport = backupGroup.querySelector('#btnBackupImport');
    const inpBackupFile = backupGroup.querySelector('#inpBackupFile');

    btnBackupExport.addEventListener('click', async () => {
      btnBackupExport.disabled = true;
      setBackupStatus('Đang gom dữ liệu…');
      try {
        const backup = await collectBackup();
        const name = downloadBackup(backup, backupFileName());
        setBackupStatus(`Đã tạo ${name} (${countWidgets(backup.layout)} phím).`);
      } catch (err) {
        console.error('Sao lưu lỗi:', err);
        setBackupStatus(`Không sao lưu được: ${err}`);
      } finally {
        btnBackupExport.disabled = false;
      }
    });

    btnBackupImport.addEventListener('click', () => {
      inpBackupFile.value = '';
      inpBackupFile.click();
    });

    inpBackupFile.addEventListener('change', async () => {
      const file = inpBackupFile.files?.[0];
      inpBackupFile.value = '';
      if (!file) return;
      setBackupStatus('Đang đọc file…');
      try {
        const text = await file.text();
        const result = validateBackup(text);
        if (!result.ok) {
          setBackupStatus(`File không hợp lệ: ${result.error}`);
          return;
        }
        const count = countWidgets(result.backup.layout);
        const when = result.backup.createdAt ? ` lúc ${result.backup.createdAt}` : '';
        const ok = window.confirm(
          `Khôi phục ${count} phím từ bản sao lưu${when}?\n` +
            'Bố cục và cài đặt hiện tại sẽ bị ghi đè (bản cũ vẫn được giữ trong .bak).'
        );
        if (!ok) {
          setBackupStatus('Đã huỷ khôi phục.');
          return;
        }
        btnBackupImport.disabled = true;
        setBackupStatus('Đang khôi phục…');
        await restoreBackup(result.backup, {
          invoke: getTauri && getTauri() ? invokeCmd : null,
        });
        setBackupStatus(`Đã khôi phục ${count} phím. Đang tải lại…`);
        setTimeout(() => location.reload(), 600);
      } catch (err) {
        console.error('Khôi phục lỗi:', err);
        setBackupStatus(`Không khôi phục được: ${err}`);
      } finally {
        btnBackupImport.disabled = false;
      }
    });
  }

  /* ---------- Nhiều trang deck: thêm/xoá trang ---------- */
  if (modalActions && typeof onAddPage === 'function') {
    const pageGroup = document.createElement('div');
    pageGroup.className = 'form-group';
    pageGroup.innerHTML = `
      <label>Trang deck</label>
      <div class="settings-update-row">
        <button class="btn" id="btnAddPage" type="button">+ Thêm trang</button>
        <button class="btn" id="btnDeletePage" type="button">Xoá trang này</button>
      </div>
      <div class="settings-note" id="pageStatus" role="status" hidden></div>`;
    modalActions.before(pageGroup);

    const statusEl = pageGroup.querySelector('#pageStatus');
    const btnAdd = pageGroup.querySelector('#btnAddPage');
    const btnDelete = pageGroup.querySelector('#btnDeletePage');
    const readInfo = typeof getPageInfo === 'function' ? getPageInfo : () => null;

    function setPageStatus(message) {
      statusEl.textContent = message;
      statusEl.hidden = !message;
    }

    function syncPageButtons() {
      const info = readInfo();
      if (!info) return;
      btnDelete.disabled = info.count <= 1;
      setPageStatus(`Trang ${info.index}/${info.count}${info.name ? ' · ' + info.name : ''}`);
    }

    btnAdd.addEventListener('click', () => {
      onAddPage();
      syncPageButtons();
    });

    btnDelete.addEventListener('click', () => {
      const info = readInfo();
      if (!info || info.count <= 1) return;
      const ok = window.confirm(`Xoá "${info.name || 'trang này'}"? Các phím trong trang sẽ mất.`);
      if (!ok) return;
      if (typeof onDeletePage === 'function') onDeletePage();
      syncPageButtons();
    });

    syncPageButtons();
    openHandlers.push(syncPageButtons);
  }

  /* ---------- Khởi động cùng Windows ---------- */
  if (modalActions) {
    const startupGroup = document.createElement('div');
    startupGroup.className = 'form-group';
    startupGroup.innerHTML = `
      <label>Khởi động</label>
      <label class="settings-check">
        <input type="checkbox" id="autostartEnabled" />
        <span>Khởi động cùng Windows</span>
      </label>
      <div class="settings-note" id="autostartStatus" role="status" hidden></div>`;
    modalActions.before(startupGroup);

    const autostartBox = startupGroup.querySelector('#autostartEnabled');
    const autostartStatus = startupGroup.querySelector('#autostartStatus');
    const hasIpc = !!(getTauri && getTauri()) && typeof invokeCmd === 'function';

    function setAutostartStatus(message) {
      autostartStatus.textContent = message;
      autostartStatus.hidden = !message;
    }

    async function refreshAutostart() {
      if (!hasIpc) {
        autostartBox.checked = false;
        autostartBox.disabled = true;
        setAutostartStatus('Chỉ đổi được trong app desktop.');
        return;
      }
      try {
        autostartBox.checked = !!(await invokeCmd('get_autostart'));
        setAutostartStatus('');
      } catch (err) {
        console.warn('Đọc autostart lỗi:', err);
        setAutostartStatus('Không đọc được trạng thái khởi động cùng Windows.');
      }
    }

    autostartBox.addEventListener('change', async () => {
      const wanted = autostartBox.checked;
      autostartBox.disabled = true;
      try {
        const actual = await invokeCmd('set_autostart', { enabled: wanted });
        autostartBox.checked = !!actual;
        setAutostartStatus(
          actual ? 'Đã bật khởi động cùng Windows.' : 'Đã tắt khởi động cùng Windows.'
        );
      } catch (err) {
        console.error('Đổi autostart lỗi:', err);
        autostartBox.checked = !wanted;
        setAutostartStatus(`Không đổi được: ${err}`);
      } finally {
        autostartBox.disabled = !hasIpc;
      }
    });

    refreshAutostart();
    openHandlers.push(refreshAutostart);
  }

  /* ---------- Profile theo ứng dụng đang focus ---------- */
  if (modalActions) {
    const profileGroup = document.createElement('div');
    profileGroup.className = 'form-group';
    profileGroup.innerHTML = `
      <label>Profile theo ứng dụng</label>
      <label class="settings-check">
        <input type="checkbox" id="profileEnabled" />
        <span>Tự chuyển trang theo app đang dùng</span>
      </label>
      <div class="settings-update-row">
        <button class="btn" id="btnProfileAssign" type="button">
          Gán app đang focus → trang này
        </button>
        <button class="btn" id="btnProfileClear" type="button">Xoá tất cả gán</button>
      </div>
      <div class="settings-note" id="profileStatus" role="status" hidden></div>`;
    modalActions.before(profileGroup);

    const enabledBox = profileGroup.querySelector('#profileEnabled');
    const btnAssign = profileGroup.querySelector('#btnProfileAssign');
    const btnClear = profileGroup.querySelector('#btnProfileClear');
    const profileStatus = profileGroup.querySelector('#profileStatus');
    const hasIpc = !!(getTauri && getTauri()) && typeof invokeCmd === 'function';
    const readPages = typeof getPages === 'function' ? getPages : () => [];

    function setProfileStatus(message) {
      profileStatus.textContent = message;
      profileStatus.hidden = !message;
    }

    function describeProfiles() {
      const { map } = loadProfiles();
      const pages = readPages() || [];
      const names = new Map(pages.map((page) => [page.id, page.name]));
      const entries = Object.entries(map);
      if (!entries.length) return 'Chưa gán app nào.';
      return entries
        .map(([process, pageId]) => {
          const name = names.get(pageId);
          return name ? `${process} → ${name}` : `${process} → (trang đã xoá)`;
        })
        .join('\n');
    }

    function syncProfiles() {
      const profiles = loadProfiles();
      enabledBox.checked = profiles.enabled;
      const summary = describeProfiles();
      setProfileStatus(summary === 'Chưa gán app nào.' ? summary : `Đã gán:\n${summary}`);
    }

    enabledBox.checked = loadProfiles().enabled;
    enabledBox.disabled = !hasIpc;
    btnAssign.disabled = !hasIpc;
    btnClear.disabled = !hasIpc;
    syncProfiles();
    if (!hasIpc) setProfileStatus('Chỉ dùng được trong app desktop (cần đọc tiến trình).');
    openHandlers.push(() => {
      syncProfiles();
      if (!hasIpc) setProfileStatus('Chỉ dùng được trong app desktop (cần đọc tiến trình).');
    });

    enabledBox.addEventListener('change', () => {
      const profiles = loadProfiles();
      saveProfiles({ ...profiles, enabled: enabledBox.checked });
      syncProfiles();
    });

    btnAssign.addEventListener('click', async () => {
      const info = typeof getPageInfo === 'function' ? getPageInfo() : null;
      if (!info || !info.id) return;
      setProfileStatus('Đang đọc app đang focus…');
      try {
        const processName = await invokeCmd('get_foreground_process');
        if (!processName) {
          setProfileStatus('Không đọc được app đang focus. Thử bấm vào cửa sổ app đó rồi lại.');
          return;
        }
        const key = String(processName).trim().toLowerCase();
        const profiles = loadProfiles();
        saveProfiles({ ...profiles, map: { ...profiles.map, [key]: info.id } });
        syncProfiles();
        setProfileStatus(`Đã gán ${key} → ${info.name || 'trang này'}.`);
      } catch (err) {
        console.error('Gán profile lỗi:', err);
        setProfileStatus(`Không gán được: ${err}`);
      }
    });

    btnClear.addEventListener('click', () => {
      const profiles = loadProfiles();
      saveProfiles({ ...profiles, map: {} });
      syncProfiles();
    });
  }

  if (btnExport) {
    btnExport.addEventListener('click', async () => {
      const text = buildReport();
      if (getTauri && getTauri()) {
        btnExport.disabled = true;
        setStatus('Đang ghi file…');
        try {
          const path = await invokeCmd('save_diagnostics', { text });
          setStatus(`Đã lưu: ${path}`);
        } catch (err) {
          console.error('save_diagnostics lỗi:', err);
          setStatus(`Không lưu được chẩn đoán: ${err}`);
        } finally {
          btnExport.disabled = false;
        }
        return;
      }
      try {
        downloadText(text, `diagnostics-${Date.now()}.txt`);
        setStatus('Đã tải file chẩn đoán');
      } catch (err) {
        console.error('Xuất chẩn đoán lỗi:', err);
        setStatus('Không tạo được file chẩn đoán');
      }
    });
  }

  document.getElementById('btnSettingsClose')?.addEventListener('click', close);

  modal?.addEventListener('pointerdown', (e) => {
    if (e.target === modal) close();
  });

  return { open, close, isOpen };
}
