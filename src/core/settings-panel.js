const RESET_CONFIRM_MS = 3000;

/**
 * Modal "Cài đặt Deck": mở/đóng, xác nhận 2 bước cho "Đặt lại bố cục",
 * và đóng khi chạm ra vùng nền tối.
 */
export function initSettingsPanel({ onResetLayout }) {
  const modal = document.getElementById('settingsModal');

  function open() {
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

  modal?.addEventListener('pointerdown', (e) => {
    if (e.target === modal) close();
  });

  return { open, close, isOpen };
}
