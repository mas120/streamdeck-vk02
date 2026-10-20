import { COLS, ROWS, STORAGE_KEY, initGrid, initBackdrop } from './grid.js';
import { clampInt, clampFloat, escapeHtml } from './utils.js';
import { initDisplaySettings } from './idle.js';
import { loadAppConfig } from './config-store.js';
import { loadLayout as loadSavedLayout } from './layout-store.js';
import { defaultIconForType } from './widget-types.js';
import { isVectorIcon, vectorMarkup, hydrateVectorIcons, initIconUI } from '../icons.js';
import { TREE_SVGS } from '../forest-tree-svgs.js';
import { createTodoWidget } from '../widgets/todo.js';
import { createPomodoroWidget, parsePomoTarget } from '../widgets/pomodoro.js';
import {
  createWeatherWidget, WEATHER_DEFAULT, WEATHER_MIN_W, WEATHER_REFRESH_MS,
  normalizeWeatherSkin, parseWeatherCfg,
} from '../widgets/weather.js';
import { bongoCatWidget, normalizeBongoSize, parseBongoCfg } from '../widgets/bongo-cat.js';
import { createVolumeWidget, VOL_GLYPH, isDefaultVolIcon, applyVolumeOrient } from '../widgets/volume.js';
import { createMicWidget } from '../widgets/mic.js';
import { createMediaWidget } from '../widgets/media.js';
import { createMusicWaveWidget } from '../widgets/music-wave.js';
import { createShutdownWidget } from '../widgets/shutdown.js';
import { createAppSliderWidget } from '../widgets/app-slider.js';
import { createModalEditor } from './modal-editor.js';
import { createIconSource } from './icon-source.js';
import { setupLongPressEntry } from './long-press-entry.js';
import { createWidgetRenderer } from './widget-renderer.js';
import { CLOCK_DEFAULT, clockZoneLabel, clockWidget, normalizeClockFace, parseClockCfg } from '../widgets/clock.js';
import {
  liveWidgetRegistry,
  registerLiveWidget,
  unregisterLiveWidget,
  startLiveWidgetScheduler,
} from './registry.js';
import { DEFAULT_WIDGETS } from './widget-defs.js';
import { createTauriIpc } from './tauri-ipc.js';
import { isEditMode, applyMode, setEditMode, flashKeycap } from './mode-manager.js';
import { buildOccupancyMap } from './layout-helpers.js';
import { createLayoutPersistence } from './layout-persistence.js';
import { createTileFactory } from './tile-factory.js';
import { createDeckAudioSync } from './deck-audio.js';
import { initSettingsPanel } from './settings-panel.js';

