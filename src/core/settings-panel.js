import { diagnostics } from './diagnostics.js';

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
export function initSettingsPanel({ onResetLayout, invokeCmd, getTauri }) {
  const modal = document.getElementById('settingsModal');
  const btnExport = document.getElementById('btnExportDiagnostics');
  const status = document.getElementById('diagnosticsStatus');

  function setStatus(message) {
    if (!status) return;
    status.textContent = message;
    status.hidden = !message;
  }

  function open() {
    setStatus('');
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
