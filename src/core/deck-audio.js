/**
 * Đồng bộ âm lượng hệ thống / app / media theo vòng quét nền.
 * Tạm dừng khi deck đang tối (idle) hoặc cửa sổ bị ẩn; đồng bộ ngay khi thức dậy.
 */
export function createDeckAudioSync({
  getTauri,
  invokeCmd,
  volumeWidget,
  appSliderWidget,
  mediaWidget,
  todoWidget,
  isDeckPaused,
  isSystemVolumeEchoGuardActive,
}) {
  let systemVolumeBusy = false;

  async function syncSystemVolume() {
    if (!getTauri() || systemVolumeBusy) return;
    const items = Array.from(document.querySelectorAll('.grid-stack-item[data-type="volume_slider"]'));
    if (!items.length) return;
    if (isSystemVolumeEchoGuardActive()) return;
    systemVolumeBusy = true;
    try {
      const info = await invokeCmd('get_master_volume');
      if (!info || typeof info.volume !== 'number') return;
      // Trong lúc chờ Rust trả lời, tay có thể vừa vuốt -> bỏ kết quả cũ.
      if (isSystemVolumeEchoGuardActive()) return;
      const pct = Math.round(info.volume);
      items.forEach((el) => {
        if (el.dataset.dragging === '1') return;
        const unit = el.querySelector('.volume-deck-unit');
        if (!unit) return;
        el.dataset.target = String(pct);
        volumeWidget.setMuted(unit, el, !!info.muted);
      });
    } catch (err) {
      console.warn('get_master_volume lỗi:', err);
    } finally {
      systemVolumeBusy = false;
    }
  }

  function syncDeckAudio() {
    appSliderWidget.sync();
    mediaWidget.syncAll();
    syncSystemVolume();
  }

  function refreshOnResume() {
    syncDeckAudio();
    todoWidget.updateAll();   // storage event bị bỏ lỡ khi deck đang tạm dừng
  }

  function start() {
    setInterval(() => { if (!isDeckPaused()) syncDeckAudio(); }, 2000);
    setInterval(() => { if (!isDeckPaused()) mediaWidget.tick(); }, 500);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshOnResume(); });
  }

  return { syncSystemVolume, syncDeckAudio, refreshOnResume, start };
}