export function bootstrapApp() {
  const {
    getTauri,
    invokeCmd,
    callTauriAction,
    sendSystemVolume,
    setSystemMute,
    getMicState,
    toggleMicMute,
    isSystemVolumeEchoGuardActive,
  } = createTauriIpc();

  const iconSource = createIconSource({ isVectorIcon, vectorMarkup, escapeHtml, clampInt });
  const { formatIconSource, prettyProcName, applyDisplayToEl, applyKeyTitle } = iconSource;
  bongoCatWidget.setupKeyboardListener();

  /* Cờ chống kích hoạt phím khi vừa kéo thả. */
  let gridDragJustHappened = false;

  /* Vòng quét nền tạm dừng khi deck đang tối hoặc cửa sổ bị ẩn. */
  function isDeckPaused() {
    return document.hidden || document.body.classList.contains('idle');
  }

  /* Grid 8x5 + backdrop. */
  const grid = initGrid();
  const scheduleBackdropRender = initBackdrop();

  /* Hook bàn phím toàn cục phía Rust chỉ cần khi trên deck có phím Bongo Cat. */
  let bongoHookOn = null;
  function syncBongoHook() {
    const on = !!document.querySelector('.grid-stack-item[data-type="bongo_cat"]');
    if (on === bongoHookOn || !getTauri()) return;
    bongoHookOn = on;
    invokeCmd('set_bongo_enabled', { on }).catch((err) => {
      bongoHookOn = null;
      console.warn('set_bongo_enabled lỗi:', err);
    });
  }

  const layoutPersistence = createLayoutPersistence({
    grid,
    getTauri,
    invokeCmd,
    onSaved: syncBongoHook,
  });
  const { saveCurrentLayout, flushLayout, setLoading: setLayoutLoading } = layoutPersistence;

  /* =========================================================================
     CỠ Ô -> CLASS TIER
     ========================================================================= */
  /** Gán class cỡ ô (1x1 / thấp / lớn) để CSS chọn cỡ chữ + cỡ icon phù hợp.
      is-wide3 = ô NGANG >= 3 cột (3x1): đủ chỗ cho vạch ngăn + cột ngày/thành phố. */
  function applyWidgetTier(el, unit) {
    const node = el.gridstackNode || {};
    const w = Number(node.w) || 1;
    const h = Number(node.h) || 1;
    unit.classList.toggle('is-mini', w <= 1 && h <= 1);
    unit.classList.toggle('is-short', h <= 1 && w >= 2);
    unit.classList.toggle('is-big', w >= 2 && h >= 2);
    unit.classList.toggle('is-tall', w <= 1 && h >= 2);   // ô cao hẹp (1x2, 1x3...)
    unit.classList.toggle('is-wide3', w >= 3 && h <= 1);  // 3x1: bố cục 3 cột đầy đủ
  }

  const pomodoroWidget = createPomodoroWidget({ TREE_SVGS, applyWidgetTier, clampInt, saveCurrentLayout });

  const volumeWidget = createVolumeWidget({
    sendSystemVolume, setSystemMute, flashKeycap, saveCurrentLayout,
    didDragJustHappen: () => gridDragJustHappened,
  });

  const appSliderWidget = createAppSliderWidget({
    getTauri, invokeCmd, applyWidgetTier, prettyProcName, flashKeycap,
    openEditModal: (el) => modalEditor.openEditModal(el),
    didDragJustHappen: () => gridDragJustHappened,
  });

  const weatherWidget = createWeatherWidget({
    getTauri, invokeCmd, applyWidgetTier,
    didDragJustHappen: () => gridDragJustHappened,
  });

  const micWidget = createMicWidget({
    invokeCmd: async (cmd, args = {}) => {
      if (cmd === 'get_mic_state') return getMicState();
      if (cmd === 'toggle_mic_mute') return toggleMicMute();
      return invokeCmd(cmd, args);
    },
    flashKeycap,
    applyWidgetTier,
  });

  const mediaWidget = createMediaWidget({
    invokeCmd, applyWidgetTier, flashKeycap,
    openUrl: (url) => callTauriAction('open_url', url),
  });

  const musicWaveWidget = createMusicWaveWidget({ getTauri, invokeCmd });

  const shutdownWidget = createShutdownWidget({ invokeCmd, flashKeycap });

  const todoWidget = createTodoWidget({
    applyWidgetTier,
    escapeHtml,
    isDeckPaused,
    getTauri,
    invokeCmd,
  });

  const widgetRenderer = createWidgetRenderer({
    volumeWidget,
    appSliderWidget,
    micWidget,
    mediaWidget,
    musicWaveWidget,
    shutdownWidget,
    pomodoroWidget,
    clockWidget,
    weatherWidget,
    bongoCatWidget,
    todoWidget,
    isVectorIcon,
    vectorMarkup,
    isDefaultVolIcon,
    VOL_GLYPH,
    clampInt,
    formatIconSource,
    parseClockCfg,
    parseWeatherCfg,
    parseBongoCfg,
    applyWidgetTier,
    applyKeyTitle,
    registerLiveWidget,
    unregisterLiveWidget,
  });
  const { renderWidgetContent, destroyWidgetContent } = widgetRenderer;

  /* Giao diện "Stream Deck thật": bật khối body.sd-look trong CSS. */
  document.body.classList.add('sd-look');

  /* =========================================================================
     TẠO / XÓA TILE
     ========================================================================= */
  const tileFactory = createTileFactory({
    grid,
    saveCurrentLayout,
    applyDisplayToEl,
    renderWidgetContent,
    callTauriAction,
    todoWidget,
    openEditModal: (el) => modalEditor.openEditModal(el),
    didDragJustHappen: () => gridDragJustHappened,
    hydrateVectorIcons,
  });
  const { createWidgetEl, removeTile, commitPendingDelete } = tileFactory;

  function createWidgetSafe(widget) {
    try {
      createWidgetEl(widget);
    } catch (err) {
      console.error('Bỏ qua phím lỗi:', widget && widget.type, err);
    }
  }

  /* =========================================================================
     ĐỒNG BỘ ÂM THANH / MEDIA
     ========================================================================= */
  const deckAudio = createDeckAudioSync({
    getTauri,
    invokeCmd,
    volumeWidget,
    appSliderWidget,
    mediaWidget,
    todoWidget,
    isDeckPaused,
    isSystemVolumeEchoGuardActive,
  });
  deckAudio.start();

  /* =========================================================================
     CHẾ ĐỘ CHẠY (RUN) / CHỈNH SỬA (EDIT)
     -------------------------------------------------------------------------
     - Run Mode (mặc định): khoá kéo-thả/resize; chỉ chạm để kích hoạt.
     - Edit Mode: bật kéo-thả/resize + tạo/sửa/xoá phím.
     ========================================================================= */
  applyMode();

  const settingsPanel = initSettingsPanel({ onResetLayout: () => resetLayout() });

  // Segmented Chạy / Chỉnh sửa bên trong modal cài đặt
  document.querySelectorAll('#modeSegment .seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => setEditMode(btn.dataset.mode === 'edit'));
  });

  // Thanh nổi Edit Mode: ⚙️ mở Cài đặt Deck; "✓ Xong" lưu layout rồi về Run Mode.
  document.getElementById('settingsOpenBtn')?.addEventListener('click', settingsPanel.open);
  document.getElementById('editDoneBtn')?.addEventListener('click', () => {
    commitPendingDelete();
    flushLayout();
    setEditMode(false);
  });

  /* Ghi layout khi rời trang / ẩn cửa sổ. */
  window.addEventListener('pagehide', flushLayout);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flushLayout(); });

  /* =========================================================================
     ĐỒNG HỒ / THỜI TIẾT / POMODORO
     ========================================================================= */
  startLiveWidgetScheduler({
    isDeckPaused,
    getClockFace: (el) => {
      const refs = liveWidgetRegistry.get(el);
      return refs.face ??= parseClockCfg(el).face;
    },
    updateClockWidget: (el) => clockWidget.update(liveWidgetRegistry.get(el), { applyWidgetTier }),
  });

  setInterval(() => pomodoroWidget.tick(liveWidgetRegistry), 1000);
  setInterval(() => pomodoroWidget.saveRunning(liveWidgetRegistry), 15000);
  setInterval(() => { if (!isDeckPaused()) weatherWidget.refreshAll(liveWidgetRegistry); }, WEATHER_REFRESH_MS);

  /* =========================================================================
     SỰ KIỆN GRID
     ========================================================================= */
  grid.on('change', () => saveCurrentLayout());

  grid.on('removed', (_event, items) => {
    (items || []).forEach(({ el }) => destroyWidgetContent(el));
  });

  grid.on('dragstart', () => { gridDragJustHappened = true; });
  grid.on('resizestart', () => { gridDragJustHappened = true; });
  grid.on('dragstop', () => { setTimeout(() => { gridDragJustHappened = false; }, 0); });
  grid.on('resizestop', () => {
    document.querySelectorAll('.grid-stack-item[data-type="music_wave"]').forEach((el) => {
      if (el.gridstackNode?.h !== 1) grid.update(el, { h: 1 });
    });
    setTimeout(() => { gridDragJustHappened = false; }, 0);
    scheduleSliderRefresh();   // fader ngang/dọc + cỡ ô phải khớp hình dạng MỚI
  });

  /* =========================================================================
     ĐỒNG BỘ LẠI BỐ CỤC SAU KHI ĐỔI CỠ
     ========================================================================= */
  function refreshSliderLayouts() {
    document.querySelectorAll('.grid-stack-item').forEach((el) => {
      const type = el.dataset.type;
      if (type === 'volume_slider') {
        const unit = el.querySelector('.volume-deck-unit');
        if (unit) applyVolumeOrient(el, unit);
      } else if (type === 'app_slider') {
        appSliderWidget.update(el);
      } else if (type === 'weather_widget' || type === 'mini_clock') {
        const unit = el.querySelector('.weather-unit, .clock-unit');
        if (unit) applyWidgetTier(el, unit);
      } else if (type === 'pomodoro') {
        const unit = el.querySelector('.pomodoro-unit');
        if (unit) applyWidgetTier(el, unit);
      } else if (type === 'mic_widget') {
        const unit = el.querySelector('.mic-deck-unit');
        if (unit) applyWidgetTier(el, unit);
      } else if (type === 'todo_list') {
        todoWidget.update(todoWidget.register(el));
      } else if (type === 'media_player') {
        const unit = el.querySelector('.media-unit');
        if (unit) applyWidgetTier(el, unit);
      }
    });
  }

  let sliderRefreshTimer = null;
  function scheduleSliderRefresh() {
    if (sliderRefreshTimer !== null) clearTimeout(sliderRefreshTimer);
    sliderRefreshTimer = setTimeout(() => {
      sliderRefreshTimer = null;
      refreshSliderLayouts();
    }, 60);
  }

  window.addEventListener('resize', scheduleSliderRefresh);

  /* =========================================================================
     MODAL SỬA PHÍM + VÀO EDIT MODE
     ========================================================================= */
  const modalEditor = createModalEditor({
    grid, initIconUI, invokeCmd, formatIconSource, saveCurrentLayout,
    applyDisplayToEl, renderWidgetContent, unregisterLiveWidget, hydrateVectorIcons,
    parsePomoTarget, clampInt, clampFloat, normalizeClockFace, CLOCK_DEFAULT,
    parseClockCfg, clockZoneLabel, WEATHER_DEFAULT, WEATHER_MIN_W, parseWeatherCfg,
    normalizeWeatherSkin, parseBongoCfg, normalizeBongoSize, defaultIconForType,
    appSliderWidget, createWidgetEl, removeTile,
  });

  setupLongPressEntry({
    viewport: document.querySelector('.deck-viewport'),
    isEditMode: () => isEditMode,
    enterEditMode: () => setEditMode(true),
  });

  /* Edit Mode: chạm ô trống -> mở bảng tạo phím tại đúng ô đó. */
  document.querySelector('.deck-viewport').addEventListener('click', (e) => {
    if (!isEditMode || e.target.closest('.grid-stack-item, .edit-toolbar')) return;
    const rect = grid.el.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / grid.cellWidth());
    const y = Math.floor((e.clientY - rect.top) / grid.getCellHeight());
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS || buildOccupancyMap(grid)[y][x]) return;
    modalEditor.openEditModal(null, { x, y });
  });

  /* Click phải vào nền trống -> tạo phím mới. */
  document.querySelector('.deck-viewport').addEventListener('contextmenu', (e) => {
    if (!isEditMode) return;
    if (e.target.closest('.grid-stack-item')) return;
    e.preventDefault();
    modalEditor.openEditModal(null);
  });

  const EXIT_ESC_WINDOW_MS = 800;
  let lastEscAt = 0;
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (settingsPanel.isOpen()) {
      settingsPanel.close();
    } else if (modalEditor.isOpen()) {
      modalEditor.closeModal();
    } else {
      // Thoát app cần nhấn Esc 2 lần liên tiếp để không tắt deck vì chạm nhầm phím.
      const now = performance.now();
      if (now - lastEscAt <= EXIT_ESC_WINDOW_MS) invokeCmd('close_app');
      lastEscAt = now;
    }
  });

  /* =========================================================================
     DỮ LIỆU / KHỞI ĐỘNG
     ========================================================================= */
  window.addEventListener('storage', (event) => {
    if (event.key === todoWidget.storageKey || event.key === null) todoWidget.updateAll();
  });
  window.addEventListener('focus', todoWidget.updateAll);

  /* Đặt lại bố cục về mặc định (gọi từ nút trong modal Cài đặt). */
  function resetLayout() {
    grid.engine.nodes.forEach(({ el }) => destroyWidgetContent(el));
    grid.removeAll();
    DEFAULT_WIDGETS.forEach(createWidgetSafe);
    saveCurrentLayout();
  }

  // Bộ icon vector nạp lazy: sau khi layout dựng xong, điền SVG cho các phím đang dùng.
  hydrateVectorIcons();

  /* Nạp layout đã lưu, nếu không thì dùng mặc định. */
  (async function loadLayout() {
    const ipc = getTauri() ? invokeCmd : null;
    const [stored] = await Promise.all([
      loadSavedLayout(STORAGE_KEY, ipc),
      loadAppConfig(ipc),
    ]);
    initDisplaySettings({ onWake: deckAudio.refreshOnResume });
    // Layout cũ còn phím "settings" 1x1 đã bị gỡ bỏ.
    const savedLayout = (stored || DEFAULT_WIDGETS)
      .filter((item) => item && item.type !== 'settings');
    const layout = savedLayout.some((item) => item && item.type === 'weather_widget')
      ? savedLayout
      : [...savedLayout, ...(DEFAULT_WIDGETS.filter((item) => item && item.type === 'weather_widget'))];
    layout.forEach(createWidgetSafe);
    setLayoutLoading(false);
    saveCurrentLayout();
    scheduleSliderRefresh();
    deckAudio.syncDeckAudio();   // đồng bộ ngay lúc khởi động (không chờ nhịp 2s đầu tiên)
  })();

  /* Render backdrop grid on initial load */
  scheduleBackdropRender();
}
