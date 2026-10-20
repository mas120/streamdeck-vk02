import { COLS, ROWS } from './grid.js';
import {
  isEditMode,
  isSliderWidget,
  pressFeedback,
  releaseFeedback,
  flashKeycap,
} from './mode-manager.js';
import { defaultSize } from './widget-types.js';
import { buildOccupancyMap, serializeNode, findFreeSlot, fitToFree } from './layout-helpers.js';
import { CLOCK_DEFAULT, normalizeClockFace } from '../widgets/clock.js';
import { WEATHER_DEFAULT, WEATHER_MIN_W } from '../widgets/weather.js';
import { normalizeBongoSize } from '../widgets/bongo-cat.js';
import { parsePomoTarget } from '../widgets/pomodoro.js';

const GRIP_SVG =
  '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">' +
  [4, 8, 12]
    .flatMap((cy) => [5, 11].map((cx) => `<circle cx="${cx}" cy="${cy}" r="1.3"/>`))
    .join('') +
  '</svg>';

const UNDO_MS = 5000;

/** Widget "sống" (tự vẽ lại liên tục và có tương tác riêng)? */
function isLiveWidget(el) {
  const type = el.dataset.type;
  return type === 'mini_clock' || type === 'weather_widget' || type === 'music_wave';
}

/**
 * Tạo, xóa và hoàn tác các tile trên deck.
 * Phụ thuộc được truyền vào để module này không cần biết phần còn lại của app.
 */
