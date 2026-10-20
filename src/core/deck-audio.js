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
    startTimer();
    syncDeckAudio();
    todoWidget.updateAll();   // storage event bị bỏ lỡ khi deck đang tạm dừng
  }

  /* Nhịp quét: 1 vòng/giây, mỗi việc có chu kỳ riêng.
     - media tick: 1s (chỉ vẽ thanh tiến trình, không gọi IPC)
     - master volume: 2s (tự bỏ qua nếu không có volume_slider)
     - media state: 2s (tự bỏ qua nếu không có media_player)
     - session app: 5s (tự bỏ qua nếu không có app_slider) */
  const LOOP_MS = 1000;
  const MEDIA_SYNC_MS = 2000;
  const VOLUME_SYNC_MS = 2000;
  const APP_SYNC_MS = 5000;
  let timer = null;
  let lastMediaSync = 0;
  let lastVolumeSync = 0;
  let lastAppSync = 0;

  function stopTimer() {
    if (timer === null) return;
    clearInterval(timer);
    timer = null;
  }

  function startTimer() {
    if (timer !== null) return;
    lastMediaSync = lastVolumeSync = lastAppSync = 0;
    timer = setInterval(loop, LOOP_MS);
  }

  function loop() {
    if (isDeckPaused()) {
      stopTimer();
      return;
    }
    const now = performance.now();
    mediaWidget.tick();
    if (now - lastVolumeSync >= VOLUME_SYNC_MS) {
      lastVolumeSync = now;
      syncSystemVolume();
    }
    if (now - lastMediaSync >= MEDIA_SYNC_MS) {
      lastMediaSync = now;
      mediaWidget.syncAll();
    }
    if (now - lastAppSync >= APP_SYNC_MS) {
      lastAppSync = now;
      appSliderWidget.sync();
    }
  }

  function start() {
    startTimer();
    syncDeckAudio();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stopTimer();
      else refreshOnResume();
    });
    window.addEventListener('deck-idle-change', (event) => {
      // Thức dậy: initDisplaySettings đã gọi onWake -> refreshOnResume (quét đầy đủ).
      if (event?.detail?.idle) stopTimer();
      else startTimer();
    });
    window.addEventListener('focus', refreshOnResume);
  }

  return { syncSystemVolume, syncDeckAudio, refreshOnResume, start };
}