export function createTileFactory(services) {
  const {
    grid,
    saveCurrentLayout,
    applyDisplayToEl,
    renderWidgetContent,
    callTauriAction,
    todoWidget,
    openEditModal,
    didDragJustHappen,
    hydrateVectorIcons,
  } = services;

  let pendingUndo = null;
  let undoToast = null;

  function commitPendingDelete() {
    if (!pendingUndo) return;
    clearTimeout(pendingUndo.timer);
    pendingUndo = null;
    undoToast?.remove();
    undoToast = null;
  }

  function undoDelete() {
    if (!pendingUndo) return;
    const { snapshot } = pendingUndo;
    commitPendingDelete();
    const map = buildOccupancyMap(grid);
    let free = true;
    for (let yy = snapshot.y; yy < snapshot.y + snapshot.h && free; yy++) {
      for (let xx = snapshot.x; xx < snapshot.x + snapshot.w; xx++) {
        if (map[yy]?.[xx]) {
          free = false;
          break;
        }
      }
    }
    const data = free ? snapshot : { ...snapshot, x: undefined, y: undefined };
    try {
      createWidgetEl(data);
    } catch (err) {
      console.error('Bỏ qua phím lỗi:', data && data.type, err);
    }
    hydrateVectorIcons();
    saveCurrentLayout();
  }

  function showUndoToast(snapshot) {
    const name = snapshot.title || '';
    undoToast = document.createElement('div');
    undoToast.className = 'undo-toast';
    const text = document.createElement('span');
    text.textContent = name ? `Đã xóa phím "${name}"` : 'Đã xóa phím';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Hoàn tác';
    btn.addEventListener('click', undoDelete);
    undoToast.append(text, btn);
    document.body.appendChild(undoToast);
    pendingUndo = { snapshot, timer: setTimeout(commitPendingDelete, UNDO_MS) };
  }

  function removeTile(el) {
    const node = el.gridstackNode;
    if (!node) return;
    commitPendingDelete();
    const snapshot = serializeNode(node);
    grid.removeWidget(el);
    saveCurrentLayout();
    showUndoToast(snapshot);
  }

  function addEditControls(el) {
    const handle = document.createElement('div');
    handle.className = 'drag-handle';
    handle.innerHTML = GRIP_SVG;
    handle.addEventListener('click', (e) => e.stopPropagation());

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn-remove-tile';
    remove.setAttribute('aria-label', 'Xóa phím');
    remove.textContent = '✕';
    remove.addEventListener('pointerdown', (e) => e.stopPropagation());
    remove.addEventListener('click', (e) => {
      e.stopPropagation();
      removeTile(el);
    });

    el.append(handle, remove);
  }

  function createWidgetEl(data) {
    const type = data.type || 'open_url';
    // Widget "sống" cần biết cấu hình (kiểu mặt / toạ độ) TRƯỚC khi tính kích thước mặc định.
    const cfg = data.cfg && typeof data.cfg === 'object' ? data.cfg : null;
    const clockFace =
      type === 'mini_clock'
        ? normalizeClockFace((cfg && cfg.face) || String(data.target || '').split(',')[0])
        : null;
    const bongoSize =
      type === 'bongo_cat' ? normalizeBongoSize((cfg && cfg.size) || data.target || '2x1') : null;
    const def = defaultSize(type, { clockFace, bongoSize, weatherMinW: WEATHER_MIN_W });
    // Chuẩn hoá kích thước trong biên lưới
    let w = Math.min(Math.max(1, data.w || def.w), COLS);
    let h = Math.min(Math.max(1, data.h || def.h), ROWS);
    if (type === 'music_wave') h = 1;

    // Đảm bảo LUÔN có toạ độ đầy đủ {x,y,w,h}
    let x = typeof data.x === 'number' ? data.x : null;
    let y = typeof data.y === 'number' ? data.y : null;
    if (x === null || y === null) {
      const slot = findFreeSlot(grid, w, h);
      x = slot.x;
      y = slot.y;
    } else if (data.clampToFree) {
      const fit = fitToFree(grid, x, y, w, h);
      if (data.w) {
        ({ w, h } = fit); // cỡ do người dùng chọn: thu cho vừa vùng trống
      } else if (fit.w < w || fit.h < h) {
        ({ x, y } = findFreeSlot(grid, w, h)); // cỡ mặc định không vừa ô này
      }
    }

    const el = grid.addWidget({ x, y, w, h });

    try {
      el.dataset.icon = data.icon || '⏹️';
      if (data.id) el.dataset.layoutId = String(data.id);
      else delete el.dataset.layoutId;
      if (data.icon2x) el.dataset.icon2x = data.icon2x;
      else delete el.dataset.icon2x;
      el.dataset.type = type;
      applyDisplayToEl(el, data);
      el.dataset.target =
        data.target !== undefined && data.target !== null
          ? String(data.target)
          : type === 'volume_slider'
            ? '50'
            : type === 'pomodoro'
              ? '25,5'
              : type === 'mini_clock'
                ? `${CLOCK_DEFAULT.face},${CLOCK_DEFAULT.tz}`
                : type === 'weather_widget'
                  ? `${WEATHER_DEFAULT.lat},${WEATHER_DEFAULT.lon}`
                  : '';

      // Widget "sống": ghi cấu hình vào dataset để render/đọc lại và lưu vào layout.
      if (type === 'mini_clock' || type === 'weather_widget') {
        el.dataset.cfg = JSON.stringify(
          cfg || (type === 'weather_widget' ? WEATHER_DEFAULT : CLOCK_DEFAULT)
        );
      }
      if (type === 'bongo_cat') {
        const bongoCfg = {
          size: normalizeBongoSize((cfg && cfg.size) || data.target || '2x1'),
          showKps: !!(cfg && cfg.showKps !== undefined ? cfg.showKps : true),
        };
        el.dataset.cfg = JSON.stringify(bongoCfg);
        el.dataset.target = bongoCfg.size;
        el.dataset.showKps = bongoCfg.showKps ? '1' : '0';
      }
      if (type === 'multi_action') {
        el.dataset.cfg = JSON.stringify({
          actions: Array.isArray(cfg && cfg.actions) ? cfg.actions : [],
        });
      }

      // Phím pomodoro: chuẩn bị tham số khởi tạo + state khôi phục (nếu có).
      if (type === 'pomodoro') {
        const [wm, bm] = parsePomoTarget(el.dataset.target);
        el.__pomoInit = { workMin: wm, breakMin: bm, restore: data.pomo || null };
      }

      renderWidgetContent(el);
      addEditControls(el);
    } catch (err) {
      grid.removeWidget(el); // không để lại ô rỗng bị lưu thành phím rác
      throw err;
    }

    // --- Phản hồi chạm TỨC THÌ (< 5ms) khi pointerdown: lún phím + ripple + âm ---
    el.addEventListener('pointerdown', (e) => {
      if (isEditMode) return; // Edit Mode: ưu tiên kéo/sửa, không kích hoạt
      if (isSliderWidget(el)) return; // Thanh trượt có tương tác riêng
      if (el.dataset.type === 'pomodoro') return; // Pomodoro tự xử lý tap/long-press
      if (el.dataset.type === 'bongo_cat') return; // Bongo Cat phản hồi qua bàn phím hệ thống
      if (el.dataset.type === 'mic_widget') return; // Mic widget xử lý click riêng
      if (isLiveWidget(el)) return; // Đồng hồ / Thời tiết có tương tác riêng
      if (e.button) return; // Chỉ chuột trái / cảm ứng
      pressFeedback(el);
    });
    el.addEventListener('pointerup', () => releaseFeedback(el));
    el.addEventListener('pointercancel', () => releaseFeedback(el));
    el.addEventListener('pointerleave', () => releaseFeedback(el));

    // Kích hoạt hành động (chỉ ở Run Mode) rồi chớp viền OK / lỗi.
    // Dùng 'click' (không dùng touchstart trễ 300ms) nên không có độ trễ.
    el.addEventListener('click', async (e) => {
      if (isEditMode) {
        if (!didDragJustHappen() && !e.target.closest('.ui-resizable-handle')) openEditModal(el);
        return;
      }
      if (didDragJustHappen()) return;
      if (isSliderWidget(el)) return;
      if (el.dataset.type === 'pomodoro') return; // xử lý trong setupPomodoro
      if (el.dataset.type === 'bongo_cat') return; // Bongo Cat phản hồi qua bàn phím hệ thống
      if (el.dataset.type === 'mic_widget') return; // Mic widget xử lý click riêng
      if (el.dataset.type === 'todo_list') {
        // mở cửa sổ soạn việc trên màn hình PC
        releaseFeedback(el);
        flashKeycap(el, await todoWidget.openEditor());
        return;
      }
      if (isLiveWidget(el)) return; // Đồng hồ tự chạy; Thời tiết tự làm mới khi chạm
      releaseFeedback(el);
      const ok = await callTauriAction(el.dataset.type, el.dataset.target);
      flashKeycap(el, ok);
    });

    // Chỉ mở trình chỉnh sửa khi ở Edit Mode.
    el.addEventListener('contextmenu', (e) => {
      if (!isEditMode) return;
      e.preventDefault();
      e.stopPropagation();
      openEditModal(el);
    });

    return el;
  }

  return { createWidgetEl, removeTile, commitPendingDelete };
}
