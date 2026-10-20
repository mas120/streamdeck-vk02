import 'gridstack/dist/gridstack.min.css';
import { GridStack } from 'gridstack';
import {
  isVectorIcon, vectorMarkup, hydrateVectorIcons, initIconUI,
} from './icons.js';
import { TODO_KEY, loadTodos, saveTodos } from './todo-store.js';
import { TREE_SVGS } from './forest-tree-svgs.js';

/* =========================================================================
   CẤU HÌNH LƯỚI CHUẨN: 8 CỘT x 5 HÀNG
   -------------------------------------------------------------------------
   GridStack v14 định vị mỗi widget bằng CSS calc() với:
     --gs-column-width = 100/8 (%)         -> cellWidth  = clientWidth / 8
     --gs-cell-height  = <cellHeight> px   -> getCellHeight()
   và "margin" được áp như INNER INSET bên trong mỗi .grid-stack-item-content
   (top/right/bottom/left = margin). Vì vậy:
     - Ô 1x1 hiển thị tại: left = x*cellWidth + margin, top = y*cellHeight + margin
       kích thước = (cellWidth - 2*margin) x (cellHeight - 2*margin)
     - Khoảng cách giữa 2 ô = 2*margin, viền ngoài deck = margin.
   => Backdrop 40 ô phải dùng ĐÚNG công thức này để khớp 100%.
   ========================================================================= */
window.COLS = 8;
window.ROWS = 5;
window.MARGIN = 8;   // phím 1x1 = đúng 144x144px (1280x800)
window.STORAGE_KEY = 'STREAMDECK_VK02_LAYOUT';

/* Cờ chống kích hoạt phím khi vừa kéo thả (khai báo sớm tránh TDZ) */
let gridDragJustHappened = false;

/* 0. GIAO DIỆN "STREAM DECK THẬT" — bật khối SD-LOOK ở cuối <style> trong index.html.
   Mọi rule của khối đó đều đặt sau tiền tố body.sd-look nên BỎ class này là về
   giao diện cũ (giữ ở đây để bật/tắt nhanh khi so sánh). main.js là module defer
   đặt ở cuối <body> nên document.body đã tồn tại. */
document.body.classList.add('sd-look');

/* 1. Giao tiếp Rust Backend */
function getTauri() {
  return window.__TAURI__ ? (window.__TAURI__.core || window.__TAURI__.tauri) : null;
}

async function invokeCmd(cmd, args = {}) {
  const tauri = getTauri();
  if (!tauri) {
    console.log(`[Mock IPC] ${cmd}`, args);
    return null;
  }
  return tauri.invoke(cmd, args);
}

async function callTauriAction(actionType, target = "") {
  try {
    await invokeCmd('trigger_action', { actionType, target: String(target) });
    return true;   // thành công -> chớp viền xanh (status-success)
  } catch (err) {
    console.error("Lỗi Action:", err);
    return false;  // lỗi -> chớp viền đỏ (status-error)
  }
}

function normalizeBongoSize(value) {
  const v = String(value || '2x1').trim().toLowerCase();
  return (v === '2x2') ? '2x2' : '2x1';
}

function parseBongoCfg(el) {
  let cfg = {};
  try {
    cfg = JSON.parse(el.dataset.cfg || '{}');
  } catch (_) {
    cfg = {};
  }
  const size = normalizeBongoSize(cfg.size || el.dataset.target || '2x1');
  const showKps = cfg.showKps !== undefined ? !!cfg.showKps : (el.dataset.showKps === '1');
  return { size, showKps };
}

function setupBongoCatEventListener() {
  const eventApi = window.__TAURI__ && (window.__TAURI__.event || window.__TAURI__.core);
  if (!eventApi) return;
  const listenFn = eventApi.listen || eventApi.addListener;
  if (typeof listenFn !== 'function') return;
  listenFn.call(eventApi, 'bongo-key-event', (event) => {
    const payload = (event && typeof event === 'object' && 'payload' in event) ? event.payload : event;
    if (!payload || !payload.hand || !payload.action) return;
    const hand = payload.hand === 'left' || payload.hand === 'right' ? payload.hand : null;
    const action = payload.action === 'down' || payload.action === 'up' ? payload.action : null;
    if (!hand || !action) return;
    if (document.body.classList.contains('idle')) return;

    document.querySelectorAll('.grid-stack-item[data-type="bongo_cat"]').forEach((el) => {
      const content = keyContent(el);
      const widget = content.querySelector('.bongo-cat-widget');
      if (!widget) return;
      widget.dataset.hand = hand;
      widget.dataset.action = action;

      widget.querySelectorAll('.bongo-key').forEach((key) => {
        const isLeft = key.classList.contains('bongo-key-left');
        const isRight = key.classList.contains('bongo-key-right');
        const shouldLight = action === 'down' && ((hand === 'left' && isLeft) || (hand === 'right' && isRight));
        key.classList.toggle('is-lit', shouldLight);
      });

      if (action === 'down') {
        const state = el.__bongoState || { events: [] };
        const now = performance.now();
        state.events.push(now);
        state.events = state.events.filter((ts) => ts > now - 1000);
        el.__bongoState = state;
        const kps = widget.querySelector('.bongo-kps');
        if (kps) kps.textContent = `KPS ${state.events.length.toFixed(1)}`;
      }
    });
  });
}

function setupBongoCatPointer(widget) {
  if (!widget || widget.dataset.pointerReady === '1') return;
  widget.dataset.pointerReady = '1';
  const el = widget.closest('.grid-stack-item');
  const state = el ? (el.__bongoState || (el.__bongoState = { events: [] })) : {};
  const press = (hand) => {
    widget.dataset.hand = hand;
    widget.dataset.action = 'down';
    widget.querySelectorAll('.bongo-key').forEach((key) => {
      key.classList.toggle('is-lit', key.classList.contains(`bongo-key-${hand}`));
    });
    clearTimeout(state.pointerRelease);
    state.pointerRelease = setTimeout(() => release(), 130);
  };
  const release = () => {
    widget.dataset.action = 'up';
    widget.querySelectorAll('.bongo-key').forEach((key) => key.classList.remove('is-lit'));
  };
  widget.addEventListener('pointermove', (event) => {
    if (document.body.classList.contains('idle')) return;
    const rect = widget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / Math.max(rect.width, 1);
    const y = (event.clientY - rect.top) / Math.max(rect.height, 1);
    widget.style.setProperty('--look-x', `${((x - 0.5) * 5).toFixed(1)}px`);
    widget.style.setProperty('--look-y', `${((y - 0.45) * 3).toFixed(1)}px`);
    const hand = x < 0.5 ? 'left' : 'right';
    const now = performance.now();
    if (now - (state.lastPointerTap || 0) > 115) {
      state.lastPointerTap = now;
      press(hand);
    }
  });
  widget.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
    const rect = widget.getBoundingClientRect();
    press(event.clientX < rect.left + rect.width / 2 ? 'left' : 'right');
  });
  widget.addEventListener('pointerup', release);
  widget.addEventListener('pointercancel', release);
  widget.addEventListener('pointerleave', () => {
    widget.style.setProperty('--look-x', '0px');
    widget.style.setProperty('--look-y', '0px');
    release();
  });
}

/* 1b. Per-App Volume Mixer — cache audio session của hệ thống */
let audioSessionCache = [];

/** Kéo danh sách app đang phát âm thanh từ Rust (Windows Core Audio). */
async function refreshAudioSessions() {
  if (!getTauri()) return audioSessionCache;
  try {
    const list = await invokeCmd('get_audio_sessions');
    if (Array.isArray(list)) audioSessionCache = list;
  } catch (err) {
    console.warn('get_audio_sessions lỗi:', err);
  }
  return audioSessionCache;
}

/** Tìm session theo tên tiến trình; tên rỗng -> lấy app đầu tiên. */
function findSessionByName(name) {
  if (!audioSessionCache.length) return null;
  if (!name) return audioSessionCache[0];
  const wanted = name.toLowerCase();
  return audioSessionCache.find(s => s.name.toLowerCase() === wanted) || null;
}

/** Ghi mức âm lượng vào CSS var --fill-percent (nguồn duy nhất cho lớp fill). */
function setFillPercent(unit, pct) {
  if (unit) unit.style.setProperty('--fill-percent', String(pct));
}

/** LED 4px ở đáy keycap: active (đang phát) / muted / idle / off (chưa có app). */
function setAppState(unit, state) {
  if (unit) unit.dataset.state = state;
}

/** Cập nhật UI của 1 widget app_slider từ cache (bỏ qua nếu đang kéo). */
function updateAppWidget(el) {
  if (el.dataset.dragging === '1') return;
  const unit = el.querySelector('.app-deck-unit');
  if (!unit) return;

  applyWidgetTier(el, unit);        // ô 1x1 -> chỉ icon squircle + số % + LED
  const session = findSessionByName(el.dataset.target);
  const percentEl = unit.querySelector('.app-percent');
  const iconBtn = unit.querySelector('.app-icon-btn');
  const nameEl = unit.querySelector('.app-name');
  const hintEl = unit.querySelector('.app-hint');

  if (!session) {
    // Ô chưa có app để điều khiển: thay "--" vô nghĩa bằng câu gợi ý rõ ràng.
    //  - đã chọn app nhưng chưa phát tiếng -> "Chưa phát âm thanh" (kèm tên app);
    //  - chưa chọn app nào                  -> "Chạm để chọn app" (chạm icon mở bảng chọn).
    const hasTarget = !!String(el.dataset.target || '').trim();
    const pretty = prettyProcName(el.dataset.target);
    const hintText = hasTarget ? 'Chưa phát âm thanh' : 'Chạm để chọn app';
    el.dataset.pid = '';
    unit.classList.remove('is-muted');
    iconBtn.classList.remove('muted');
    if (nameEl) nameEl.innerText = pretty;
    if (hintEl) hintEl.textContent = hintText;
    if (percentEl) percentEl.innerText = '--';
    unit.title = hasTarget ? `${pretty} · ${hintText}` : hintText;
    setFillPercent(unit, 0);
    setAppState(unit, 'off');
    return;
  }
  unit.removeAttribute('title');

  el.dataset.pid = session.pid;
  const pct = Math.round((session.volume || 0) * 100);
  if (nameEl) nameEl.innerText = session.label || session.name || '';
  if (percentEl) percentEl.innerText = pct + '%';
  setFillPercent(unit, pct);
  iconBtn.classList.toggle('muted', !!session.muted);
  unit.classList.toggle('is-muted', !!session.muted);
  setAppState(unit, session.muted ? 'muted' : (pct > 0 ? 'active' : 'idle'));
}

/** Đồng bộ toàn bộ widget app_slider đang có trên lưới. */
let syncAppSlidersBusy = false;
async function syncAppSliders() {
  if (syncAppSlidersBusy) return;          // lượt trước chưa xong -> không chồng lệnh
  const items = document.querySelectorAll('.grid-stack-item[data-type="app_slider"]');
  if (!items.length) return;
  syncAppSlidersBusy = true;
  try {
    await refreshAudioSessions();
    items.forEach(el => updateAppWidget(el));
  } finally {
    syncAppSlidersBusy = false;
  }
}

/* ĐỒNG BỘ ÂM LƯỢNG HỆ THỐNG THẬT cho phím volume_slider.
   Trước đây mức hiển thị lấy từ layout đã lưu nên đổi bằng phím cứng / app khác là lệch.
   lastSystemVolumeWriteAt: mốc lần cuối DECK ghi xuống hệ thống; trong ~1.5s sau đó
   không đọc ngược lại để giá trị cũ không ghi đè lên cú vuốt vừa làm. */
let syncSystemVolumeBusy = false;
let lastSystemVolumeWriteAt = -Infinity;
const SYSTEM_VOLUME_ECHO_GUARD_MS = 1500;

async function syncSystemVolume() {
  if (!getTauri() || syncSystemVolumeBusy) return;
  const items = Array.from(document.querySelectorAll('.grid-stack-item[data-type="volume_slider"]'));
  if (!items.length) return;
  if (performance.now() - lastSystemVolumeWriteAt < SYSTEM_VOLUME_ECHO_GUARD_MS) return;
  syncSystemVolumeBusy = true;
  try {
    const info = await invokeCmd('get_master_volume');
    if (!info || typeof info.volume !== 'number') return;
    // Trong lúc chờ Rust trả lời, tay có thể vừa vuốt -> bỏ kết quả cũ.
    if (performance.now() - lastSystemVolumeWriteAt < SYSTEM_VOLUME_ECHO_GUARD_MS) return;
    const pct = Math.round(info.volume);
    items.forEach((el) => {
      if (el.dataset.dragging === '1') return;
      const unit = el.querySelector('.volume-deck-unit');
      if (!unit) return;
      el.dataset.target = String(pct);
      setVolumeMuted(unit, el, !!info.muted);   // cập nhật luôn fill + số % + trạng thái mute
    });
  } catch (err) {
    console.warn('get_master_volume lỗi:', err);
  } finally {
    syncSystemVolumeBusy = false;
  }
}

/* Gửi mức âm lượng hệ thống: SINGLE-FLIGHT, giá trị MỚI NHẤT thắng.
   Chỉ có tối đa 1 lệnh đang bay; trong lúc chờ, các giá trị trung gian bị gộp lại
   và giá trị cuối luôn được gửi -> không dồn hàng đợi IPC và không bị đảo thứ tự. */
let systemVolumeInFlight = false;
let systemVolumePending = null;
async function sendSystemVolume(pct) {
  lastSystemVolumeWriteAt = performance.now();
  if (systemVolumeInFlight) { systemVolumePending = pct; return; }
  systemVolumeInFlight = true;
  try {
    await callTauriAction('set_volume', pct);
  } finally {
    systemVolumeInFlight = false;
    lastSystemVolumeWriteAt = performance.now();
    if (systemVolumePending !== null) {
      const next = systemVolumePending;
      systemVolumePending = null;
      sendSystemVolume(next);
    }
  }
}

/** Bật/tắt mute THẬT của hệ thống. Trả về true nếu thành công. */
async function setSystemMute(muted) {
  lastSystemVolumeWriteAt = performance.now();
  try {
    await invokeCmd('set_master_mute', { muted });
    return true;
  } catch (err) {
    console.error('set_master_mute lỗi:', err);
    return false;
  }
}

/* Vòng quét nền 2s: app đang chạy + mute + âm lượng hệ thống.
   TẠM DỪNG khi deck đang tối (idle) hoặc cửa sổ bị ẩn; được đồng bộ ngay khi thức dậy. */
function isDeckPaused() {
  return document.hidden || document.body.classList.contains('idle');
}
function syncDeckAudio() {
  syncAppSliders();
  syncSystemVolume();
}
setInterval(() => { if (!isDeckPaused()) syncDeckAudio(); }, 2000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) syncDeckAudio(); });

/* Nhịp throttle chung cho mọi thao tác VUỐT slider: 20ms (~50 lần/giây).
   DOM (--fill-percent) + IPC đều đi qua nhịp này; giá trị cuối luôn được flush
   khi nhả tay nên không bao giờ mất mức người dùng vừa chọn. */
const CAPSULE_THROTTLE_MS = 20;

/* 2. Format Icon (emoji / tên file / đường dẫn / dữ liệu dán base64) */
/** URL dùng được trong <img> cho một icon (data URL / đường dẫn file Windows / web). */
function iconAssetSrc(p) {
  p = String(p || '').trim();
  if (!p || p.startsWith('data:image/') || p.startsWith('http')) return p;
  if (p.includes(':')) {
    const core = window.__TAURI__ && window.__TAURI__.core;
    return (core && core.convertFileSrc) ? core.convertFileSrc(p) : 'https://asset.localhost/' + p.replace(/\\/g, '/');
  }
  return p;
}
/** Bản 288px đi kèm -> <img srcset="... 2x"> để màn DPI cao dùng ảnh nét. */
function srcsetAttr(icon2x) {
  const u = iconAssetSrc(icon2x);
  return u ? ` srcset="${escapeHtml(u)} 2x"` : '';
}

function formatIconSource(iconPath, icon2x) {
  if (!iconPath) return `<span class="icon-emoji">⏹️</span>`;
  const trimmed = iconPath.trim();

  // "lucide:..." / "si:..." -> SVG inline tô theo --accent (phải chặn TRƯỚC
  // nhánh "tên file" bên dưới vì có dấu ':' sẽ bị hiểu nhầm là đường dẫn ổ đĩa).
  if (isVectorIcon(trimmed)) return vectorMarkup(trimmed);

  if (trimmed.startsWith('data:image/')) {
    return `<img data-key-icon="1" src="${trimmed}"${srcsetAttr(icon2x)} alt="" />`;
  }

  const hasExt = /\.(png|jpe?g|svg|ico|webp|gif)$/i.test(trimmed);
  const isNamedIcon = hasExt || (!trimmed.includes(' ') && trimmed.length < 50 && !trimmed.startsWith('http'));

  if (hasExt || isNamedIcon) {
    let src = trimmed;
    if (!hasExt && !trimmed.includes(':') && !trimmed.startsWith('/')) {
      src = trimmed + '.png';
    }

    if (!src.includes(':') && !src.startsWith('http')) {
      if (!src.startsWith('/icons/') && !src.startsWith('icons/')) {
        src = '/icons/' + src;
      } else if (src.startsWith('icons/')) {
        src = '/' + src;
      }
    } else if (src.includes(':')) {
      if (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.convertFileSrc) {
        src = window.__TAURI__.core.convertFileSrc(src);
      } else {
        src = "https://asset.localhost/" + src.replace(/\\/g, '/');
      }
    }

    return `<img data-key-icon="1" src="${src}"${srcsetAttr(icon2x)} alt="" />`;
  }

  return `<span class="icon-emoji">${trimmed}</span>`;
}

/* 2b. ICON DỰ PHÒNG khi ảnh bị vỡ (file không tồn tại / dữ liệu dán hỏng):
   glyph "cửa sổ app" trung tính + TÊN APP suy ra từ đích của phím.
   Dùng 1 listener bắt ở pha capture vì sự kiện 'error' của <img> không nổi bọt. */
function prettyProcName(name) {
  const n = String(name || '').trim().replace(/\.exe$/i, '');
  return n ? n.charAt(0).toUpperCase() + n.slice(1) : n;
}

/** Tên app/web ngắn gọn từ đích phím: "https://www.youtube.com/.." -> "Youtube",
    "C:\\Windows\\System32\\taskmgr.exe" -> "Taskmgr". */
function deriveAppName(type, target) {
  const t = String(target || '').trim();
  if (!t) return '';
  let name = '';
  if (type === 'open_url') {
    try {
      const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : 'https://' + t);
      const parts = u.hostname.replace(/^www\./i, '').split('.');
      name = parts[0];
      if (parts.length > 1) name = parts[parts.length - 2];
      if (parts.length > 2 && name.length <= 3) name = parts[parts.length - 3];
    } catch (_) { name = t; }
  } else {
    const unquoted = t.replace(/^"([^"]*)".*$/, '$1');
    const base = /[\\/]/.test(unquoted) ? unquoted.split(/[\\/]/).pop() : unquoted.split(/\s+/)[0];
    name = base.replace(/\.(exe|lnk|bat|cmd|url)$/i, '');
  }
  name = name.trim();
  if (!name) return '';
  return (name.charAt(0).toUpperCase() + name.slice(1)).slice(0, 16);
}

/** Tên hiển thị dưới glyph dự phòng của một phím. */
function fallbackNameFor(item) {
  if (!item) return '';
  if (item.dataset.type === 'app_slider') {
    const label = (item.querySelector('.app-name')?.textContent || '').trim();
    return label || prettyProcName(item.dataset.target);
  }
  return deriveAppName(item.dataset.type, item.dataset.target);
}

function iconFallbackMarkup(name) {
  const label = name ? `<span class="icon-fallback-name">${escapeHtml(name)}</span>` : '';
  return `<span class="icon-fallback" aria-hidden="true">
    <svg class="icon-fallback-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3.5" y="4.5" width="17" height="15" rx="3.2"></rect>
      <path d="M3.5 9.2h17"></path>
      <circle cx="6.8" cy="6.9" r="0.7" fill="currentColor" stroke="none"></circle>
      <circle cx="9.4" cy="6.9" r="0.7" fill="currentColor" stroke="none"></circle>
    </svg>${label}
  </span>`;
}

document.addEventListener('error', (e) => {
  const img = e.target;
  if (!img || img.tagName !== 'IMG' || !img.hasAttribute('data-key-icon')) return;
  const item = img.closest('.grid-stack-item');
  img.insertAdjacentHTML('afterend', iconFallbackMarkup(fallbackNameFor(item)));
  img.remove();
}, true);

setupBongoCatEventListener();

/* 2c. HIỂN THỊ PHÍM: tuỳ chọn khớp ảnh (contain|cover) + NHÃN chồng lên icon.
   Lưu trong dataset của phím (data-fit, data-title, data-title-pos, data-title-size,
   data-title-shadow) và trong layout (fit, title, titlePos, titleSize, titleShadow). */
function applyDisplayToEl(el, d) {
  d = d || {};
  el.dataset.fit = (d.fit === 'cover') ? 'cover' : 'contain';
  const title = String(d.title || '').trim().slice(0, 24);
  if (title) {
    el.dataset.title = title;
    el.dataset.titlePos = ['top', 'middle', 'bottom'].includes(d.titlePos) ? d.titlePos : 'bottom';
    el.dataset.titleSize = String(clampInt(d.titleSize, 9, 32, 14));
    const shadowOff = d.titleShadow === false || d.titleShadow === '0' || d.titleShadow === 0;
    el.dataset.titleShadow = shadowOff ? '0' : '1';
  } else {
    delete el.dataset.title;
    delete el.dataset.titlePos;
    delete el.dataset.titleSize;
    delete el.dataset.titleShadow;
  }
}

/** Vẽ (hoặc gỡ) nhãn chồng lên mặt phím. Phím "Cài đặt" không có nhãn. */
function applyKeyTitle(el) {
  const content = keyContent(el);
  content.querySelectorAll('.key-title').forEach((n) => n.remove());
  const text = el.dataset.title;
  if (!text || el.dataset.type === 'settings') return;
  const t = document.createElement('span');
  t.className = 'key-title';
  t.textContent = text;
  t.dataset.pos = el.dataset.titlePos || 'bottom';
  t.dataset.shadow = el.dataset.titleShadow === '0' ? '0' : '1';
  t.style.setProperty('--title-size', (el.dataset.titleSize || '14') + 'px');
  content.appendChild(t);
}

/* 3. Tính cellHeight để 5 hàng phủ kín viewport.
   Margin nằm BÊN TRONG ô nên chỉ cần chia đều chiều cao cho 5 hàng. */
function getExactCellHeight() {
  return window.innerHeight / ROWS;
}

/* 4. Khởi tạo GridStack — float:true cho phép đặt TỰ DO, không dồn lên trên */
window.grid = GridStack.init({
  column: COLS,
  row: ROWS,            // -> minRow = maxRow = 5 (khoá cứng 5 hàng, container cao = 5*cellHeight)
  maxRow: ROWS,
  cellHeight: getExactCellHeight(),
  margin: MARGIN,
  float: true,
  disableDrag: true,     // Mặc định Run Mode: khoá kéo-thả
  disableResize: true,   // Mặc định Run Mode: khoá resize
  animate: true,
  resizable: { handles: 'se' }
});

/* =========================================================================
   4b. CHẾ ĐỘ CHẠY (RUN) / CHỈNH SỬA (EDIT) + HIỆU ỨNG PHÍM 3D
   -------------------------------------------------------------------------
   - Run Mode (mặc định, isEditMode = false): khoá kéo-thả/resize; chỉ chạm
     để kích hoạt -> phản hồi tức thì (< 5ms) qua pointerdown.
   - Edit Mode: bật lại kéo-thả/resize + cho phép tạo/sửa/xoá phím.
   ========================================================================= */
let isEditMode = false;

/* "Cài Đặt Deck": mở modal gộp Chế độ (Run/Edit) + Độ sáng + Tự tối.
   Kích hoạt từ PHÍM "settings" (1x1) nằm trong lưới; không còn nút nổi. */
const settingsModal = document.getElementById('settingsModal');

/** Áp dụng trạng thái chế độ hiện tại lên GridStack + UI (badge + segmented). */
function applyMode() {
  document.body.classList.toggle('edit-mode', isEditMode);
  grid.enableMove(isEditMode);
  grid.enableResize(isEditMode);

  document.querySelectorAll('#modeSegment .seg-btn').forEach((btn) => {
    btn.classList.toggle('active', (btn.dataset.mode === 'edit') === isEditMode);
  });

  // Phím ⚙️: vòng quanh bánh răng sáng đầy khi đang ở Chế độ Chỉnh sửa.
  document.querySelectorAll('.grid-stack-item[data-type="settings"]').forEach(updateSettingsRing);
}

function setEditMode(on) {
  isEditMode = !!on;
  applyMode();
}

function openSettings() {
  settingsModal?.classList.add('active');
}

function closeSettings() {
  settingsModal?.classList.remove('active');
}

/* =========================================================================
   PHÍM "CÀI ĐẶT DECK" — NHẤP ĐÔI ĐỂ BẬT/TẮT CHẾ ĐỘ CHỈNH SỬA
   -------------------------------------------------------------------------
   - NHẤP ĐÔI (2 nhịp liên tiếp trong ~320ms) trên phím ⚙️:
       + Đang Chạy (Run)  -> BẬT Chế độ Chỉnh sửa.
       + Đang Chỉnh sửa   -> TẮT (về Chế độ Chạy).
   - Vẫn KÉO-THẢ phím ⚙️ được: tap = đứng yên, kéo = di chuyển > 8px (tự phân biệt).
   - NHẤP 1 lần: không làm gì (chỉ phản hồi lún phím) -> tránh đổi chế độ nhầm.
   - Ở Edit Mode còn có nút nổi "✓ Xong" (trên-giữa) để thoát nhanh, chắc chắn.
   - Vòng quanh bánh răng SÁNG ĐẦY khi đang ở Chế độ Chỉnh sửa (báo trạng thái).
   - Chuột phải vào phím ⚙️ -> mở bảng "Cài Đặt Deck" (độ sáng, tự tối, reset...).
   ========================================================================= */
const DOUBLE_TAP_MS = 320;                     // cửa sổ nhận diện nhấp đôi
const SETTINGS_RING_CIRC = 2 * Math.PI * 45;   // chu vi vòng r = 45

/** Đảo Chế độ Chạy <-> Chỉnh sửa (dùng cho cử chỉ NHẤP ĐÔI ở phím ⚙️). */
function toggleEditMode(el) {
  setEditMode(!isEditMode);
  if (el) flashKeycap(el, true);   // chớp viền xác nhận đã đổi chế độ
}

/** Vòng quanh bánh răng: đầy khi Edit Mode, rỗng khi Run Mode (báo trạng thái khoá). */
function updateSettingsRing(el) {
  const ring = keyContent(el)?.querySelector('.settings-ring-progress');
  if (!ring) return;
  ring.style.strokeDashoffset = String(isEditMode ? 0 : SETTINGS_RING_CIRC);
}

/** Gắn cử chỉ "NHẤP ĐÔI" (đổi chế độ) cho phím Cài đặt.
 *  Phím vẫn KÉO-THẢ được ở Edit Mode: dùng ngưỡng di chuyển để phân biệt
 *  "tap" (đứng yên) với "kéo" (di chuyển > DRAG_SLOP px). */
function setupSettingsKey(el) {
  if (el.__settingsWired) return;
  el.__settingsWired = true;

  const content = keyContent(el);
  const DRAG_SLOP = 8;             // px: vượt ngưỡng này -> coi là KÉO, không tính tap
  let lastTapTs = 0;               // mốc thời gian của cú nhấp trước đó
  let downX = 0, downY = 0;        // toạ độ lúc bắt đầu nhấn
  let moved = false;               // tay đã di chuyển đủ xa chưa

  content.addEventListener('pointerdown', (e) => {
    if (e.button) return;          // chỉ chuột trái / cảm ứng
    downX = e.clientX;
    downY = e.clientY;
    moved = false;
    pressFeedback(el);             // phản hồi lún phím tức thì
  });
  content.addEventListener('pointermove', (e) => {
    if (moved) return;
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > DRAG_SLOP) moved = true;
  });
  content.addEventListener('pointerup', () => {
    releaseFeedback(el);
    if (moved) { lastTapTs = 0; return; }   // vừa KÉO -> bỏ qua, không tính tap
    const now = performance.now();
    if (now - lastTapTs <= DOUBLE_TAP_MS) {
      lastTapTs = 0;
      toggleEditMode(el);          // NHẤP ĐÔI -> bật/tắt Chế độ Chỉnh sửa
    } else {
      lastTapTs = now;             // chờ cú nhấp thứ hai trong cửa sổ thời gian
    }
  });
  content.addEventListener('pointercancel', () => {
    lastTapTs = 0;
    moved = false;
    releaseFeedback(el);
  });
  content.addEventListener('contextmenu', (e) => e.preventDefault());

  updateSettingsRing(el);          // hiển thị đúng trạng thái khoá hiện tại
}

// Segmented Chạy / Chỉnh sửa bên trong modal cài đặt
document.querySelectorAll('#modeSegment .seg-btn').forEach((btn) => {
  btn.addEventListener('click', () => setEditMode(btn.dataset.mode === 'edit'));
});

// Đóng bảng: bấm nút "Xong" hoặc bấm ra vùng nền tối.
document.getElementById('btnSettingsClose')?.addEventListener('click', closeSettings);
/* "Đặt lại bố cục" là thao tác PHÁ HUỶ (xoá sạch layout đã lưu) và trên màn cảm ứng rất
   dễ chạm nhầm -> cần XÁC NHẬN: chạm lần 1 đổi nhãn + màu cảnh báo (tự hết hạn sau 3s),
   chạm lần 2 trong thời gian đó mới thực sự đặt lại. */
const btnResetLayout = document.getElementById('btnResetLayout');
if (btnResetLayout) {
  const RESET_LABEL = btnResetLayout.textContent;
  const RESET_CONFIRM_MS = 3000;
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
    resetLayout();
  });
}
settingsModal?.addEventListener('pointerdown', (e) => {
  if (e.target === settingsModal) closeSettings();
});

// Nút nổi "✓ Xong": thoát nhanh Chế độ Chỉnh sửa về Chế độ Chạy.
document.getElementById('editDoneBtn')?.addEventListener('click', () => setEditMode(false));

/* --- Âm thanh "tạch" nhẹ, tổng hợp bằng WebAudio (không cần file ngoài) --- */
let keyAudioCtx = null;
function playKeySound() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    keyAudioCtx = keyAudioCtx || new Ctx();
    if (keyAudioCtx.state === 'suspended') keyAudioCtx.resume();
    const now = keyAudioCtx.currentTime;
    const osc = keyAudioCtx.createOscillator();
    const gain = keyAudioCtx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1300, now);
    osc.frequency.exponentialRampToValueAtTime(440, now + 0.05);
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
    osc.connect(gain).connect(keyAudioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.08);
  } catch (_) { /* bỏ qua nếu WebAudio không khả dụng */ }
}

/** Lấy phần tử "content" (mặt phím 3D) của một widget. */
function keyContent(el) {
  return el.querySelector('.grid-stack-item-content') || el;
}

/** Widget này có phải thanh trượt (đã có tương tác riêng)? */
function isSliderWidget(el) {
  const t = el.dataset.type;
  return t === 'volume_slider' || t === 'app_slider';
}

/** Ripple: sóng neon quét từ tâm icon ra viền trong 120ms. */
function spawnRipple(el) {
  const content = keyContent(el);
  const ripple = document.createElement('span');
  ripple.className = 'key-ripple';
  content.appendChild(ripple);
  ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
}

/** Nhấn phím: lún xuống + ripple + âm thanh, gọi NGAY khi pointerdown. */
function pressFeedback(el) {
  keyContent(el).classList.add('keycap-pressed');
  spawnRipple(el);
  playKeySound();
}

/** Nhả phím: gỡ trạng thái lún. */
function releaseFeedback(el) {
  keyContent(el).classList.remove('keycap-pressed');
}

/** Chớp trạng thái: dấu ✓ xanh (OK) / ⚠ vàng (lỗi) như Stream Deck.
    Animation @keyframes sdResult dài 900ms -> gỡ class sau 930ms cho khớp animation. */
function flashKeycap(el, ok) {
  const content = keyContent(el);
  const cls = ok ? 'status-success' : 'status-error';
  content.classList.remove('status-success', 'status-error');
  void content.offsetWidth; // ép reflow để animation chạy lại mỗi lần
  content.classList.add(cls);
  setTimeout(() => content.classList.remove(cls), 930);
}

// Đồng bộ chế độ ngay khi khởi động (mặc định: Run Mode)
applyMode();

/* =========================================================================
   4c. P1 — ĐỘ SÁNG MÀN HÌNH DECK + TỰ TỐI KHI RẢNH (screensaver)
   ========================================================================= */
const BRIGHTNESS_KEY = 'STREAMDECK_VK02_BRIGHTNESS';
const brightnessRange = document.getElementById('brightnessRange');
const brightnessValue = document.getElementById('brightnessValue');

/** Đặt độ sáng "màn hình" toàn deck (30%–130%) qua biến CSS --screen-brightness. */
function applyBrightness(percent) {
  const val = Math.max(0.3, Math.min(1.3, percent / 100));
  document.documentElement.style.setProperty('--screen-brightness', String(val));
  if (brightnessValue) brightnessValue.textContent = Math.round(percent) + '%';
}

if (brightnessRange) {
  const savedBrightness = localStorage.getItem(BRIGHTNESS_KEY);
  if (savedBrightness) brightnessRange.value = savedBrightness;
  applyBrightness(parseInt(brightnessRange.value, 10) || 100);
  brightnessRange.addEventListener('input', () => {
    const v = parseInt(brightnessRange.value, 10) || 100;
    applyBrightness(v);
    localStorage.setItem(BRIGHTNESS_KEY, String(v));
  });
  // Không để thao tác trên nền deck cướp cú kéo thanh trượt
  brightnessRange.addEventListener('pointerdown', (e) => e.stopPropagation());
}

/* Screensaver: sau X giây không tương tác thì tối màn; chạm vào là "thức" (X=0 -> tắt). */
const IDLE_KEY = 'STREAMDECK_VK02_IDLE_MS';
let IDLE_TIMEOUT_MS = parseInt(localStorage.getItem(IDLE_KEY), 10);
if (!Number.isFinite(IDLE_TIMEOUT_MS) || IDLE_TIMEOUT_MS < 0) IDLE_TIMEOUT_MS = 45000;
let idleTimer = null;
function wakeDeck() {
  const wasIdle = document.body.classList.contains('idle');
  document.body.classList.remove('idle');
  clearTimeout(idleTimer);
  if (IDLE_TIMEOUT_MS > 0) {
    idleTimer = setTimeout(() => document.body.classList.add('idle'), IDLE_TIMEOUT_MS);
  }
  if (wasIdle) syncDeckAudio();   // vừa thức dậy: vòng quét nền đã tạm dừng -> cập nhật ngay
}
['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'].forEach((ev) =>
  window.addEventListener(ev, wakeDeck, { passive: true })
);
wakeDeck();

/* Select "Tự tối khi rảnh" trong modal Cài đặt */
const settingsIdle = document.getElementById('settingsIdle');
if (settingsIdle) {
  settingsIdle.value = String(IDLE_TIMEOUT_MS);
  settingsIdle.addEventListener('change', () => {
    IDLE_TIMEOUT_MS = parseInt(settingsIdle.value, 10) || 0;
    localStorage.setItem(IDLE_KEY, String(IDLE_TIMEOUT_MS));
    wakeDeck();
  });
}

/* 5. Vẽ lưới nền 40 ô khớp TUYỆT ĐỐI với bounding box widget của GridStack */
let backdropRenderQueued = false;

function scheduleBackdropRender() {
  if (backdropRenderQueued) return;
  backdropRenderQueued = true;
  requestAnimationFrame(() => {
    backdropRenderQueued = false;
    renderExactBackdrop();
  });
}

function renderExactBackdrop() {
  const backdrop = document.getElementById('deckBackdrop');
  if (!backdrop || !grid) return;

  const cellW = grid.cellWidth();      // px, = clientWidth / COLS
  const cellH = grid.getCellHeight();  // px, = cellHeight option
  const m = (typeof grid.opts.margin === 'number') ? grid.opts.margin : MARGIN;

  if (!cellW || !cellH) return;

  const fragment = document.createDocumentFragment();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const slot = document.createElement('div');
      slot.className = 'slot-cell';
      // Mỗi ô = phần "lọt lòng" của một widget 1x1 (đã trừ margin mỗi cạnh)
      slot.style.left = `${c * cellW + m}px`;
      slot.style.top = `${r * cellH + m}px`;
      slot.style.width = `${cellW - 2 * m}px`;
      slot.style.height = `${cellH - 2 * m}px`;
      fragment.appendChild(slot);
    }
  }
  backdrop.replaceChildren(fragment);
}

// Vẽ nền sau khi DOM + GridStack ổn định định vị
requestAnimationFrame(scheduleBackdropRender);
setTimeout(scheduleBackdropRender, 120);

// Đồng bộ lại khi viewport đổi kích thước (fullscreen/second monitor)
window.addEventListener('resize', () => {
  grid.cellHeight(getExactCellHeight());
  scheduleBackdropRender();
});

/* 6. Layout mặc định (đều có đầy đủ toạ độ {x,y,w,h}) */
window.defaultWidgets = [
  { x: 0, y: 0, w: 1, h: 1, icon: "youtube", type: "open_url", target: "https://youtube.com" },
  { x: 1, y: 0, w: 1, h: 1, icon: "🧰", type: "launch_app", target: "taskmgr" },
  { x: 2, y: 0, w: 2, h: 1, icon: "🔊", type: "volume_slider", target: "50" },
  { x: 4, y: 0, w: 1, h: 1, icon: "📝", type: "launch_app", target: "notepad" },
  { x: 5, y: 0, w: 2, h: 2, icon: "📊", type: "launch_app", target: "resmon" },
  // Phím Pomodoro mẫu: 2x2, chu kỳ 25 phút làm việc / 5 phút nghỉ.
  { x: 0, y: 1, w: 2, h: 2, icon: "🍅", type: "pomodoro", target: "25,5" },
  { x: 0, y: 3, w: 2, h: 1, icon: "🔊", type: "app_slider", target: "" },
  // Widget ĐỒNG HỒ mẫu: Digital 1x1 (giờ Việt Nam, UTC+7).
  {
    x: 2, y: 1, w: 1, h: 1, icon: "🕐", type: "mini_clock", target: "digital,7",
    cfg: { face: "digital", tz: 7, label: "HÀ NỘI" }
  },
  // Widget ĐỒNG HỒ mẫu: Analog 2x2 (mặt số SVG + kim neon).
  {
    x: 4, y: 3, w: 2, h: 2, icon: "🕰️", type: "mini_clock", target: "analog,7",
    cfg: { face: "analog", tz: 7, label: "HÀ NỘI" }
  },
  // Widget THỜI TIẾT mẫu: 3x1 (bố cục chuẩn: nhiệt độ | ngày + TP | minh hoạ), toạ độ TP.HCM.
  {
    x: 0, y: 4, w: 3, h: 1, icon: "🌤️", type: "weather_widget", target: "10.8231,106.6297",
    cfg: { lat: 10.8231, lon: 106.6297, city: "TP. HỒ CHÍ MINH", skin: "soft" }
  },
  // Phím "Cài đặt" — LUÔN là 1 ô 1x1 ở góc trên-phải (thay nút nổi cũ).
  { x: 7, y: 0, w: 1, h: 1, icon: "⚙️", type: "settings", target: "" }
];

/* Bảng đánh dấu ô đã bị chiếm để tìm chỗ trống */
function buildOccupancyMap() {
  const map = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  grid.engine.nodes.forEach(n => {
    for (let yy = n.y; yy < n.y + n.h; yy++) {
      for (let xx = n.x; xx < n.x + n.w; xx++) {
        if (map[yy] && map[yy][xx] !== undefined) map[yy][xx] = true;
      }
    }
  });
  return map;
}

/* Tìm vị trí trống đầu tiên cho widget kích thước w x h */
function findFreeSlot(w, h) {
  const map = buildOccupancyMap();
  const W = Math.min(Math.max(1, w), COLS);
  const H = Math.min(Math.max(1, h), ROWS);
  for (let y = 0; y <= ROWS - H; y++) {
    for (let x = 0; x <= COLS - W; x++) {
      let free = true;
      for (let yy = y; yy < y + H && free; yy++) {
        for (let xx = x; xx < x + W; xx++) {
          if (map[yy][xx]) { free = false; break; }
        }
      }
      if (free) return { x, y };
    }
  }
  return { x: 0, y: 0 };
}

function saveCurrentLayout() {
  const items = [];
  grid.engine.nodes.forEach(node => {
    const el = node.el;
    const item = {
      x: node.x,
      y: node.y,
      w: node.w,
      h: node.h,
      icon: el.dataset.icon || "⏹️",
      type: el.dataset.type || "open_url",
      target: el.dataset.target || ""
    };
    if (el.dataset.icon2x) item.icon2x = el.dataset.icon2x;   // bản 288px của icon ảnh
    // Hiển thị phím: kiểu khớp ảnh + nhãn chồng lên icon (chỉ lưu khi có).
    if (el.dataset.fit) item.fit = el.dataset.fit;
    if (el.dataset.title) {
      item.title = el.dataset.title;
      item.titlePos = el.dataset.titlePos || 'bottom';
      item.titleSize = clampInt(el.dataset.titleSize, 9, 32, 14);
      item.titleShadow = el.dataset.titleShadow !== '0';
    }
    // Phím pomodoro: lưu kèm state (đếm ngược, pha, thời lượng) để khôi phục.
    if (item.type === 'pomodoro' && el.__pomo) {
      const st = el.__pomo;
      item.work = st.workMin;
      item.break = st.breakMin;
      item.target = `${st.workMin},${st.breakMin}`;
      item.pomo = {
        mode: st.mode,
        totalSeconds: st.totalSeconds,
        remainingSeconds: st.remainingSeconds,
        isRunning: st.isRunning,
        savedAt: Date.now()
      };
    }
    // Widget "sống" (đồng hồ / thời tiết): lưu kèm cấu hình để khôi phục đúng
    // kiểu mặt số / múi giờ / toạ độ sau khi reload.
    if (item.type === 'mini_clock') item.cfg = parseClockCfg(el);
    if (item.type === 'weather_widget') item.cfg = parseWeatherCfg(el);
    items.push(item);
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

window.createWidgetEl = function(data) {
  const type = data.type || "open_url";
  // Widget "sống" cần biết cấu hình (kiểu mặt / toạ độ) TRƯỚC khi tính kích
  // thước mặc định: Đồng hồ Digital 1x1, Đồng hồ Analog 2x2, Thời tiết 2x1.
  const cfg = (data.cfg && typeof data.cfg === 'object') ? data.cfg : null;
  // Kiểu mặt đồng hồ quyết định cỡ mặc định: Digital 1x1, THẺ LẬT 2x1 (4 tấm số
  // không đủ chỗ ở 1x1), Analog 2x2 (cần chỗ cho mặt số SVG).
  const clockFace = (type === 'mini_clock')
    ? normalizeClockFace((cfg && cfg.face) || String(data.target || '').split(',')[0])
    : null;
  const isAnalogClock = clockFace === 'analog';
  const wideClock = clockFace === 'flip' || isAnalogClock;
  // Kích thước mặc định theo loại widget: Thời tiết 3x1 (đủ 3 cột cho bố cục
  // chuẩn), app_slider/pomodoro/todo_list 2x2 hoặc 2x1, còn lại 1x1.
  const defW = (type === 'weather_widget') ? WEATHER_MIN_W
    : ((type === 'app_slider' || type === 'pomodoro'
      || type === 'todo_list' || wideClock) ? 2 : 1);
  const defH = (type === 'pomodoro' || type === 'todo_list' || isAnalogClock) ? 2 : 1;
  // Chuẩn hoá kích thước trong biên lưới
  const w = Math.min(Math.max(1, data.w || defW), COLS);
  const h = Math.min(Math.max(1, data.h || defH), ROWS);

  // Đảm bảo LUÔN có toạ độ đầy đủ {x,y,w,h}
  let x = (typeof data.x === 'number') ? data.x : null;
  let y = (typeof data.y === 'number') ? data.y : null;
  if (x === null || y === null) {
    const slot = findFreeSlot(w, h);
    x = slot.x;
    y = slot.y;
  }

  // Phím "settings" LUÔN cố định 1x1 (khoá resize) nhưng VẪN KÉO-THẢ được;
  // cử chỉ NHẤP ĐÔI ở phím này tự phân biệt tap vs kéo (xem setupSettingsKey).
  const nodeOpts = (type === 'settings')
    ? { x, y, w: 1, h: 1, noResize: true }
    : { x, y, w, h };
  const el = grid.addWidget(nodeOpts);

  el.dataset.icon = data.icon || "⏹️";
  if (data.icon2x) el.dataset.icon2x = data.icon2x; else delete el.dataset.icon2x;
  el.dataset.type = type;
  applyDisplayToEl(el, data);
  el.dataset.target = (data.target !== undefined && data.target !== null)
    ? String(data.target)
    : (type === "volume_slider" ? "50"
      : (type === 'pomodoro' ? "25,5"
      : (type === 'mini_clock' ? `${CLOCK_DEFAULT.face},${CLOCK_DEFAULT.tz}`
      : (type === 'weather_widget' ? `${WEATHER_DEFAULT.lat},${WEATHER_DEFAULT.lon}` : ""))));

  // Widget "sống": ghi cấu hình vào dataset để render/đọc lại và lưu vào localStorage.
  if (type === 'mini_clock' || type === 'weather_widget') {
    el.dataset.cfg = JSON.stringify(cfg || (type === 'weather_widget'
      ? WEATHER_DEFAULT
      : CLOCK_DEFAULT));
  }
  if (type === 'bongo_cat') {
    const bongoCfg = { size: normalizeBongoSize((cfg && cfg.size) || data.target || '2x1'), showKps: !!(cfg && cfg.showKps !== undefined ? cfg.showKps : true) };
    el.dataset.cfg = JSON.stringify(bongoCfg);
    el.dataset.target = bongoCfg.size;
    el.dataset.showKps = bongoCfg.showKps ? '1' : '0';
  }

  // Phím pomodoro: chuẩn bị tham số khởi tạo + state khôi phục (nếu có).
  if (type === 'pomodoro') {
    const [wm, bm] = parsePomoTarget(el.dataset.target);
    el.__pomoInit = { workMin: wm, breakMin: bm, restore: data.pomo || null };
  }

  renderWidgetContent(el);

  // Phím "Cài đặt": gắn cử chỉ NHẤP ĐÔI (bật/tắt Chế độ Chỉnh sửa).
  if (type === 'settings') setupSettingsKey(el);

  // --- Phản hồi chạm TỨC THÌ (< 5ms) khi pointerdown: lún phím + ripple + âm ---
  el.addEventListener('pointerdown', (e) => {
    if (isEditMode) return;          // Edit Mode: ưu tiên kéo/sửa, không kích hoạt
    if (isSliderWidget(el)) return;  // Thanh trượt có tương tác riêng
    if (el.dataset.type === 'pomodoro') return; // Pomodoro tự xử lý tap/long-press
    if (el.dataset.type === 'settings') return; // "Cài đặt" tự xử lý nhấp đôi
    if (el.dataset.type === 'bongo_cat') return; // Bongo Cat phản hồi qua bàn phím hệ thống
    if (isLiveWidget(el)) return;    // Đồng hồ / Thời tiết có tương tác riêng
    if (e.button) return;            // Chỉ chuột trái / cảm ứng
    pressFeedback(el);
  });
  el.addEventListener('pointerup', () => releaseFeedback(el));
  el.addEventListener('pointercancel', () => releaseFeedback(el));
  el.addEventListener('pointerleave', () => releaseFeedback(el));

  // Kích hoạt hành động (chỉ ở Run Mode) rồi chớp viền OK / lỗi.
  // Dùng 'click' (không dùng touchstart trễ 300ms) nên không có độ trễ.
  el.addEventListener('click', async () => {
    if (isEditMode) return;
    if (gridDragJustHappened) return;
    if (isSliderWidget(el)) return;
    if (el.dataset.type === 'pomodoro') return; // xử lý trong setupPomodoro
    if (el.dataset.type === 'settings') return; // chỉ đổi chế độ khi NHẤP ĐÔI
    if (el.dataset.type === 'bongo_cat') return; // Bongo Cat phản hồi qua bàn phím hệ thống
    if (el.dataset.type === 'todo_list') {      // mở cửa sổ soạn việc trên màn hình PC
      releaseFeedback(el);
      flashKeycap(el, await openTodoEditor());
      return;
    }
    if (isLiveWidget(el)) return;   // Đồng hồ tự chạy; Thời tiết tự làm mới khi chạm
    releaseFeedback(el);
    const ok = await callTauriAction(el.dataset.type, el.dataset.target);
    flashKeycap(el, ok);
  });

  // Chuột phải: phím "Cài đặt" mở bảng Cài đặt Deck ở MỌI chế độ;
  // các phím khác chỉ mở trình chỉnh sửa khi ở Edit Mode.
  el.addEventListener('contextmenu', (e) => {
    if (el.dataset.type === 'settings') {
      e.preventDefault();
      e.stopPropagation();
      openSettings();
      return;
    }
    if (!isEditMode) return;
    e.preventDefault();
    e.stopPropagation();
    openEditModal(el);
  });

  return el;
}

function renderWidgetContent(el) {
  renderWidgetBody(el);
  applyKeyTitle(el);   // nhãn chồng lên icon (nếu có)
}

function renderWidgetBody(el) {
  const content = el.querySelector('.grid-stack-item-content') || el;
  const type = el.dataset.type;

  if (type === 'volume_slider') {
    // Capsule Fader: toàn bộ ô keycap là bể chứa slider (không còn thanh gạt mỏng).
    const curVol = clampInt(parseInt(el.dataset.target, 10), 0, 100, 50);
    content.innerHTML = volumeMarkup(isVectorIcon(el.dataset.icon) ? vectorMarkup(el.dataset.icon)
      : (isDefaultVolIcon(el.dataset.icon) ? VOL_GLYPH : el.dataset.icon), curVol);
    setupTouchSlider(content, el);
  } else if (type === 'app_slider') {
    content.innerHTML = appMarkup(formatIconSource(el.dataset.icon, el.dataset.icon2x));
    setupAppSlider(content, el);
    updateAppWidget(el);
    refreshAudioSessions().then(() => updateAppWidget(el));
  } else if (type === 'pomodoro') {
    // Phím Pomodoro / Timer: vòng LED SVG tròn + số mm:ss hero ở tâm.
    // GLANCEABLE: pha (LÀM VIỆC/NGHỈ) thể hiện bằng MÀU, trạng thái (chạy/dừng)
    // thể hiện bằng GLYPH + animation — không đặt câu chữ nào trên ô.
    // Chữ mô tả vẫn nằm trong DOM dưới lớp .pomo-sr (screen-reader) + tooltip.
    content.innerHTML = `
      <div class="pomodoro-unit forest-theme" data-mode="work" data-state="idle" data-tree="sprout">
        <div class="forest-dial" aria-label="Cây Pomodoro">
          <div class="forest-plate" aria-hidden="true">
            <div class="forest-tree tree-sprout">${TREE_SVGS.sprout}</div>
            <div class="forest-tree tree-growing">${TREE_SVGS.growing}</div>
            <div class="forest-tree tree-full">${TREE_SVGS.full}</div>
            <div class="forest-tree tree-dead">${TREE_SVGS.dead}</div>
          </div>
          <svg class="pomodoro-ring" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
            <defs>
              <linearGradient id="pomoGradWork" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="#e1f9ff"></stop>
                <stop offset="55%" stop-color="#9fe6ff"></stop>
                <stop offset="100%" stop-color="#48b6ff"></stop>
              </linearGradient>
              <linearGradient id="pomoGradBreak" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="#d9f7d8"></stop>
                <stop offset="55%" stop-color="#7ae0a0"></stop>
                <stop offset="100%" stop-color="#2ea86a"></stop>
              </linearGradient>
            </defs>
            <circle class="timer-bg" cx="50" cy="50" r="42"></circle>
            <circle class="timer-progress work" cx="50" cy="50" r="42" stroke-dasharray="263.894" stroke-linecap="round"></circle>
          </svg>
        </div>
        <span class="forest-tag"><span aria-hidden="true">●</span> Study</span>
        <div class="pomodoro-center">
          <span class="timer-time pomo-time-display">25:00</span>
        </div>
        <button class="forest-btn" type="button">Plant</button>
        <span class="pomo-sr pomodoro-mode">POMODORO</span>
        <span class="pomo-sr pomodoro-state">CHẠM ĐỂ CHẠY</span>
      </div>
    `;
    const init = el.__pomoInit || {};
    const [wm, bm] = parsePomoTarget(el.dataset.target);
    initPomodoro(el, (init.workMin !== undefined ? init.workMin : wm),
      (init.breakMin !== undefined ? init.breakMin : bm), init.restore || null);
    el.__pomoInit = null;
    setupPomodoro(el);
    renderPomodoro(el);
  } else if (type === 'mini_clock') {
    // Phím Đồng hồ: Digital (số LED) / Analog (mặt kim SVG) / Thẻ lật (flip).
    const clockCfg = parseClockCfg(el);
    const clockText = clockCfg.label || clockZoneLabel(clockCfg.tz);
    content.innerHTML = (clockCfg.face === 'analog')
      ? clockAnalogMarkup(clockText)
      : (clockCfg.face === 'flip' ? clockFlipMarkup(clockText) : clockDigitalMarkup(clockText));
    setupClockWidget(el);
    updateClockWidget(el);
  } else if (type === 'weather_widget') {
    // Phím Thời tiết: icon vector + nhiệt độ °C (dữ liệu Open-Meteo từ Rust).
    const wxCfg = parseWeatherCfg(el);
    content.innerHTML = weatherMarkup(wxCfg.city);
    setupWeatherWidget(el);
    updateWeatherWidget(el);
  } else if (type === 'bongo_cat') {
    const cfg = parseBongoCfg(el);
    content.innerHTML = bongoCatMarkup(cfg);
    const state = { events: [] };
    el.__bongoState = state;
    const widget = content.querySelector('.bongo-cat-widget');
    if (widget) {
      widget.dataset.action = 'up';
      widget.dataset.hand = 'left';
      setupBongoCatPointer(widget);
    }
  } else if (type === 'todo_list') {
    content.innerHTML = todoMarkup();
    updateTodoWidget(el, true);
  } else if (type === 'settings') {
    // Phím "Cài đặt": CHỈ bánh răng + vòng báo trạng thái Chế độ Chỉnh sửa.
    // MẶT PHÍM KHÔNG CÓ CHỮ: ô 1x1 rất nhỏ, chữ "NHẤP ĐÔI" trước đây nằm đè
    //  ở đáy nên bánh răng phải thu nhỏ và mặt phím trông chật. Gợi ý cử chỉ
    //  giờ nằm trong modal "Cài Đặt Deck" (chuột phải phím ⚙️).
    // (Render trực tiếp, không qua formatIconSource để tránh bị hiểu nhầm
    //  thành tên file ảnh.)
    content.innerHTML = `
      <div class="deck-icon-core settings-core">
        <span class="settings-unit">
          <svg class="settings-ring" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
            <circle class="settings-ring-track" cx="50" cy="50" r="45"></circle>
            <circle class="settings-ring-progress" cx="50" cy="50" r="45"></circle>
          </svg>
          <span class="icon-emoji">⚙️</span>
        </span>
      </div>
    `;
  } else {
    // Phím app 1x1: icon thu gọn 56x56px trong "viên" squircle 12px.
    content.innerHTML = `
      <div class="deck-icon-core" data-fit="${el.dataset.fit === 'cover' ? 'cover' : 'contain'}">
        <span class="icon-chip">${formatIconSource(el.dataset.icon, el.dataset.icon2x)}</span>
      </div>
    `;
  }
}

/* -------------------------------------------------------------------------
   PHÍM ÂM LƯỢNG HỆ THỐNG — FADER CAPSULE THỐNG NHẤT với phím per-app
   -------------------------------------------------------------------------
   MỘT ẩn dụ duy nhất cho cả 2 loại fader (hệ thống + per-app):
     - hàng đầu : icon squircle (BẤM = tắt/bật tiếng) + số %;
     - hàng dưới: .volume-track — capsule bo tròn 999px, fill dâng theo
       --fill-percent, "núm" sáng ở MÉP fill (giống .app-fill::after).
   - Toàn bộ BỀ MẶT ô vẫn vuốt được; track/fill đều pointer-events: none nên
     không nuốt cử chỉ (xem wireCapsuleDrag trong main.js).
   - Ô CAO (h > w): capsule chuyển DỌC, fill dâng từ ĐÁY (data-orient="v").
   ------------------------------------------------------------------------- */
/* Glyph loa thống nhất (thay ⭐ mặc định): sóng/dấu ✕ đổi theo mức nhờ CSS
   [data-level] và .is-muted — không cần nạp bộ icon lazy. */
const VOL_GLYPH = `<svg class="vol-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M11 5 6 9H2v6h4l5 4z"/>
  <path class="vg-w1" d="M15.5 8.5a5 5 0 0 1 0 7"/>
  <path class="vg-w2" d="M19 5a10 10 0 0 1 0 14"/>
  <g class="vg-x"><path d="m16 9 6 6"/><path d="m22 9-6 6"/></g></svg>`;
const volLevel = (pct) => (pct <= 0 ? '0' : pct <= 40 ? '1' : '2');
const isDefaultVolIcon = (ic) => !ic || ic === '⭐' || ic === '⏹️' || ic === '🔊';

function volumeMarkup(icon, pct) {
  const value = clampInt(pct, 0, 100, 50);
  return `
    <div class="volume-deck-unit" data-orient="h" data-state="active" data-level="${volLevel(value)}"
         style="--fill-percent:${value}">
      <div class="volume-core">
        <button type="button" class="vol-icon app-icon-btn"
                aria-label="Tắt/bật tiếng hệ thống">${icon}</button>
        <span class="vol-label">Âm lượng</span>
        <span class="vol-number">${value}%</span>
      </div>
      <div class="volume-track"><span class="volume-fill"></span></div>
      <span class="wx-sr">Âm lượng hệ thống ${value} phần trăm</span>
    </div>
  `;
}

/* Phím âm lượng per-app: icon squircle (bấm = tắt/bật tiếng) + tên app +
   số % + thanh gạt mini + CHẤM LED 4px trạng thái ở đáy keycap. */
function appMarkup(icon) {
  return `
    <div class="app-deck-unit" data-state="off" style="--fill-percent:0">
      <div class="app-head">
        <button type="button" class="app-icon-btn">${icon}</button>
        <span class="app-text">
          <span class="app-name"></span>
          <span class="app-hint"></span>
        </span>
        <span class="app-percent">--</span>
      </div>
      <div class="app-track">
        <div class="app-fill"></div>
      </div>
      <i class="app-led" aria-hidden="true"></i>
    </div>
  `;
}

function bongoCatMarkup(cfg = { size: '2x1', showKps: true }) {
  const size = normalizeBongoSize(cfg.size);
  const showKps = !!cfg.showKps;
  return `
    <div class="bongo-cat-widget ${showKps ? '' : 'hide-kps'}" data-size="${size}" data-action="up" data-hand="left">
      <div class="bongo-kps">${showKps ? 'KPS 0.0' : ''}</div>
      <div class="bongo-scene">
        <svg class="bongo-svg" viewBox="0 0 320 190" aria-hidden="true">
          <path class="bongo-trackpad" d="M7 112 L91 95 L133 111 L113 165 L2 144 Z"/>
          <path class="bongo-trackpad-mark" d="M19 116 L88 102 L121 114 L106 154 L11 137 Z"/>
          <path class="bongo-cat-shape" d="M69 145 C61 131 63 111 69 91 C79 61 103 42 139 31 L155 12 Q160 5 165 14 L178 35 C210 42 236 56 259 73 L278 60 Q285 57 284 67 L279 111 C289 124 292 138 286 151 L269 161 L84 161 Z"/>
          <path class="bongo-ear-inner" d="M151 24 L159 39 L170 37 Z M270 72 L278 68 L275 96 Z"/>
          <g class="bongo-eyes">
            <circle cx="143" cy="79" r="4.5"/>
            <circle cx="204" cy="91" r="4.5"/>
            <path d="M160 86 Q165 96 170 87 Q177 100 184 90"/>
          </g>
          <g class="bongo-whiskers">
            <path d="M133 93 L111 89 M133 98 L108 101 M213 102 L235 98 M212 107 L237 111"/>
          </g>
          <path class="bongo-keyboard-case" d="M113 112 L314 128 L292 184 L88 162 Z"/>
          <path class="bongo-keyboard-row" d="M119 119 L307 134 M113 130 L303 146 M106 142 L299 158 M99 153 L295 171"/>
          <path class="bongo-keyboard-cols" d="M142 114 L126 166 M164 116 L151 169 M186 118 L176 172 M208 120 L201 175 M230 122 L226 177 M252 124 L251 180 M274 126 L276 182"/>
          <g class="bongo-key bongo-key-left"><path d="M120 121 L140 123 L137 132 L117 130 Z"/></g>
          <g class="bongo-key bongo-key-right"><path d="M231 130 L251 132 L248 141 L228 139 Z"/></g>
          <g class="bongo-key bongo-key-left secondary"><path d="M111 143 L130 145 L127 154 L108 152 Z"/></g>
          <g class="bongo-key bongo-key-right secondary"><path d="M218 153 L237 155 L234 164 L215 162 Z"/></g>
          <path class="bongo-spacebar" d="M148 155 L208 160 L205 169 L145 164 Z"/>
          <g class="bongo-arm bongo-arm-left">
            <path class="bongo-paw" d="M94 99 C83 113 75 121 66 125 C54 130 47 123 50 114 C54 104 69 94 79 84 Z"/>
            <path class="bongo-paw-line" d="M65 122 Q70 112 77 106"/>
          </g>
          <g class="bongo-arm bongo-arm-right">
            <path class="bongo-paw" d="M231 111 C239 120 248 124 255 127 C266 132 275 126 271 117 C267 108 257 101 248 94 Z"/>
            <path class="bongo-paw-pad" d="M250 112 C246 107 250 102 254 105 C257 100 263 104 261 109 C266 112 263 118 257 118 C254 118 252 116 250 112Z"/>
          </g>
        </svg>
      </div>
    </div>
  `;
}

/* Hướng fader theo hình dạng ô: CAO hơn rộng -> 'v' (fill dâng từ đáy). */
function applyVolumeOrient(el, unit) {
  const node = el.gridstackNode || {};
  const w = Number(node.w) || 1;
  const h = Number(node.h) || 1;
  const orient = h > w ? 'v' : 'h';
  if (unit.dataset.orient !== orient) unit.dataset.orient = orient;
  return orient;
}

/** Đồng bộ lại MỌI phím sau khi đổi cỡ ô / đổi cỡ cửa sổ:
    - volume_slider: chọn lại hướng fader (ngang <-> dọc);
    - app_slider   : gán lại class cỡ ô (1x1 -> icon squircle + LED);
    - clock/weather: gán lại class cỡ ô NGAY. CSS của 2 widget này đổi HẲN bố cục
      theo tier (.keycap-weather.is-mini/is-short/is-tall/is-big,
      .keycap-clock-digital.is-mini/is-big) nên nếu chỉ chờ vòng tick (1s / 15
      phút) thì ô vừa resize sẽ hiển thị sai cỡ chữ, sai cỡ icon. */
function refreshSliderLayouts() {
  document.querySelectorAll('.grid-stack-item').forEach((el) => {
    const type = el.dataset.type;
    if (type === 'volume_slider') {
      const unit = el.querySelector('.volume-deck-unit');
      if (unit) applyVolumeOrient(el, unit);
    } else if (type === 'app_slider') {
      updateAppWidget(el);
    } else if (type === 'weather_widget' || type === 'mini_clock') {
      const unit = el.querySelector('.weather-unit, .clock-unit');
      if (unit) applyWidgetTier(el, unit);
    } else if (type === 'pomodoro') {
      const unit = el.querySelector('.pomodoro-unit');
      if (unit) applyWidgetTier(el, unit);
    } else if (type === 'todo_list') {
      updateTodoWidget(el);
    }
  });
}

let sliderRefreshTimer = null;
/** Gom nhiều lần đổi cỡ liên tiếp thành 1 lần cập nhật (tránh layout thrash). */
function scheduleSliderRefresh() {
  if (sliderRefreshTimer !== null) clearTimeout(sliderRefreshTimer);
  sliderRefreshTimer = setTimeout(() => {
    sliderRefreshTimer = null;
    refreshSliderLayouts();
  }, 60);
}

/* 6a. HELPERS: bắt cử chỉ VUỐT cho mọi "bể chứa" slider (Capsule Fader)
   -------------------------------------------------------------------------
   - Bề mặt nhận sự kiện là TOÀN BỘ container của ô (không chỉ thanh gạt).
   - Tỉ lệ % tính trực tiếp theo rect.width (ngang) hoặc rect.height (dọc,
     ô cao) — dọc: đáy = 0%, đỉnh = 100%.
   - Throttle CAPSULE_THROTTLE_MS (20ms) cho CẢ DOM lẫn IPC; giá trị cuối
     luôn được FLUSH khi nhả tay nên không mất mức vừa chọn.
   - setPointerCapture: kéo lệch ra ngoài ô vẫn bám đúng ngón tay.
   - Chống CHẠM NHẦM: giá trị chỉ đổi sau khi tay di chuyển > DRAG_ENGAGE_PX,
     nên một cú chạm lỡ không làm âm lượng "nhảy" về vị trí ngón tay.
   - pointerdown bị stopPropagation để GridStack không cướp thao tác. */
function wireCapsuleDrag(widgetEl, unit, onRatio) {
  let dragging = false;
  let engaged = false;       // tay đã di chuyển đủ xa để tính là VUỐT chưa
  let downX = 0;
  let downY = 0;
  let lastRunAt = -Infinity;
  let pending = null;        // tỉ lệ 0..1 đang chờ flush
  let flushTimer = null;

  const isVertical = () => unit.dataset.orient === 'v';

  /* NGƯỠNG CHỐNG CHẠM NHẦM: phải di chuyển > 8px mới bắt đầu đổi giá trị.
     Trước đây pointerdown ghi giá trị ngay -> một cú chạm lỡ (lòng bàn tay,
     ngón út quệt qua) làm âm lượng nhảy thẳng về vị trí ngón tay. */
  const DRAG_ENGAGE_PX = 8;

  function ratioAt(clientX, clientY) {
    const rect = unit.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const raw = isVertical()
      ? (rect.bottom - clientY) / rect.height
      : (clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(1, raw));
  }

  /* immediate = ghi NGAY (nhịp flush giữa chừng / giá trị cuối khi nhả tay);
     còn lại gom theo nhịp CAPSULE_THROTTLE_MS (20ms). */
  function apply(ratio, immediate) {
    const now = performance.now();
    if (!immediate && now - lastRunAt < CAPSULE_THROTTLE_MS) {
      pending = ratio;
      if (flushTimer === null) {
        flushTimer = setTimeout(() => {
          flushTimer = null;
          const queued = pending;
          pending = null;
          if (queued !== null) apply(queued, true);
        }, CAPSULE_THROTTLE_MS);
      }
      return;
    }
    lastRunAt = now;
    pending = null;
    onRatio(ratio);
  }

  unit.addEventListener('pointerdown', (e) => {
    if (isEditMode) return;                      // Edit Mode: nhường cho kéo/đổi cỡ
    if (e.button) return;                        // chỉ chuột trái / cảm ứng
    if (e.target.closest && e.target.closest('.app-icon-btn')) return;  // nút mute
    dragging = true;
    engaged = false;
    downX = e.clientX;
    downY = e.clientY;
    widgetEl.dataset.dragging = '1';
    e.stopPropagation();                         // không cho GridStack cướp cử chỉ
    if (unit.setPointerCapture) {
      try { unit.setPointerCapture(e.pointerId); } catch (_) { /* WebView cũ */ }
    }
    // KHÔNG ghi giá trị ở đây: chờ vượt DRAG_ENGAGE_PX (xem giải thích phía trên).
  });

  unit.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    if (!engaged) {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) < DRAG_ENGAGE_PX) return;
      engaged = true;                            // đã vuốt thật -> bắt đầu ghi mức
    }
    const ratio = ratioAt(e.clientX, e.clientY);
    if (ratio !== null) apply(ratio, false);
  });

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    widgetEl.dataset.dragging = '0';
    if (flushTimer !== null) { clearTimeout(flushTimer); flushTimer = null; }
    if (pending !== null) {                      // flush mức cuối cùng
      const queued = pending;
      pending = null;
      apply(queued, true);
    }
    saveCurrentLayout();
  }
  unit.addEventListener('pointerup', endDrag);
  unit.addEventListener('pointercancel', endDrag);

  // Chặn cử chỉ cổ điển (một số WebView vẫn phát mouse/touch song song)
  ['mousedown', 'touchstart'].forEach((evt) => {
    unit.addEventListener(evt, (e) => {
      if (!isEditMode) e.stopPropagation();
    }, { passive: false });
  });
}

/* 6b. Phím ÂM LƯỢNG HỆ THỐNG: fader capsule thống nhất với phím per-app
   (hàng đầu icon + số %, hàng dưới thanh capsule). Không còn "fill phủ kín
   keycap" như bản cũ.

   Cử chỉ:
     - VUỐT ở bất kỳ đâu trên ô -> đặt mức âm lượng (dead-zone 8px chống chạm lầm);
     - BẤM icon squircle     -> TẮT/BẬT TIẾNG toàn hệ thống (đối xứng phím per-app).
   Mức tắt tiếng KHÔNG lưu vào layout: khi mở lại app, deck hiển thị mức trong
   layout và trạng thái "đang phát" (đúng với thực tế hệ thống sau khi khởi động). */
function setupTouchSlider(container, widgetEl) {
  const unit = container.querySelector('.volume-deck-unit');
  if (!unit) return;
  const valText = unit.querySelector('.vol-number');
  const iconBtn = unit.querySelector('.vol-icon');
  applyVolumeOrient(widgetEl, unit);
  widgetEl.dataset.muted = '0';

  wireCapsuleDrag(widgetEl, unit, (ratio) => {
    const pct = ratio * 100;
    unit.style.setProperty('--fill-percent', pct.toFixed(1));  // đổi fill NGAY
    if (valText) valText.innerText = Math.round(pct) + '%';
    unit.dataset.level = volLevel(Math.round(pct));
    widgetEl.dataset.target = Math.round(pct);
    // Tay đang chủ động chọn mức -> tự bỏ trạng thái tắt tiếng (cả mute THẬT của
    // Windows: đổi âm lượng qua API không tự bỏ mute như khi bấm phím cứng)
    if (widgetEl.dataset.muted === '1') {
      setVolumeMuted(unit, widgetEl, false);
      setSystemMute(false);
    }
    sendSystemVolume(Math.round(pct));                         // IPC sang Rust (gộp nhịp)
  });

  // --- BẤM icon squircle -> TẮT/BẬT TIẾNG toàn hệ thống ---
  // Dùng mute THẬT của Windows (set_master_mute): mức âm lượng giữ nguyên nên khi bật
  // lại vẫn đúng chỗ đang nghe và các app khác thấy đúng trạng thái tắt tiếng.
  iconBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
  iconBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (gridDragJustHappened) return;
    const wasMuted = widgetEl.dataset.muted === '1';
    setVolumeMuted(unit, widgetEl, !wasMuted);                 // đổi HÌNH ngay
    const ok = await setSystemMute(!wasMuted);
    if (!ok) setVolumeMuted(unit, widgetEl, wasMuted);         // lỗi -> trả hình về như cũ
    flashKeycap(widgetEl, ok);
  });
}

/** Đổi trạng thái tắt tiếng của phím âm lượng hệ thống (CHỈ đổi hình, không IPC).
    - Giữ nguyên MỨC trong layout/số % -> người dùng biết sẽ bật lại về đâu;
      CSS .volume-deck-unit.is-muted lo phần track xám + icon viền đỏ. */
function setVolumeMuted(unit, widgetEl, muted) {
  const pct = clampInt(widgetEl.dataset.target, 0, 100, 50);
  widgetEl.dataset.muted = muted ? '1' : '0';
  unit.classList.toggle('is-muted', muted);
  unit.dataset.level = volLevel(pct);
  unit.dataset.state = muted ? 'muted' : (pct > 0 ? 'active' : 'idle');
  const iconBtn = unit.querySelector('.vol-icon');
  if (iconBtn) iconBtn.classList.toggle('muted', muted);
  unit.style.setProperty('--fill-percent', String(pct));
  const valText = unit.querySelector('.vol-number');
  if (valText) valText.innerText = pct + '%';
}

/* 6c. Slider âm lượng PER-APP — vuốt ở BẤT KỲ ĐÂU trên bề mặt ô.
   wireCapsuleDrag đã throttle 20ms; sau đó gom tiếp 1 lần/frame (rAF) thành
   đúng 1 lệnh IPC nên kéo liên tục cũng không spam Rust. */
function setupAppSlider(container, el) {
  const unit = container.querySelector('.app-deck-unit');
  const percentEl = unit.querySelector('.app-percent');
  const iconBtn = unit.querySelector('.app-icon-btn');

  // --- Throttle: gom mọi thay đổi trong 1 frame thành đúng 1 lệnh IPC ---
  let rafId = null;
  let pendingVolume = null;

  function flushVolume() {
    rafId = null;
    if (pendingVolume === null) return;
    const pid = parseInt(el.dataset.pid, 10);
    const volume = pendingVolume;
    pendingVolume = null;
    if (!pid) return;
    invokeCmd('set_app_volume', { pid, volume }).catch((err) =>
      console.error('set_app_volume lỗi:', err));
  }

  function queueVolume(fraction) {
    pendingVolume = Math.max(0, Math.min(1, fraction));
    if (rafId === null) rafId = requestAnimationFrame(flushVolume);
  }

  // --- Vuốt trên TOÀN BỘ ô: % lấy trực tiếp theo rect.width/height của ô ---
  wireCapsuleDrag(el, unit, (ratio) => {
    const pct = Math.round(ratio * 100);
    setFillPercent(unit, pct);
    if (percentEl) percentEl.innerText = pct + '%';
    const session = audioSessionCache.find((s) => s.pid === parseInt(el.dataset.pid, 10));
    if (session) {
      session.volume = ratio;
      setAppState(unit, session.muted ? 'muted' : (pct > 0 ? 'active' : 'idle'));
    }
    queueVolume(ratio);
  });

  // Lệnh IPC cuối cùng luôn được gửi ngay khi nhả tay
  unit.addEventListener('pointerup', () => {
    if (pendingVolume !== null && rafId === null) flushVolume();
  });

  // Thanh gạt là một phần của bề mặt ô: KHÔNG chặn cử chỉ ở đây nữa để vuốt
  // được từ mọi điểm (kể cả trên thanh) — wireCapsuleDrag đã stopPropagation
  // nên GridStack vẫn không cướp thao tác. Nút mute thì vẫn tách riêng.
  iconBtn.addEventListener('pointerdown', (e) => e.stopPropagation());

  // --- Click icon app -> bật/tắt tiếng (toggle_app_mute) ---
  iconBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (gridDragJustHappened) return;
    const pid = parseInt(el.dataset.pid, 10);
    if (!pid) {
      // Chưa chọn app nào -> mở bảng chọn app; đã chọn mà chưa phát -> quét lại.
      if (!String(el.dataset.target || '').trim()) { openEditModal(el); return; }
      await refreshAudioSessions();
      updateAppWidget(el);
      return;
    }
    try {
      const muted = await invokeCmd('toggle_app_mute', { pid });
      unit.classList.toggle('is-muted', !!muted);
      iconBtn.classList.toggle('muted', !!muted);
      setAppState(unit, muted ? 'muted' : 'active');   // LED đỏ khi tắt tiếng
      if (typeof muted === 'boolean') {
        const s = audioSessionCache.find(x => x.pid === pid);
        if (s) s.muted = muted;
      }
      flashKeycap(el, true);
    } catch (err) {
      console.error('toggle_app_mute lỗi:', err);
      flashKeycap(el, false);
    }
  });
}

/* =========================================================================
   6c. POMODORO / TIMER — Vòng LED SVG hiển thị tiến độ + quản lý đếm ngược
   -------------------------------------------------------------------------
   - State riêng cho từng phím gắn trên chính element (el.__pomo):
       { mode:'work'|'break'|'idle', workMin, breakMin,
         totalSeconds, remainingSeconds, isRunning, endAt }
   - Đếm theo MỐC KẾT THÚC TUYỆT ĐỐI bằng Date.now() (đồng hồ hệ thống): vẫn chạy đúng
     khi cửa sổ bị treo, máy ngủ (sleep/resume) hoặc app bị đóng rồi mở lại
     (performance.now() có thể ngừng chạy lúc máy ngủ nên không dùng).
     Vòng tick 1s duy nhất cho toàn bộ phím chỉ để vẽ lại và bắt hết giờ.
   - Hết giờ nối pha kế tiếp vào ĐÚNG mốc đã hẹn (không trôi) và bỏ qua các pha
     đã trôi hết nếu máy ngủ/app đóng lâu.
   - Chạm 1 lần: Play/Pause. Giữ 500ms: Reset về pha Work.
   - Hết giờ: tự đổi pha (Work <-> Break), chớp nháy viền LED ~1.5s + beep.
   - Lưu state vào localStorage (kèm savedAt) để khôi phục khi reload app.
   ========================================================================= */
const POMO_RADIUS = 42;
const POMO_CIRCUMFERENCE = 2 * Math.PI * POMO_RADIUS;   // ~263.894

/** Chuẩn hoá số nguyên trong [min,max] với giá trị mặc định fallback. */
function clampInt(value, min, max, fallback) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/** "25,5" -> [25, 5] (phút Work, phút nghỉ). */
function parsePomoTarget(target) {
  const parts = String(target || '').split(',');
  return [
    clampInt(parts[0], 1, 180, 25),
    clampInt(parts[1], 1, 120, 5)
  ];
}

/** Định dạng mm:ss. */
function formatMMSS(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return String(m).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
}

/** Khởi tạo state cho 1 phím pomodoro (có thể khôi phục từ restore). */
function initPomodoro(el, workMin, breakMin, restore) {
  const wm = clampInt(workMin, 1, 180, 25);
  const bm = clampInt(breakMin, 1, 120, 5);
  el.dataset.work = String(wm);
  el.dataset.break = String(bm);

  if (restore && typeof restore === 'object') {
    const mode = (restore.mode === 'work' || restore.mode === 'break' || restore.mode === 'idle')
      ? restore.mode : 'idle';
    const freshTotal = (mode === 'break' ? bm : wm) * 60;
    const remaining = (typeof restore.remainingSeconds === 'number')
      ? restore.remainingSeconds : freshTotal;
    const st = {
      mode,
      workMin: wm,
      breakMin: bm,
      totalSeconds: (typeof restore.totalSeconds === 'number' && restore.totalSeconds > 0)
        ? restore.totalSeconds : freshTotal,
      remainingSeconds: Math.max(0, Math.round(remaining)),
      isRunning: !!restore.isRunning,
      endAt: null
    };
    if (st.isRunning) {
      // Mốc kết thúc tuyệt đối tính từ lúc LƯU (savedAt) -> thời gian app đóng / máy ngủ
      // được tính đúng. Nếu đã quá hạn, vòng tick sẽ gọi completePomodoro() và nhảy
      // qua các pha đã trôi hết.
      const base = (typeof restore.savedAt === 'number') ? restore.savedAt : Date.now();
      st.endAt = base + st.remainingSeconds * 1000;
      st.remainingSeconds = Math.max(0, Math.round((st.endAt - Date.now()) / 1000));
    }
    el.__pomo = st;
    return;
  }

  el.__pomo = {
    mode: 'idle',
    workMin: wm,
    breakMin: bm,
    totalSeconds: wm * 60,
    remainingSeconds: wm * 60,
    isRunning: false,
    endAt: null
  };
}

/** Bắt đầu / tiếp tục đếm ngược. */
function startPomodoro(el) {
  const st = el.__pomo;
  if (!st) return;
  if (st.mode === 'idle') {
    st.mode = 'work';
    st.totalSeconds = st.workMin * 60;
  }
  if (st.remainingSeconds <= 0) st.remainingSeconds = st.totalSeconds;
  st.isRunning = true;
  st.endAt = Date.now() + st.remainingSeconds * 1000;
  renderPomodoro(el);
}

/** Tạm dừng đếm (chốt lại số giây còn lại). */
function pausePomodoro(el) {
  const st = el.__pomo;
  if (!st || !st.isRunning) return;
  st.remainingSeconds = Math.max(0, Math.round((st.endAt - Date.now()) / 1000));
  st.isRunning = false;
  st.endAt = null;
  renderPomodoro(el);
}

function cancelPomodoro(el) {
  const st = el.__pomo;
  if (!st) return;
  st.mode = 'idle';
  st.isRunning = false;
  st.endAt = null;
  st.totalSeconds = st.workMin * 60;
  st.remainingSeconds = st.totalSeconds;
  renderPomodoro(el);
  saveCurrentLayout();
}

/** Chạm 1 lần: đảo trạng thái Play/Pause. */
function togglePomodoro(el) {
  const st = el.__pomo;
  if (!st) return;
  if (st.isRunning) pausePomodoro(el); else startPomodoro(el);
  saveCurrentLayout();
}

/** Giữ 500ms: reset về pha Work ban đầu (dừng đếm). */
function resetPomodoro(el) {
  const st = el.__pomo;
  if (!st) return;
  st.mode = 'work';
  st.isRunning = false;
  st.endAt = null;
  st.totalSeconds = st.workMin * 60;
  st.remainingSeconds = st.totalSeconds;
  renderPomodoro(el);
  flashKeycap(el, true);
  saveCurrentLayout();
}

/** Hết giờ: tự đổi pha và chạy tiếp, chớp nháy viền LED + beep. */
function completePomodoro(el) {
  const st = el.__pomo;
  if (!st) return;
  const now = Date.now();
  // Nối pha kế tiếp vào ĐÚNG mốc kết thúc đã hẹn (không phải "bây giờ") nên không trôi
  // ~0.5–1s mỗi pha; nếu máy ngủ/app đóng lâu thì bỏ qua các pha đã trôi hết.
  let mode = st.mode;
  let end = (typeof st.endAt === 'number') ? st.endAt : now;
  let total = st.totalSeconds;
  let guard = 0;
  do {
    mode = (mode === 'break') ? 'work' : 'break';
    total = (mode === 'break' ? st.breakMin : st.workMin) * 60;
    end += total * 1000;
    guard++;
  } while (end <= now && guard < 1000);
  if (end <= now) end = now + total * 1000;   // chốt an toàn
  st.mode = mode;
  st.totalSeconds = total;
  st.endAt = end;
  st.remainingSeconds = Math.max(0, Math.round((end - now) / 1000));
  st.isRunning = true;                    // tự động chạy tiếp pha kế tiếp
  renderPomodoro(el);
  blinkPomodoro(el);
  playPomodoroBeep();
  saveCurrentLayout();
}

/** Tick display path: update only the countdown text and progress offset. */
function updatePomodoroClock(el) {
  const st = el.__pomo;
  if (!st) return;
  const content = keyContent(el);
  const unit = content.querySelector('.pomodoro-unit');
  const ring = content.querySelector('.timer-progress');
  const timeEl = content.querySelector('.pomo-time-display');
  if (!unit || !ring || !timeEl) return;

  const ratio = st.totalSeconds > 0
    ? Math.max(0, Math.min(1, st.remainingSeconds / st.totalSeconds))
    : 0;
  ring.style.strokeDashoffset = String(POMO_CIRCUMFERENCE * (1 - ratio));
  timeEl.textContent = formatMMSS(st.remainingSeconds);
}

function pomodoroTreeState(st) {
  if (st.mode === 'idle') return 'sprout';
  if (st.mode === 'break') return 'full';
  const progress = st.totalSeconds > 0 ? 1 - st.remainingSeconds / st.totalSeconds : 0;
  return progress >= 0.8 ? 'full' : progress >= 0.3 ? 'growing' : 'sprout';
}

function schedulePomodoroTree(el, unit, st) {
  (st.treeTimers || []).forEach(clearTimeout);
  st.treeTimers = [];
  unit.dataset.tree = pomodoroTreeState(st);
  if (!st.isRunning || st.mode !== 'work' || st.totalSeconds <= 0) return;

  const elapsed = st.totalSeconds - st.remainingSeconds;
  [[0.3, 'growing'], [0.8, 'full']].forEach(([threshold, tree]) => {
    const delay = threshold * st.totalSeconds - elapsed;
    if (delay <= 0) return;
    st.treeTimers.push(setTimeout(() => {
      if (el.__pomo === st && st.isRunning && st.mode === 'work') unit.dataset.tree = tree;
    }, delay * 1000));
  });
}

/** Render state changes; the one-second tick uses updatePomodoroClock only. */
function renderPomodoro(el) {
  const st = el.__pomo;
  if (!st) return;
  const content = keyContent(el);
  const unit = content.querySelector('.pomodoro-unit');
  const ring = content.querySelector('.timer-progress');
  const modeEl = content.querySelector('.pomodoro-mode');
  const stateEl = content.querySelector('.pomodoro-state');
  if (!unit || !ring) return;

  updatePomodoroClock(el);

  const isBreak = st.mode === 'break';
  const isIdle = !st.isRunning && st.mode === 'idle';
  ring.classList.toggle('break', isBreak);
  ring.classList.toggle('work', !isBreak);
  // Vòng tiến độ dùng GRADIENT neon (đỏ cam cho LÀM VIỆC, xanh ngọc cho NGHỈ);
  // CSS vẫn giữ stroke: currentColor làm phương án dự phòng khi gradient lỗi.
  ring.style.stroke = isBreak ? 'url(#pomoGradBreak)' : 'url(#pomoGradWork)';

  unit.classList.add('forest-theme');
  unit.classList.toggle('is-break', isBreak);
  unit.classList.toggle('is-running', st.isRunning);
  unit.classList.toggle('is-paused', !st.isRunning && !isIdle);
  unit.classList.toggle('is-idle', isIdle);
  applyWidgetTier(el, unit);

  // PHA + TRẠNG THÁI chỉ thể hiện bằng màu sắc / glyph (xem CSS .pomodoro-unit):
  //   data-mode  = work (đỏ cam) | break (xanh ngọc)
  //   data-state = running (▶ + vòng "thở") | paused (❚❚) | idle (▶ mờ nháy)
  unit.dataset.mode = isBreak ? 'break' : 'work';
  unit.dataset.state = st.isRunning ? 'running' : (isIdle ? 'idle' : 'paused');
  schedulePomodoroTree(el, unit, st);
  const modeText = isBreak ? 'NGHỈ NGƠI' : (isIdle ? 'POMODORO' : 'LÀM VIỆC');
  const stateText = st.isRunning ? 'ĐANG CHẠY' : (isIdle ? 'CHẠM ĐỂ CHẠY' : 'TẠM DỪNG');
  // Chữ chỉ còn trong DOM (ẩn thị giác) cho screen-reader + tooltip khi rê chuột.
  if (modeEl) modeEl.textContent = modeText;
  if (stateEl) stateEl.textContent = stateText;
  const button = unit.querySelector('.forest-btn');
  if (button) button.textContent = st.isRunning ? 'Give Up' : (isIdle ? 'Plant' : 'Resume');
  unit.title = `${modeText} · ${stateText}`;
}

/** Chớp nháy viền LED ~1.5s khi hết giờ. */
function blinkPomodoro(el) {
  const content = keyContent(el);
  content.classList.remove('pomo-finish');
  void content.offsetWidth;    // ép reflow để animation chạy lại
  content.classList.add('pomo-finish');
  setTimeout(() => content.classList.remove('pomo-finish'), 1600);
}

/* Beep nhẹ bằng WebAudio (3 tiếng ngắn), không cần file ngoài. */
let pomoAudioCtx = null;
function playPomodoroBeep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    pomoAudioCtx = pomoAudioCtx || new Ctx();
    if (pomoAudioCtx.state === 'suspended') pomoAudioCtx.resume();
    const t0 = pomoAudioCtx.currentTime;
    [0, 0.22, 0.44].forEach((delay, i) => {
      const osc = pomoAudioCtx.createOscillator();
      const gain = pomoAudioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880 + i * 130, t0 + delay);
      gain.gain.setValueAtTime(0.0001, t0 + delay);
      gain.gain.exponentialRampToValueAtTime(0.14, t0 + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + delay + 0.18);
      osc.connect(gain).connect(pomoAudioCtx.destination);
      osc.start(t0 + delay);
      osc.stop(t0 + delay + 0.2);
    });
  } catch (_) { /* bỏ qua nếu WebAudio không khả dụng */ }
}

/** Tương tác cảm ứng: Tap = Play/Pause, Long-press 500ms = Reset. */
function setupPomodoro(el) {
  const content = keyContent(el);
  let pressTimer = null;
  let longPressed = false;

  const button = content.querySelector('.forest-btn');
  if (button) {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (isEditMode) return;
      if (el.__pomo && el.__pomo.isRunning) cancelPomodoro(el);
      else {
        startPomodoro(el);
        saveCurrentLayout();
      }
    });
  }

  content.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.forest-btn')) return;
    if (isEditMode) return;          // Edit Mode: ưu tiên kéo/sửa
    if (e.button) return;            // Chỉ chuột trái / cảm ứng
    longPressed = false;
    pressFeedback(el);
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => {
      longPressed = true;
      resetPomodoro(el);             // giữ 500ms -> reset về Work
    }, 500);
  });

  const finishPress = (e) => {
    if (e.target.closest('.forest-btn')) return;
    clearTimeout(pressTimer);
    releaseFeedback(el);
    if (longPressed) { longPressed = false; return; }  // long-press đã reset
    if (isEditMode) return;
    togglePomodoro(el);                                 // tap -> play/pause
  };

  content.addEventListener('pointerup', finishPress);
  content.addEventListener('pointercancel', () => { clearTimeout(pressTimer); releaseFeedback(el); });
  content.addEventListener('pointerleave', () => { clearTimeout(pressTimer); releaseFeedback(el); });
}

/** Vòng tick 1s: cập nhật mọi phím pomodoro đang chạy + xử lý hết giờ. */
function pomodoroTick() {
  const items = document.querySelectorAll('.grid-stack-item[data-type="pomodoro"]');
  items.forEach((el) => {
    const st = el.__pomo;
    if (!st || !st.isRunning) return;
    const remaining = Math.max(0, Math.round((st.endAt - Date.now()) / 1000));
    if (remaining !== st.remainingSeconds) {
      st.remainingSeconds = remaining;
      updatePomodoroClock(el);
    }
    if (remaining <= 0) completePomodoro(el);
  });
}
setInterval(pomodoroTick, 1000);

/* Tự lưu state pomodoro định kỳ (mỗi 15s) để khôi phục chính xác khi reload. */
setInterval(() => {
  const anyRunning = Array.from(document.querySelectorAll('.grid-stack-item[data-type="pomodoro"]'))
    .some(el => el.__pomo && el.__pomo.isRunning);
  if (anyRunning) saveCurrentLayout();
}, 15000);

/* =========================================================================
   6d. WIDGET ĐỒNG HỒ MINI (mini_clock) + THỜI TIẾT (weather_widget)
   -------------------------------------------------------------------------
   - Đồng hồ Digital 1x1: cập nhật mỗi 1000ms (giờ:phút + giây).
   - Đồng hồ Analog 2x2: 3 kim SVG, cập nhật mỗi 100ms -> kim giây quét mượt.
   - Đồng hồ THẺ LẬT (flip) 2x1: 4 tấm số HH MM của MẶT 24 GIỜ (0h..23h, KHÔNG
     có nhãn AM/PM), mỗi tấm 2 nửa tĩnh + 2 lá lật, cập nhật mỗi 1000ms.
   - Thời tiết (bố cục 3x1 mặc định, co được về 2x1 / 2x2 / 1x1): gọi Rust
     `get_weather_data` (Open-Meteo) mỗi 15 phút; CHẠM vào phím = làm mới ngay
     (có chống dội API). Dữ liệu lưu cache RAM + LocalStorage kèm timestamp:
     mở lại app là có số ngay, mất mạng quá 30 phút thì hiện badge "DỮ LIỆU CŨ".
   - Mọi cập nhật chỉ ghi vào DOM của phím, KHÔNG re-render lại GridStack nên
     bố cục deck không bị nhấp nháy.
   ========================================================================= */
const CLOCK_TICK_DIGITAL_MS = 1000;
const CLOCK_TICK_ANALOG_MS = 100;
const CLOCK_TICK_FLIP_MS = 1000;   // mặt thẻ lật chỉ đổi số mỗi phút -> tick 1s là đủ
const CLOCK_DEFAULT = { face: 'digital', tz: 7, label: 'HÀ NỘI' };
/* Thời tiết: skin mặc định "soft" = Màu dịu (gradient full-bleed, giảm 30% chói),
   "flat" = Phẳng (nền #111317, chỉ giữ màu ở cụm minh hoạ). */
const WEATHER_DEFAULT = { lat: 10.8231, lon: 106.6297, city: 'TP. HỒ CHÍ MINH', skin: 'soft' };
const WEATHER_REFRESH_MS = 15 * 60 * 1000;   // vòng làm mới nền: 15 phút
const WEATHER_STALE_MS = 30 * 60 * 1000;     // dữ liệu cũ hơn 30 phút = "CŨ"
const WEATHER_TAP_DEBOUNCE_MS = 500;          // chạm liên tiếp không dội API
const WEATHER_MIN_W = 3;                     // cỡ mặc định 3x1 (đủ 3 cột: nhiệt độ | ngày+TP | minh hoạ)
const WEATHER_CACHE_KEY = 'STREAMDECK_VK02_WEATHER_CACHE';
const weatherCache = new Map();              // "lat,lon" -> { ts, data }

/** Widget "sống" (tự vẽ lại liên tục và có tương tác riêng)? */
function isLiveWidget(el) {
  const t = el.dataset.type;
  return t === 'mini_clock' || t === 'weather_widget';
}

/** Escape ký tự HTML cho nhãn do người dùng nhập (tránh phá markup). */
function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

/** Chuẩn hoá số THỰC trong [min,max] với giá trị mặc định fallback. */
function clampFloat(value, min, max, fallback) {
  const n = parseFloat(String(value).replace(',', '.'));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

/** Icon mặc định theo loại widget khi người dùng để trống ô Biểu tượng. */
function defaultIconForType(type) {
  if (type === 'pomodoro') return "🍅";
  if (type === 'mini_clock') return "🕐";
  if (type === 'weather_widget') return "🌤️";
  if (type === 'todo_list') return "✅";
  return "⏹️";
}

/** Chuẩn hoá skin thời tiết: CHỈ nhận 'flat' (Phẳng), mọi giá trị khác về
   'soft' (Màu dịu — mặc định). Dùng CHUNG cho lúc LƯU (modal) và lúc ĐỌC. */
function normalizeWeatherSkin(value) {
  return value === 'flat' ? 'flat' : 'soft';
}

/** Giờ:phút "HH:MM" của một mốc thời gian (tooltip "cập nhật lúc…"). */
function wxHm(ts) {
  const d = new Date(Number(ts) || Date.now());
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

/** Chuẩn hoá kiểu mặt đồng hồ: CHỈ nhận 'digital' / 'analog' / 'flip'.
   Dữ liệu cũ (thời chỉ có 2 kiểu) hoặc giá trị rác đều quy về 'digital' để ô
   không bị vỡ. Dùng CHUNG cho cả lúc LƯU (modal) lẫn lúc ĐỌC (dataset). */
function normalizeClockFace(value) {
  return (value === 'analog' || value === 'flip') ? value : 'digital';
}

/** Đọc cấu hình đồng hồ: ưu tiên dataset.cfg, fallback target "face,tz". */
function parseClockCfg(el) {
  let raw = {};
  try { raw = JSON.parse(el.dataset.cfg || '{}') || {}; } catch (_) { raw = {}; }
  const parts = String(el.dataset.target || '').split(',');
  const face = normalizeClockFace(raw.face || parts[0] || CLOCK_DEFAULT.face);
  const tz = clampFloat(raw.tz !== undefined ? raw.tz : parts[1], -12, 14, CLOCK_DEFAULT.tz);
  const label = (typeof raw.label === 'string' && raw.label.trim())
    ? raw.label.trim()
    : ((parts[2] || '').trim());
  return { face, tz, label: label.toUpperCase() };
}

/** Đọc cấu hình thời tiết: ưu tiên dataset.cfg, fallback target "lat,lon".
 *  cfg = { lat, lon, city, skin, apiKey } — apiKey chỉ là chỗ dành sẵn cho
 *  provider cần khoá (Open-Meteo hiện KHÔNG cần, để trống là bình thường). */
function parseWeatherCfg(el) {
  let raw = {};
  try { raw = JSON.parse(el.dataset.cfg || '{}') || {}; } catch (_) { raw = {}; }
  const parts = String(el.dataset.target || '').split(',');
  const lat = clampFloat(raw.lat !== undefined ? raw.lat : parts[0], -90, 90, WEATHER_DEFAULT.lat);
  const lon = clampFloat(raw.lon !== undefined ? raw.lon : parts[1], -180, 180, WEATHER_DEFAULT.lon);
  const city = (typeof raw.city === 'string' && raw.city.trim())
    ? raw.city.trim()
    : WEATHER_DEFAULT.city;
  const skin = normalizeWeatherSkin(raw.skin);
  const apiKey = (typeof raw.apiKey === 'string') ? raw.apiKey.trim() : '';
  return { lat, lon, city, skin, apiKey };
}

/** Nhãn múi giờ "UTC+7" / "UTC+5:30" (dùng khi người dùng để trống nhãn). */
function clockZoneLabel(tz) {
  const sign = tz < 0 ? '-' : '+';
  const abs = Math.abs(tz);
  const h = Math.floor(abs);
  const m = Math.round((abs - h) * 60);
  return `UTC${sign}${h}${m ? ':' + String(m).padStart(2, '0') : ''}`;
}

/** Thời điểm hiện tại ở một múi giờ bất kỳ (offset giờ so với UTC). */
function nowInZone(tzHours) {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utcMs + tzHours * 3600000);
}

/* --- ĐỒNG HỒ: dựng mặt số + cập nhật kim --- */

/** 60 vạch phút + 12 vạch giờ của mặt Analog (toạ độ SVG 0..100, tâm 50,50). */
function clockTickMarkup() {
  const out = [];
  for (let i = 0; i < 60; i++) {
    const major = i % 5 === 0;      // vạch giờ (dài hơn)
    const quarter = i % 15 === 0;   // 12h / 3h / 6h / 9h (đậm + neon)
    const r1 = quarter ? 38.6 : (major ? 40.4 : 42.2);
    const cls = 'clock-tick' + (quarter ? ' is-quarter' : (major ? ' is-major' : ''));
    out.push(`<line class="${cls}" x1="50" y1="${(50 - 43.6).toFixed(2)}" x2="50" y2="${(50 - r1).toFixed(2)}" transform="rotate(${i * 6} 50 50)"></line>`);
  }
  return out.join('');
}

/** 4 số 12/3/6/9 của mặt số (bán kính 31 -> nằm trong đường kim quét). */
function clockNumeralMarkup() {
  const at = (txt, x, y) => `<text class="clock-num" x="${x}" y="${y}">${txt}</text>`;
  return at('12', 50, 19) + at('3', 81, 50) + at('6', 50, 81) + at('9', 19, 50);
}

/** Markup mặt đồng hồ Analog (mặt số watch-face, xoay kim bằng biến CSS --angle). */
function clockAnalogMarkup(label) {
  return `
      <div class="clock-unit keycap-clock-analog" data-face="analog">
        <div class="clock-bezel">
          <svg class="clock-face" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
            <defs>
              <radialGradient id="clockDialGrad" cx="50%" cy="34%" r="74%">
                <stop offset="0%" stop-color="#141c2e"></stop>
                <stop offset="62%" stop-color="#0a0f1c"></stop>
                <stop offset="100%" stop-color="#04060b"></stop>
              </radialGradient>
              <linearGradient id="clockRimGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="rgba(255,255,255,0.30)"></stop>
                <stop offset="55%" stop-color="rgba(0,229,255,0.22)"></stop>
                <stop offset="100%" stop-color="rgba(255,255,255,0.05)"></stop>
              </linearGradient>
              <radialGradient id="clockGlareGrad" cx="30%" cy="22%" r="60%">
                <stop offset="0%" stop-color="rgba(255,255,255,0.13)"></stop>
                <stop offset="100%" stop-color="rgba(255,255,255,0)"></stop>
              </radialGradient>
            </defs>
            <circle class="clock-rim" cx="50" cy="50" r="47.4"></circle>
            <circle class="clock-dial" cx="50" cy="50" r="43.6"></circle>
            <circle class="clock-glare" cx="50" cy="50" r="43.6"></circle>
            ${clockTickMarkup()}
            ${clockNumeralMarkup()}
            <circle class="clock-arc-track" cx="50" cy="50" r="45.6" transform="rotate(-90 50 50)"></circle>
            <circle class="clock-arc" cx="50" cy="50" r="45.6" transform="rotate(-90 50 50)"></circle>
            <polygon class="clock-hand hand-hour" points="50,22.6 51.9,52.2 50,55.2 48.1,52.2"></polygon>
            <polygon class="clock-hand hand-minute" points="50,9.4 51.5,52 50,55.6 48.5,52"></polygon>
            <g class="clock-hand hand-second">
              <line x1="50" y1="57.8" x2="50" y2="8.6"></line>
              <circle cx="50" cy="57.8" r="1.7"></circle>
            </g>
            <text class="clock-date-mini" x="50" y="68.6">--/--</text>
            <circle class="clock-center-cap" cx="50" cy="50" r="3.4"></circle>
            <circle class="clock-center-dot" cx="50" cy="50" r="1.3"></circle>
          </svg>
          <span class="clock-label wx-sr">${escapeHtml(label)}</span>
        </div>
      </div>
    `;
}

/** Markup mặt đồng hồ Digital: ngày + chip giây + số giờ hero + thanh quét giây. */
function clockDigitalMarkup(label) {
  return `
      <div class="clock-unit keycap-clock-digital" data-face="digital">
        <div class="clock-top">
          <span class="clock-date">--/--</span>
          <span class="clock-secs-chip"><i class="clock-pulse"></i><span class="clock-secs">--</span></span>
        </div>
        <div class="clock-hero"><span class="clock-time">----</span></div>
        <div class="clock-bar"><span class="clock-bar-fill"></span></div>
        <span class="clock-label wx-sr">${escapeHtml(label)}</span>
      </div>
    `;
}

/** Markup mặt đồng hồ THẺ LẬT (flip) — MẶT 24 GIỜ, KHÔNG nhãn AM/PM.
   - .flip-row  : 4 tấm (HH + MM) + dấu hai chấm ở giữa (2 chấm tròn, không chữ).
   - mỗi tấm    : 2 nửa TĨNH (.flip-half) + 2 LÁ LẬT (.flip-fold). Lá trên lật
                  xuống rồi lá dưới đáp xuống -> nửa dưới tĩnh nhận số mới.
   - Số khởi tạo 0: 4 tấm x 4 lớp = 16 chữ số, JS chỉ ghi lại qua setFlipCard(). */
function clockFlipMarkup(label) {
  const card = (d) => {
    const digit = /^\d$/.test(String(d)) ? String(d) : '0';
    return `
          <div class="flip-card" data-digit="${digit}">
            <div class="flip-half flip-top"><span class="flip-digit">${digit}</span></div>
            <div class="flip-half flip-bottom"><span class="flip-digit">${digit}</span></div>
            <div class="flip-fold flip-fold-top"><span class="flip-digit">${digit}</span></div>
            <div class="flip-fold flip-fold-bottom"><span class="flip-digit">${digit}</span></div>
          </div>`;
  };
  return `
      <div class="clock-unit keycap-clock-flip" data-face="flip">
        <div class="flip-row">${card('0')}${card('0')}${card('0')}${card('0')}</div>
        <span class="clock-label wx-sr">${escapeHtml(label)}</span>
      </div>
    `;
}

/** Lật MỘT tấm thẻ theo số mới: nửa TRÊN ăn số mới ngay, 2 lá lật chạy 2 nhịp,
   nửa DƯỚI giữ số CŨ cho tới khi lá dưới đáp xuống (listener animationend ở
   setupClockWidget). Số CŨ đọc từ card.dataset.digit nên không cần biến ngoài. */
function setFlipCard(card, next) {
  if (!card || next === undefined) return;
  const normalized = /^\d$/.test(String(next)) ? String(next) : '0';
  const prev = card.dataset.digit || '';
  if (prev === normalized) return;                 // không đổi -> không lật
  card.dataset.digit = normalized;
  const top = card.querySelector('.flip-top > .flip-digit');
  const foldTop = card.querySelector('.flip-fold-top > .flip-digit');
  const foldBottom = card.querySelector('.flip-fold-bottom > .flip-digit');
  const bottom = card.querySelector('.flip-bottom > .flip-digit');
  if (top) top.textContent = normalized;           // nửa trên: số mới hiện ngay
  if (foldBottom) foldBottom.textContent = normalized;
  if (!prev) {                               // lần vẽ đầu: đặt số, KHÔNG lật
    if (foldTop) foldTop.textContent = normalized;
    if (bottom) bottom.textContent = normalized;
    return;
  }
  if (foldTop) foldTop.textContent = prev;   // lá trên lật xuống: còn số CŨ
  if (bottom) bottom.textContent = prev;     // nửa dưới chờ lá dưới đáp xuống
  card.classList.remove('is-flipping');
  void card.offsetWidth;                     // ép reflow -> animation chạy lại
  card.classList.add('is-flipping');
}

/** Ghi góc xoay vào biến CSS --angle của một kim (CSS tự gọi rotate). */
function setClockHand(hand, deg) {
  if (hand) hand.style.setProperty('--angle', deg.toFixed(2) + 'deg');
}

/** Thứ trong tuần kiểu Việt Nam (CN, T2..T7). */
const CLOCK_WEEKDAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const CLOCK_ARC_LEN = 2 * Math.PI * 45.6;   // chu vi cung giây (bán kính 45.6)

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

/** Nhãn ngày ngắn góc trên "T5, 08/10" (thứ, ngày/tháng) theo múi giờ đang xem.
   KHÔNG kèm tên quận/huyện — ô chỉ còn số + ngày, không còn chữ trang trí. */
function clockDateShort(now) {
  const wd = CLOCK_WEEKDAY[now.getDay()] || '';
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  return `${wd}, ${dd}/${mm}`;
}

/** Vẽ lại 1 phím đồng hồ: chỉ sửa DOM, không đụng tới GridStack. */
function updateClockWidget(el) {
  const unit = el.querySelector('.clock-unit');
  if (!unit) return;
  const cfg = parseClockCfg(el);
  const now = nowInZone(cfg.tz);
  applyWidgetTier(el, unit);

  const labelEl = unit.querySelector('.clock-label');
  const labelText = cfg.label || clockZoneLabel(cfg.tz);
  if (labelEl && labelEl.textContent !== labelText) labelEl.textContent = labelText;
  // Nhãn đầy đủ (thành phố + múi giờ) đặt ở tooltip — không chiếm diện tích ô.
  const titleText = cfg.label ? `${cfg.label} · ${clockZoneLabel(cfg.tz)}` : labelText;
  if (unit.title !== titleText) unit.title = titleText;

  // Số ms kể từ đầu ngày + tỉ lệ đã trôi qua của phút hiện tại: dùng để kim và
  // thanh quét giây chạy LIÊN TỤC (không giật/không lùi ở mốc 60 giây).
  const ms = ((now.getHours() * 3600) + (now.getMinutes() * 60) + now.getSeconds()) * 1000
    + now.getMilliseconds();
  const minuteFrac = (now.getSeconds() * 1000 + now.getMilliseconds()) / 60000;
  const dateText = clockDateShort(now);

  if (cfg.face === 'analog') {
    // Góc tính từ ĐẦU NGÀY nên luôn tăng đều -> kim không "quay ngược" khi
    // kim giây vượt mốc 12 (khác cách tính góc 0..360 thông thường).
    setClockHand(unit.querySelector('.hand-second'), (ms / 1000) * 6);     // 6°/giây
    setClockHand(unit.querySelector('.hand-minute'), (ms / 60000) * 6);   // 6°/phút
    setClockHand(unit.querySelector('.hand-hour'), (ms / 3600000) * 30);  // 30°/giờ
    const arc = unit.querySelector('.clock-arc');
    if (arc) arc.style.setProperty('--sec-offset', (CLOCK_ARC_LEN * (1 - minuteFrac)).toFixed(2));
    const dateMini = unit.querySelector('.clock-date-mini');
    if (dateMini && dateMini.textContent !== dateText) dateMini.textContent = dateText;
    return;
  }

  if (cfg.face === 'flip') {
    // Mặt THẺ LẬT: 4 tấm lật chạy theo chuỗi HH+MM của MẶT 24 GIỜ (0h..23h).
    const digits = String(now.getHours()).padStart(2, '0')
      + String(now.getMinutes()).padStart(2, '0');
    unit.querySelectorAll('.flip-card').forEach((card, i) => setFlipCard(card, digits[i]));
    return;
  }

  const timeEl = unit.querySelector('.clock-time');
  const timeText = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  if (timeEl && timeEl.textContent !== timeText) timeEl.textContent = timeText;

  const secEl = unit.querySelector('.clock-secs');
  const secText = String(now.getSeconds()).padStart(2, '0');
  if (secEl && secEl.textContent !== secText) secEl.textContent = secText;

  const dateEl = unit.querySelector('.clock-date');
  if (dateEl && dateEl.textContent !== dateText) dateEl.textContent = dateText;

  const barEl = unit.querySelector('.clock-bar-fill');
  if (barEl) barEl.style.width = (minuteFrac * 100).toFixed(2) + '%';
}

/** Gắn tương tác cho phím đồng hồ: chạm chỉ "lún phím", không gọi hành động. */
function setupClockWidget(el) {
  if (el.__clockWired) return;      // đã gắn (tránh gắn trùng khi render lại)
  el.__clockWired = true;
  const content = keyContent(el);
  content.addEventListener('pointerdown', (e) => {
    if (isEditMode || e.button) return;
    pressFeedback(el);
  });
  content.addEventListener('pointerup', () => releaseFeedback(el));
  content.addEventListener('pointercancel', () => releaseFeedback(el));
  content.addEventListener('pointerleave', () => releaseFeedback(el));
  // Mặt THẺ LẬT: chỉ khi lá dưới ĐÁP XUỐNG (animationend của .flip-fold-bottom)
  // nửa tĩnh phía dưới mới nhận số mới -> đúng cảm giác "thẻ lật" thật.
  content.addEventListener('animationend', (e) => {
    if (!e.target.classList || !e.target.classList.contains('flip-fold-bottom')) return;
    const card = e.target.closest('.flip-card');
    if (!card) return;
    const bottom = card.querySelector('.flip-bottom > .flip-digit');
    if (bottom) bottom.textContent = card.dataset.digit || bottom.textContent;
    card.classList.remove('is-flipping');
  });
  // Bật transition SAU khung hình đầu để kim/thanh quét không "chạy khởi động".
  requestAnimationFrame(() => {
    const unit = el.querySelector('.clock-unit');
    if (unit) unit.classList.add('is-animating');
  });
}

/** Vòng tick: cập nhật mọi phím đồng hồ theo kiểu mặt đang hiển thị. */
function updateClockWidgets(face) {
  document.querySelectorAll('.grid-stack-item[data-type="mini_clock"]').forEach((el) => {
    if (parseClockCfg(el).face !== face) return;
    updateClockWidget(el);
  });
}

const LIVE_WIDGET_TICK_MS = 100;
const clockSchedulerState = {
  lastDigital: 0,
  lastFlip: 0,
  lastAnalog: 0,
};

function tickLiveWidgets() {
  const now = Date.now();

  if (now - clockSchedulerState.lastDigital >= CLOCK_TICK_DIGITAL_MS) {
    clockSchedulerState.lastDigital = now;
    updateClockWidgets('digital');
  }

  if (now - clockSchedulerState.lastFlip >= CLOCK_TICK_FLIP_MS) {
    clockSchedulerState.lastFlip = now;
    updateClockWidgets('flip');
  }

  if (now - clockSchedulerState.lastAnalog >= CLOCK_TICK_ANALOG_MS) {
    clockSchedulerState.lastAnalog = now;
    updateClockWidgets('analog');
  }
}

setInterval(tickLiveWidgets, LIVE_WIDGET_TICK_MS);

/* --- THỜI TIẾT: icon vector theo mã WMO + gọi Rust Open-Meteo --- */

/** Nhóm icon vector tương ứng mã thời tiết WMO (0-99). */
function weatherIconGroup(code) {
  if (code === 0) return 'sun';
  if (code === 1) return 'partly';
  if (code === 2 || code === 3) return 'cloud';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code === 95 || code === 96 || code === 99) return 'storm';
  return 'cloud';
}

/** Mô tả tiếng Việt dự phòng khi backend không gửi kèm nhãn `condition`. */
function wmoConditionVi(code) {
  if (code === 0) return 'Trời quang';
  if (code === 1) return 'Ít mây';
  if (code === 2) return 'Có mây';
  if (code === 3) return 'Nhiều mây';
  if (code === 45 || code === 48) return 'Sương mù';
  if (code >= 51 && code <= 57) return 'Mưa phùn';
  if (code >= 61 && code <= 67) return 'Mưa';
  if (code >= 71 && code <= 77) return 'Tuyết';
  if (code >= 80 && code <= 82) return 'Mưa rào';
  if (code === 85 || code === 86) return 'Mưa tuyết';
  if (code === 95) return 'Dông';
  if (code === 96 || code === 99) return 'Dông kèm mưa đá';
  return 'Không xác định';
}

function sentenceCaseVi(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const lower = raw.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/* Đường bao đám mây dùng chung cho các icon (viewBox 0 0 32 32). */
const WX_CLOUD_PATH = 'M9.6 20.6h12.1a5 5 0 0 0 .6-9.95 6.6 6.6 0 0 0-12.5-1.2 4.7 4.7 0 0 0-.2 11.15z';

/* Lưỡi liềm mặt trăng (horns hướng trái) — bbox x 11.85..24.8, y 7.2..24.8. */
const WX_MOON_PATH = 'M16 7.2a8.8 8.8 0 1 1 0 17.6 11.4 11.4 0 0 0 0-17.6z';

/** Icon thời tiết vector (SVG inline) theo mã WMO — gradient MỀM + tối đa 2 lớp
 *  động vi mô. Định nghĩa <linearGradient> nằm ngay trong <svg> (id kèm nhóm +
 *  ngày/đêm nên nhiều ô trên deck không đụng id nhau); mọi lớp động đều gắn
 *  class .wx-anim để CSS tắt khi prefers-reduced-motion HOẶC khi deck đang rảnh.
 *  Ban đêm vẽ mặt trăng + sao thay cho mặt trời. */
function weatherIconSvg(code, isDay = true) {
  const group = weatherIconGroup(code);
  const night = !isDay;
  /* Bảng màu gradient mềm (from -> to): "body" = mặt trời/trăng/tia chớp,
     "cloud" = khối mây, "extra" = hạt mưa/tuyết/sao/dải sương. */
  const palBody = night ? ['#fff4d6', '#f0cf86'] : ['#ffe6a0', '#ffa733'];
  const palCloud = night ? ['#8fa2bd', '#54677f'] : ['#eaf2fb', '#a7bcd6'];
  const palExtra = night ? ['#fff8e3', '#e4d29a'] : ['#dcf0ff', '#7fb6e6'];
  /* id gradient KÈM nhóm + ngày/đêm -> nhiều ô thời tiết trên cùng deck không
     đụng id của nhau (mỗi icon mang định nghĩa gradient riêng, tự đủ). */
  const gid = (part) => `wxg-${group}-${isDay ? 'd' : 'n'}-${part}`;
  const url = (part) => `url(#${gid(part)})`;
  const grad = (part, from, to) => `<linearGradient id="${gid(part)}" x1="0.1" y1="0" x2="0.9" y2="1">`
    + `<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient>`;
  const defs = `<defs>${grad('body', palBody[0], palBody[1])}`
    + `${grad('cloud', palCloud[0], palCloud[1])}`
    + `${grad('extra', palExtra[0], palExtra[1])}</defs>`;

  const rays = [];
  for (let i = 0; i < 8; i++) {
    const a = (i * 45) * Math.PI / 180;
    rays.push(`<line class="wx-ray" x1="${(16 + Math.cos(a) * 9.6).toFixed(1)}" y1="${(16 + Math.sin(a) * 9.6).toFixed(1)}" x2="${(16 + Math.cos(a) * 12.6).toFixed(1)}" y2="${(16 + Math.sin(a) * 12.6).toFixed(1)}"></line>`);
  }
  /* NẮNG: 2 lớp động — quầng sáng "thở" + 8 tia quay chậm 20s/vòng. */
  const sunFull = `<circle class="wx-halo wx-anim wx-anim-breathe" cx="16" cy="16" r="10.8" fill="${url('body')}"></circle>`
    + `<g class="wx-anim wx-anim-spin" stroke="${url('body')}" stroke-width="1.7" stroke-linecap="round">${rays.join('')}</g>`
    + `<circle class="wx-sun" cx="16" cy="16" r="6.4" fill="${url('body')}"></circle>`;
  const sunCorner = `<circle class="wx-sun" cx="10.6" cy="9.6" r="4.4" fill="${url('body')}"></circle>`;
  // Mặt trăng + sao cho ban đêm (lưỡi liềm dịch -2.3 để cân giữa khung 32x32).
  const moonShape = `<path class="wx-moon" d="${WX_MOON_PATH}" fill="${url('body')}"></path>`;
  const moonFull = `<g transform="translate(-2.3 0)">${moonShape}</g>\n        <g class="wx-anim wx-anim-twinkle">\n        <circle class="wx-star" cx="25" cy="8.6" r="1.1" fill="${url('extra')}"></circle>\n        <circle class="wx-star" cx="21.4" cy="4.8" r="0.7" fill="${url('extra')}"></circle></g>`;
  const moonCorner = `<g transform="translate(1 1.2) scale(0.52)">${moonShape}</g>`;
  const cloudFull = `<path class="wx-cloud" d="${WX_CLOUD_PATH}" fill="${url('cloud')}"></path>`;
  const cloudSmall = `<path class="wx-cloud" d="${WX_CLOUD_PATH}" transform="translate(3.4 3) scale(0.86)" fill="${url('cloud')}"></path>`;
  /* Mây trôi ngang / hạt rơi / bông tuyết dập dềnh: mỗi cụm là 1 LỚP động. */
  const drift = (inner) => `<g class="wx-anim wx-anim-drift">${inner}</g>`;
  const fall = (inner) => `<g class="wx-anim wx-anim-fall">${inner}</g>`;
  const sway = (inner) => `<g class="wx-anim wx-anim-sway">${inner}</g>`;
  /* Giọt mưa là HÌNH GIỌT có gradient (không còn gạch mảnh đơn sắc). */
  const drop = (x, y, s) => `<path class="wx-drop" transform="translate(${x} ${y}) scale(${s})" d="M0 0c1.15 1.5 1.95 2.5 1.95 3.4a1.95 1.95 0 0 1-3.9 0c0-.9.8-1.9 1.95-3.4z" fill="${url('extra')}"></path>`;
  const dropsLight = drop(9.2, 22.2, 0.86) + drop(14.2, 22.2, 0.86) + drop(19.2, 22.2, 0.86);
  const dropsHeavy = drop(8.8, 21.4, 1.06) + drop(13.8, 21.4, 1.06) + drop(18.8, 21.4, 1.06);
  const flakes = `<circle class="wx-flake" cx="12" cy="24.8" r="1.3" fill="${url('extra')}"></circle>\n        <circle class="wx-flake" cx="17" cy="26.6" r="1.3" fill="${url('extra')}"></circle>\n        <circle class="wx-flake" cx="22" cy="24.8" r="1.3" fill="${url('extra')}"></circle>`;
  const haze = `<line class="wx-haze" x1="8.5" y1="23" x2="23.5" y2="23"></line>\n        <line class="wx-haze" x1="10.5" y1="26.4" x2="21.5" y2="26.4"></line>`;
  const bolt = `<polygon class="wx-bolt wx-anim wx-anim-blink" points="17.8,21.4 13.2,27.8 16.4,27.8 14.6,32 20.6,24.4 17.2,24.4 19.4,21.4" fill="${url('body')}"></polygon>`;

  let inner = drift(cloudFull);
  if (group === 'sun') inner = isDay ? sunFull : moonFull;
  else if (group === 'partly') inner = (isDay ? sunCorner : moonCorner) + drift(cloudFull);
  else if (group === 'fog') inner = drift(cloudSmall)
    + `<g class="wx-anim wx-anim-drift" stroke="${url('extra')}" stroke-width="1.8" stroke-linecap="round">${haze}</g>`;
  else if (group === 'drizzle') inner = cloudSmall + fall(dropsLight);
  else if (group === 'rain') inner = cloudSmall + fall(dropsHeavy);
  else if (group === 'snow') inner = cloudSmall + sway(flakes);
  else if (group === 'storm') inner = cloudSmall + fall(dropsLight) + bolt;

  return `<svg class="wx-svg" viewBox="0 0 32 32" preserveAspectRatio="xMidYMid meet">${defs}${inner}</svg>`;
}

/** Số an toàn cho dữ liệu thời tiết (tránh "NaN" khi backend thiếu trường). */
function wxNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/* --- Glyph vector nhỏ (viewBox 12x12) cho chỉ số + ghim định vị + cảnh báo ---
   Tất cả dùng `currentColor` nên chỉ cần đổi màu khối chứa là glyph đổi theo. */
const WX_G_DROP = '<path d="M6 1.15c2.45 2.8 4.05 4.95 4.05 6.95a4.05 4.05 0 1 1-8.1 0C1.95 6.1 3.55 3.95 6 1.15z" fill="currentColor"/>';
const WX_G_THERMO = '<path d="M6 1.2a1.55 1.55 0 0 0-1.55 1.55v4.28a2.75 2.75 0 1 0 3.1 0V2.75A1.55 1.55 0 0 0 6 1.2z" fill="currentColor"/>';
const WX_G_WIND = '<g fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M1.4 4.2h6.2a1.5 1.5 0 1 0 0-3"/><path d="M1.4 6.4h4.2"/><path d="M1.4 8.4h5.4a1.35 1.35 0 1 1 0 2.7"/></g>';
const WX_G_PLACE = '<path fill-rule="evenodd" d="M6 1.1A3.75 3.75 0 0 0 2.25 4.85c0 2.8 3.35 5.8 3.65 6.05l.1.09.1-.09c.3-.25 3.65-3.25 3.65-6.05A3.75 3.75 0 0 0 6 1.1zm0 5.05a1.35 1.35 0 1 1 0-2.7 1.35 1.35 0 0 1 0 2.7z" fill="currentColor"/>';
const WX_G_WARN = '<g fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><path d="M6 1.6 11.1 10.4H.9z"/><path d="M6 4.5v3.1M6 9.1v.6"/></g>';
/* Glyph badge "dữ liệu cũ": đồng hồ + mũi tên quay lại. Dùng viewBox 24x24 (khác
   bộ glyph 12x12 của 4 móc chỉ số) để không lẫn với hàng chỉ số phụ. */
const WX_G_STALE = '<path d="M12 3.1a8.9 8.9 0 1 0 8.9 8.9h-2.3A6.6 6.6 0 1 1 12 5.4z" fill="currentColor"/><path d="M11.1 7.3a.95.95 0 0 1 .95.95v3.6l2.3 1.5a.95.95 0 1 1-1.04 1.6l-2.7-1.75a.95.95 0 0 1-.44-.8V8.25a.95.95 0 0 1 .93-.95z" fill="currentColor"/>';

/** Bọc 1 glyph 12x12 thành <svg> dùng chung: pin | drop | thermo | wind | warn. */
function wxGlyph(name, cls = '') {
  const body = ({ drop: WX_G_DROP, thermo: WX_G_THERMO, wind: WX_G_WIND,
    place: WX_G_PLACE, warn: WX_G_WARN })[name] || WX_G_WARN;
  return `<svg class="wx-glyph ${cls}" viewBox="0 0 12 12" aria-hidden="true">${body}</svg>`;
}

/** Markup thân phím Thời tiết — xem `weatherMarkup` bên dưới.
 *  Tên thành phố hiện ở CẢ hai dạng: đầy đủ (ô lớn) và rút gọn (.wc-short).
 *  "TP. HỒ CHÍ MINH" -> "TP.HCM" cho ô ngang 3x1 / 2x1. */
function cityShort(city) {
  const c = String(city || '').trim();
  if (/^(tp\.?|thành phố)?\s*(hồ chí minh|ho chi minh)$/i.test(c)) return 'TP.HCM';
  const bare = c.replace(/^(tp\.?\s*|thành phố\s+)/i, '');
  return c.length > 12 && bare ? bare : c;
}
function cityLabelHtml(city) {
  return `<span class="wc-full">${escapeHtml(city)}</span><span class="wc-short">${escapeHtml(cityShort(city))}</span>`;
}
function setCityLabel(cityEl, cityText) {
  if (!cityEl || !cityText || cityEl.dataset.city === cityText) return;
  cityEl.dataset.city = cityText;
  cityEl.innerHTML = cityLabelHtml(cityText);
}

/** Markup thân phím Thời tiết — BỐ CỤC 3x1 (mặc định) co theo cỡ ô bằng CSS:
 *  - .wx-body chia cột: [trạng thái + nhiệt độ lớn] | vạch ngăn | [ngày + thành phố]
 *    | [khối minh hoạ SVG tràn mép phải];
 *  - 2x1  -> bỏ vạch ngăn, ngày + thành phố gom thành 1 dòng nhỏ dưới số nhiệt độ;
 *  - 2x2  -> minh hoạ lớn phía trên, dưới là nhiệt độ + text + chỉ số gió/độ ẩm;
 *  - 1x1  -> chỉ minh hoạ thu nhỏ + số nhiệt độ;
 *  - Chỉ số phụ chỉ là SỐ (đơn vị nằm ở tooltip), màu chữ tự đổi theo data-tint;
 *  - .wx-badge = badge "DỮ LIỆU CŨ" (chỉ hiện khi mất mạng + cache > 30 phút). */
function weatherMarkup(city) {
  const safeCity = escapeHtml(city);
  const today = clockDateShort(new Date());
  return `
      <div class="weather-unit keycap-weather" data-tint="cloud" data-night="0" data-skin="soft"
           data-city="${safeCity}" title="${safeCity}">
        <div class="wx-body">
          <div class="weather-hero">
            <span class="weather-cond">Đang tải…</span>
            <span class="weather-temp">
              <span class="weather-value">--</span><span class="weather-degree">°C</span>
            </span>
          </div>
          <span class="wx-divider"></span>
          <div class="wx-meta">
            <span class="weather-date">${today}</span>
            <span class="weather-place">${wxGlyph('place', 'wx-glyph-pin')}<span class="weather-city" data-city="${safeCity}">${cityLabelHtml(city)}</span></span>
            <div class="weather-stats">
              <span class="weather-stat" data-stat="hum">${wxGlyph('drop')}<b class="weather-hum">--</b></span>
              <span class="weather-stat" data-stat="feels">${wxGlyph('thermo')}<b class="weather-feels">--</b></span>
              <span class="weather-stat" data-stat="wind">${wxGlyph('wind')}<b class="weather-wind">--</b></span>
            </div>
          </div>
          <div class="wx-art"><span class="weather-icon">${weatherIconSvg(0, true)}</span></div>
        </div>
        <span class="wx-badge" hidden>
          <svg class="wx-badge-icon" viewBox="0 0 24 24" aria-hidden="true">${WX_G_STALE}</svg>
          <b class="wx-badge-text"></b>
        </span>
      </div>
    `;
}

/* --- THỜI TIẾT: nạp dữ liệu + cache + tương tác --- */

/** Ghi dữ liệu thời tiết vào DOM của phím (không đụng layout GridStack).
 *  ts = mốc thời gian của dữ liệu (để biết "cập nhật lúc…" và tuổi dữ liệu);
 *  offline = lần gọi gần nhất vừa MẤT MẠNG -> dữ liệu cache quá 30 phút sẽ hiện
 *  badge "DỮ LIỆU CŨ" kèm tooltip giờ cập nhật. */
function applyWeatherToUnit(unit, data, city, ts, offline = false) {
  const code = Number(data.weather_code) || 0;
  const temp = wxNum(data.temp, 0);
  const isDay = data.is_day === undefined ? true : !!Number(data.is_day);
  const condText = sentenceCaseVi(String(data.condition || wmoConditionVi(code)));
  const hum = Math.round(wxNum(data.humidity, 0));
  const feels = Math.round(wxNum(data.feels_like, temp));
  const wind = Math.round(wxNum(data.wind, 0));

  const iconEl = unit.querySelector('.weather-icon');
  if (iconEl) iconEl.innerHTML = weatherIconSvg(code, isDay);

  const valueEl = unit.querySelector('.weather-value');
  if (valueEl) valueEl.textContent = String(Math.round(temp));

  // 3 chỉ số phụ (chỉ hiện ở ô >= 2x2): CHỈ số, đơn vị đặt ở tooltip.
  const humEl = unit.querySelector('.weather-hum');
  if (humEl) humEl.textContent = `${hum}%`;
  const feelsEl = unit.querySelector('.weather-feels');
  if (feelsEl) feelsEl.textContent = `${feels}°`;
  const windEl = unit.querySelector('.weather-wind');
  if (windEl) windEl.textContent = String(wind);

  const cityText = city || unit.dataset.city || '';
  const cityEl = unit.querySelector('.weather-city');
  setCityLabel(cityEl, cityText);
  if (cityText) unit.dataset.city = cityText;

  const at = Number(ts) || Date.now();

  // Chữ TRÊN Ô (đọc được trong < 200ms): trạng thái trời 13px + ngày "Tx, dd/mm".
  const condEl = unit.querySelector('.weather-cond');
  if (condEl) condEl.textContent = condText;
  const dateEl = unit.querySelector('.weather-date');
  if (dateEl) dateEl.textContent = clockDateShort(new Date(at));

  // Đơn vị + giờ cập nhật gom vào tooltip (không chiếm diện tích ô).
  unit.title = [cityText, condText, `${Math.round(temp)}°C`,
    `ướt ${hum}%`, `cảm nhận ${feels}°C`, `gió ${wind} km/h`, `cập nhật ${wxHm(at)}`]
    .filter(Boolean).join(' · ');

  // Đổi tông màu "màn hình" theo nhóm thời tiết + ngày/đêm (CSS [data-tint]).
  unit.dataset.tint = weatherIconGroup(code);
  unit.dataset.night = isDay ? '0' : '1';
  unit.dataset.updated = String(at);
  unit.classList.remove('is-error');
  // Badge "DỮ LIỆU CŨ": CHỈ khi mất mạng mà dữ liệu đã cũ hơn 30 phút.
  updateWxBadge(unit, !!offline && (Date.now() - at) > WEATHER_STALE_MS, at);
}

/** Bật/tắt badge "DỮ LIỆU CŨ" + tooltip giờ cập nhật cũ. */
function updateWxBadge(unit, stale, ts) {
  const badge = unit.querySelector('.wx-badge');
  if (!badge) return;
  badge.hidden = !stale;
  if (unit.dataset.stale !== (stale ? '1' : '0')) unit.dataset.stale = stale ? '1' : '0';
  if (!stale) { badge.removeAttribute('title'); return; }
  const textEl = badge.querySelector('.wx-badge-text');
  if (textEl) textEl.textContent = 'DỮ LIỆU CŨ';
  badge.title = `Dữ liệu lúc ${wxHm(ts)} — đã cũ hơn 30 phút (chưa kết nối lại được)`;
}

/** Bật/tắt trạng thái ĐANG TẢI: icon xoay mờ; khi chưa có số nào thì hiện "--°C". */
function setWeatherLoading(unit, on, blank = false) {
  unit.classList.toggle('is-loading', !!on);
  if (on && blank) {
    const valueEl = unit.querySelector('.weather-value');
    if (valueEl) valueEl.textContent = '--';
  }
}

/** Gán skin cho ô thời tiết: 'soft' (Màu dịu — gradient full-bleed) | 'flat' (Phẳng #111317). */
function applyWeatherSkin(unit, skin) {
  const value = normalizeWeatherSkin(skin);
  if (unit.dataset.skin !== value) unit.dataset.skin = value;
}

/* --- Cache LocalStorage (kèm timestamp): "lat,lon" -> { ts, data } ---
   Mục đích: mở lại app là có số ngay (không chờ mạng) và vẫn xem được số cũ khi
   mất mạng (kèm badge cảnh báo khi quá 30 phút). Ghi lỗi (đầy quota / bị chặn)
   thì bỏ qua — cache RAM vẫn dùng bình thường. */
function wxCacheKeyOf(lat, lon) {
  return `${lat.toFixed(3)},${lon.toFixed(3)}`;
}
function wxCacheLoad() {
  try {
    const raw = JSON.parse(localStorage.getItem(WEATHER_CACHE_KEY) || '{}');
    return (raw && typeof raw === 'object') ? raw : {};
  } catch (_) { return {}; }
}
function wxCacheSave(key, entry) {
  try {
    const all = wxCacheLoad();
    all[key] = entry;
    localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(all));
  } catch (err) { console.warn('Không ghi được cache thời tiết:', err); }
}
/** Nạp cache LocalStorage vào RAM lúc khởi động (hiện số cũ TRƯỚC khi gọi mạng). */
function wxCacheHydrate() {
  const all = wxCacheLoad();
  Object.keys(all).forEach((key) => {
    const entry = all[key];
    if (entry && typeof entry.ts === 'number' && entry.data) weatherCache.set(key, entry);
  });
}
/** Bản ghi cache cho 1 toạ độ: ưu tiên RAM (nóng nhất), fallback LocalStorage. */
function wxCacheGet(key) {
  const hot = weatherCache.get(key);
  if (hot) return hot;
  const cold = wxCacheLoad()[key];
  return (cold && typeof cold.ts === 'number' && cold.data) ? cold : null;
}
wxCacheHydrate();   // chạy TRƯỚC lần vẽ widget đầu tiên (xem loadLayout ở cuối file)

/** Trạng thái chờ / lỗi (chưa lấy được dữ liệu thời tiết).
 *  Ô đổi sang tông đỏ + icon cảnh báo; dòng mô tả (.weather-cond) nói rõ lý do. */
function markWeatherPlaceholder(unit, city, message) {
  const iconEl = unit.querySelector('.weather-icon');
  if (iconEl) {
    iconEl.innerHTML = `<svg class="wx-svg wx-svg-warn" viewBox="0 0 12 12" preserveAspectRatio="xMidYMid meet">${WX_G_WARN}</svg>`;
  }
  const valueEl = unit.querySelector('.weather-value');
  if (valueEl) valueEl.textContent = '--';
  ['.weather-hum', '.weather-feels', '.weather-wind'].forEach((sel) => {
    const el = unit.querySelector(sel);
    if (el) el.textContent = '--';
  });
  const condEl = unit.querySelector('.weather-cond');
  if (condEl) condEl.textContent = message;
  const cityText = city || unit.dataset.city || '';
  const cityEl = unit.querySelector('.weather-city');
  setCityLabel(cityEl, cityText);
  if (cityText) unit.dataset.city = cityText;
  unit.title = [cityText, message].filter(Boolean).join(' · ');
  unit.classList.add('is-error');
  unit.dataset.tint = 'error';
  unit.dataset.night = '0';
  updateWxBadge(unit, false, 0);   // trạng thái lỗi đã thay cho badge "cũ"
}

/** Làm mới 1 phím thời tiết (force = bỏ qua cache 15 phút):
 *  1. Hiện NGAY số đã cache (RAM -> LocalStorage) rồi mới gọi mạng -> không nháy;
 *  2. Đang tải: icon xoay mờ (+ "--°C" nếu chưa có số nào để hiện);
 *  3. Mất mạng: giữ số cũ; nếu cache đã quá 30 phút -> badge "DỮ LIỆU CŨ". */
async function updateWeatherWidget(el, force = false) {
  const unit = el.querySelector('.weather-unit');
  if (!unit) return;
  const cfg = parseWeatherCfg(el);
  applyWidgetTier(el, unit);
  applyWeatherSkin(unit, cfg.skin);

  const key = wxCacheKeyOf(cfg.lat, cfg.lon);
  const cached = wxCacheGet(key);
  if (cached) applyWeatherToUnit(unit, cached.data, cfg.city, cached.ts);   // hiện ngay

  if (!force && cached && (Date.now() - cached.ts) < WEATHER_REFRESH_MS) return;
  if (!getTauri()) {   // chạy ngoài Tauri (dev web) -> không có dữ liệu thật
    if (!cached) markWeatherPlaceholder(unit, cfg.city, 'Chưa kết nối');
    return;
  }

  setWeatherLoading(unit, true, !cached);
  try {
    const data = await invokeCmd('get_weather_data', { lat: cfg.lat, lon: cfg.lon });
    if (data && typeof data.temp === 'number') {
      const ts = Date.now();
      weatherCache.set(key, { ts, data });
      wxCacheSave(key, { ts, data });     // giữ số qua lần mở app sau
      applyWeatherToUnit(unit, data, cfg.city, ts);
    } else if (!cached) {
      markWeatherPlaceholder(unit, cfg.city, 'Không có dữ liệu');
    }
  } catch (err) {
    console.warn('get_weather_data lỗi:', err);
    // Còn cache -> vẫn hiển thị số cũ; quá 30 phút thì hiện badge cảnh báo.
    if (cached) applyWeatherToUnit(unit, cached.data, cfg.city, cached.ts, true);
    else markWeatherPlaceholder(unit, cfg.city, 'Lỗi mạng');
  } finally {
    setWeatherLoading(unit, false);
  }
}

/** Gắn tương tác cho phím thời tiết: CHẠM = làm mới ngay, có CHỐNG DỘI 1,2s và
 *  bỏ qua khi đang có request bay (mạng chậm không bị gọi API liên tục). */
function setupWeatherWidget(el) {
  if (el.__weatherWired) return;    // đã gắn (tránh gắn trùng khi render lại)
  el.__weatherWired = true;
  const content = keyContent(el);
  content.addEventListener('pointerdown', (e) => {
    if (isEditMode || e.button) return;
    pressFeedback(el);
  });
  content.addEventListener('pointerup', () => releaseFeedback(el));
  content.addEventListener('pointercancel', () => releaseFeedback(el));
  content.addEventListener('pointerleave', () => releaseFeedback(el));
  content.addEventListener('click', async () => {
    if (isEditMode || gridDragJustHappened) return;
    releaseFeedback(el);
    const now = Date.now();
    if (el.__wxBusy) return;                                        // đang tải
    if (now - (el.__wxTapAt || 0) < WEATHER_TAP_DEBOUNCE_MS) return; // chạm dồn dập
    el.__wxTapAt = now;
    el.__wxBusy = true;
    try { await updateWeatherWidget(el, true); }
    finally { el.__wxBusy = false; }
    flashKeycap(el, !el.querySelector('.weather-unit.is-error'));
  });
}

/* Vòng quét nền 15 phút: làm mới toàn bộ phím thời tiết trên deck. */
setInterval(() => {
  document.querySelectorAll('.grid-stack-item[data-type="weather_widget"]')
    .forEach((el) => updateWeatherWidget(el, true));
}, WEATHER_REFRESH_MS);

/* 7. Lưu layout mỗi khi có thay đổi vị trí/kích thước */
grid.on('change', () => {
  saveCurrentLayout();
});

/* Cờ chống kích hoạt nhầm: bật khi bắt đầu kéo/resize, tắt sau khi kết thúc */
grid.on('dragstart', () => { gridDragJustHappened = true; });
grid.on('resizestart', () => { gridDragJustHappened = true; });
grid.on('dragstop', () => { setTimeout(() => { gridDragJustHappened = false; }, 0); });
grid.on('resizestop', () => {
  setTimeout(() => { gridDragJustHappened = false; }, 0);
  scheduleSliderRefresh();   // fader ngang/dọc + cỡ ô phải khớp hình dạng MỚI
});

/* Đổi cỡ cửa sổ -> mọi ô đổi hình dạng -> cập nhật lại slider */
window.addEventListener('resize', scheduleSliderRefresh);

/* 8. Modal chỉnh sửa phím */
const modal = document.getElementById('editModal');
const inpIcon = document.getElementById('inpIcon');
const selType = document.getElementById('selType');
const inpTarget = document.getElementById('inpTarget');
const grpTarget = document.getElementById('grpTarget');
const grpApp = document.getElementById('grpApp');
const selApp = document.getElementById('selApp');
const btnSave = document.getElementById('btnSave');
const btnDelete = document.getElementById('btnDelete');
const btnCancel = document.getElementById('btnCancel');
const modalHeading = document.getElementById('modalHeading');

const btnPickFile = document.getElementById('btnPickFile');
const filePicker = document.getElementById('filePicker');

const grpPomodoro = document.getElementById('grpPomodoro');
const inpPomodoroWork = document.getElementById('inpPomodoroWork');
const inpPomodoroBreak = document.getElementById('inpPomodoroBreak');

const grpBongo = document.getElementById('grpBongo');
const selBongoSize = document.getElementById('selBongoSize');
const chkBongoKps = document.getElementById('chkBongoKps');

/* Widget Đồng hồ: kiểu mặt + múi giờ + nhãn */
const grpClock = document.getElementById('grpClock');
const selClockFace = document.getElementById('selClockFace');
const inpClockTz = document.getElementById('inpClockTz');
const inpClockLabel = document.getElementById('inpClockLabel');

/* Widget Thời tiết: toạ độ + tên thành phố + skin + API key (dự phòng) */
const grpWeather = document.getElementById('grpWeather');
const inpWeatherLat = document.getElementById('inpWeatherLat');
const inpWeatherLon = document.getElementById('inpWeatherLon');
const inpWeatherCity = document.getElementById('inpWeatherCity');
const selWeatherSkin = document.getElementById('selWeatherSkin');
const inpWeatherKey = document.getElementById('inpWeatherKey');

/* Hiển thị phím: khớp ảnh + nhãn chồng lên icon */
const grpFit = document.getElementById('grpFit');
const selIconFit = document.getElementById('selIconFit');
const inpTitle = document.getElementById('inpTitle');
const selTitlePos = document.getElementById('selTitlePos');
const inpTitleSize = document.getElementById('inpTitleSize');
const chkTitleShadow = document.getElementById('chkTitleShadow');

function readDisplayFromModal() {
  return {
    fit: selIconFit.value,
    title: inpTitle.value,
    titlePos: selTitlePos.value,
    titleSize: inpTitleSize.value,
    titleShadow: chkTitleShadow.checked
  };
}

let currentEditingEl = null;

btnPickFile.addEventListener('click', () => filePicker.click());

/* Icon: picker Lucide/Simple Icons/emoji + tải ảnh chuẩn hoá 1:1 144/288px +
   tự lấy icon app / favicon (xem src/icons.js). */
const iconUI = initIconUI({
  input: inpIcon,
  invoke: invokeCmd,
  renderIcon: (icon, icon2x) => formatIconSource(icon || '⏹️', icon2x),
  getContext: () => ({ type: selType.value, target: inpTarget.value.trim() }),
});

filePicker.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  await iconUI.importFile(file);
});

function syncModalTypeFields() {
  const type = selType.value;
  grpTarget.style.display = (type === 'open_url' || type === 'launch_app') ? 'flex' : 'none';
  grpApp.style.display = (type === 'app_slider') ? 'flex' : 'none';
  grpPomodoro.style.display = (type === 'pomodoro') ? 'flex' : 'none';
  grpClock.style.display = (type === 'mini_clock') ? 'flex' : 'none';
  grpWeather.style.display = (type === 'weather_widget') ? 'flex' : 'none';
  grpBongo.style.display = (type === 'bongo_cat') ? 'flex' : 'none';
  grpFit.style.display = (type === 'open_url' || type === 'launch_app') ? 'flex' : 'none';
  iconUI.syncType(type);
  if (type === 'app_slider') populateAppSelect();
}

/* Nạp danh sách app đang phát âm thanh vào dropdown chọn app */
async function populateAppSelect() {
  await refreshAudioSessions();
  const prev = selApp.value;
  selApp.innerHTML = '';
  if (!audioSessionCache.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '(Không có app nào đang phát âm thanh)';
    selApp.appendChild(opt);
    return;
  }
  audioSessionCache.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.name;
    const label = s.label || s.name;
    opt.textContent = `${label} — ${Math.round((s.volume || 0) * 100)}%`;
    // Tooltip hiển thị tên tiến trình thật (vd "brave.exe") để phân biệt khi
    // nhiều tab cùng nhãn.
    opt.title = s.name;
    selApp.appendChild(opt);
  });
  if (prev && audioSessionCache.some(s => s.name === prev)) selApp.value = prev;
}

selType.addEventListener('change', syncModalTypeFields);

function openEditModal(el = null) {
  // Phím "settings" không chỉnh sửa như phím thường -> mở luôn Cài đặt Deck.
  if (el && el.dataset.type === 'settings') { openSettings(); return; }
  currentEditingEl = el;
  filePicker.value = '';
  if (el) {
    modalHeading.innerText = "Cài Đặt Phím Bấm";
    iconUI.setValue(el.dataset.icon || "", el.dataset.icon2x || "");
    selType.value = el.dataset.type || "open_url";
    inpTarget.value = el.dataset.target || "";
    selIconFit.value = el.dataset.fit === 'cover' ? 'cover' : 'contain';
    inpTitle.value = el.dataset.title || '';
    selTitlePos.value = el.dataset.titlePos || 'bottom';
    inpTitleSize.value = el.dataset.titleSize || '14';
    chkTitleShadow.checked = el.dataset.titleShadow !== '0';
    btnDelete.style.display = "block";
    if ((el.dataset.type || '') === 'pomodoro') {
      const [wm, bm] = parsePomoTarget(el.dataset.target || `${el.dataset.work},${el.dataset.break}`);
      inpPomodoroWork.value = String(wm);
      inpPomodoroBreak.value = String(bm);
    }
    if ((el.dataset.type || '') === 'mini_clock') {
      const clockCfg = parseClockCfg(el);
      selClockFace.value = normalizeClockFace(clockCfg.face);
      inpClockTz.value = String(clockCfg.tz);
      inpClockLabel.value = clockCfg.label || '';
    }
    if ((el.dataset.type || '') === 'weather_widget') {
      const wxCfg = parseWeatherCfg(el);
      inpWeatherLat.value = String(wxCfg.lat);
      inpWeatherLon.value = String(wxCfg.lon);
      inpWeatherCity.value = wxCfg.city;
      if (selWeatherSkin) selWeatherSkin.value = normalizeWeatherSkin(wxCfg.skin);
      if (inpWeatherKey) inpWeatherKey.value = wxCfg.apiKey;
    }
    if ((el.dataset.type || '') === 'bongo_cat') {
      const bongoCfg = parseBongoCfg(el);
      if (selBongoSize) selBongoSize.value = bongoCfg.size;
      if (chkBongoKps) chkBongoKps.checked = bongoCfg.showKps;
    }
  } else {
    modalHeading.innerText = "Tạo Phím Mới";
    iconUI.setValue("⭐", "");
    selType.value = "open_url";
    inpTarget.value = "";
    selIconFit.value = 'contain';
    inpTitle.value = '';
    selTitlePos.value = 'bottom';
    inpTitleSize.value = '14';
    chkTitleShadow.checked = true;
    inpPomodoroWork.value = "25";
    inpPomodoroBreak.value = "5";
    selClockFace.value = CLOCK_DEFAULT.face;
    inpClockTz.value = String(CLOCK_DEFAULT.tz);
    inpClockLabel.value = CLOCK_DEFAULT.label;
    inpWeatherLat.value = String(WEATHER_DEFAULT.lat);
    inpWeatherLon.value = String(WEATHER_DEFAULT.lon);
    inpWeatherCity.value = WEATHER_DEFAULT.city;
    if (selWeatherSkin) selWeatherSkin.value = WEATHER_DEFAULT.skin;
    if (inpWeatherKey) inpWeatherKey.value = '';
    if (selBongoSize) selBongoSize.value = '2x1';
    if (chkBongoKps) chkBongoKps.checked = true;
    btnDelete.style.display = "none";
  }
  syncModalTypeFields();
  if (selType.value === 'app_slider') {
    populateAppSelect().then(() => {
      if (el && el.dataset.target) selApp.value = el.dataset.target;
    });
  }
  modal.classList.add('active');
}

btnCancel.addEventListener('click', () => {
  modal.classList.remove('active');
  currentEditingEl = null;
});

btnSave.addEventListener('click', async () => {
  // Phím app/web chưa chọn icon (còn mặc định) -> tự lấy icon thật / favicon.
  btnSave.disabled = true;
  try { await iconUI.autoFillIfDefault(); } finally { btnSave.disabled = false; }
  const type = selType.value;
  const isPomo = type === 'pomodoro';
  const isClock = type === 'mini_clock';
  const isWeather = type === 'weather_widget';
  const pomoWork = clampInt(inpPomodoroWork ? inpPomodoroWork.value : 25, 1, 180, 25);
  const pomoBreak = clampInt(inpPomodoroBreak ? inpPomodoroBreak.value : 5, 1, 120, 5);

  // Cấu hình widget "sống" lấy từ modal (đã chuẩn hoá biên).
  // 3 kiểu mặt dùng CHUNG normalizeClockFace (giống hệt lúc đọc dataset).
  const clockFace = normalizeClockFace(selClockFace.value);
  // Cỡ tối thiểu theo kiểu mặt: Digital 1x1, Thẻ lật 2x1, Analog 2x2.
  const minW = clockFace === 'digital' ? 1 : 2;
  const minH = clockFace === 'analog' ? 2 : 1;
  const clockTz = clampFloat(inpClockTz ? inpClockTz.value : CLOCK_DEFAULT.tz, -12, 14, CLOCK_DEFAULT.tz);
  const clockLabel = ((inpClockLabel ? inpClockLabel.value : '') || '').trim() || clockZoneLabel(clockTz);
  const weatherLat = clampFloat(inpWeatherLat ? inpWeatherLat.value : WEATHER_DEFAULT.lat, -90, 90, WEATHER_DEFAULT.lat);
  const weatherLon = clampFloat(inpWeatherLon ? inpWeatherLon.value : WEATHER_DEFAULT.lon, -180, 180, WEATHER_DEFAULT.lon);
  const weatherCity = ((inpWeatherCity ? inpWeatherCity.value : '') || '').trim() || WEATHER_DEFAULT.city;
  // Skin: "Màu dịu" (gradient) | "Phẳng" (nền #111317) — chuẩn hoá chung 1 hàm.
  const weatherSkin = normalizeWeatherSkin(selWeatherSkin ? selWeatherSkin.value : WEATHER_DEFAULT.skin);
  // API key: chỗ dành sẵn cho provider cần khoá (Open-Meteo miễn phí, không cần).
  const weatherKey = ((inpWeatherKey ? inpWeatherKey.value : '') || '').trim();
  const bongoSize = normalizeBongoSize((selBongoSize ? selBongoSize.value : '2x1'));
  const bongoShowKps = !!(chkBongoKps ? chkBongoKps.checked : true);
  const display = readDisplayFromModal();   // khớp ảnh + nhãn chồng lên icon

  if (currentEditingEl) {
    currentEditingEl.dataset.icon = inpIcon.value.trim() || defaultIconForType(type);
    if (iconUI.getIcon2x()) currentEditingEl.dataset.icon2x = iconUI.getIcon2x();
    else delete currentEditingEl.dataset.icon2x;
    currentEditingEl.dataset.type = type;
    applyDisplayToEl(currentEditingEl, display);
    if (isPomo) {
      currentEditingEl.dataset.work = String(pomoWork);
      currentEditingEl.dataset.break = String(pomoBreak);
      currentEditingEl.dataset.target = `${pomoWork},${pomoBreak}`;
      // Đổi cấu hình -> khởi tạo lại timer theo thời lượng mới (về Work, dừng).
      currentEditingEl.__pomoInit = { workMin: pomoWork, breakMin: pomoBreak, restore: null };
    } else if (isClock) {
      // Đồng hồ: đổi kiểu mặt + múi giờ + nhãn (target giữ dạng "face,tz").
      currentEditingEl.dataset.target = `${clockFace},${clockTz}`;
      currentEditingEl.dataset.cfg = JSON.stringify({ face: clockFace, tz: clockTz, label: clockLabel });
      // Tự nới phím cho đủ chỗ: Thẻ lật cần >= 2x1, Analog cần >= 2x2.
      const node = currentEditingEl.gridstackNode;
      if (node && (node.w < minW || node.h < minH)) {
        grid.update(currentEditingEl, { w: Math.max(minW, node.w), h: Math.max(minH, node.h) });
      }
    } else if (isWeather) {
      // Thời tiết: đổi toạ độ + tên thành phố + skin (+ API key dự phòng).
      currentEditingEl.dataset.target = `${weatherLat},${weatherLon}`;
      currentEditingEl.dataset.cfg = JSON.stringify({
        lat: weatherLat, lon: weatherLon, city: weatherCity, skin: weatherSkin, apiKey: weatherKey
      });
    } else if (type === 'bongo_cat') {
      currentEditingEl.dataset.target = bongoSize;
      currentEditingEl.dataset.showKps = bongoShowKps ? '1' : '0';
      currentEditingEl.dataset.cfg = JSON.stringify({ size: bongoSize, showKps: bongoShowKps });
      const node = currentEditingEl.gridstackNode;
      if (node && node.w < 2) grid.update(currentEditingEl, { w: 2 });
      if (node && bongoSize === '2x2' && node.h < 2) grid.update(currentEditingEl, { h: 2 });
      if (node && bongoSize === '2x1' && node.h > 1) grid.update(currentEditingEl, { h: 1 });
    } else if (type === 'app_slider') {
      currentEditingEl.dataset.target = selApp.value || "";
      currentEditingEl.dataset.pid = '';
    } else if (type !== 'volume_slider' && type !== 'todo_list') {
      currentEditingEl.dataset.target = inpTarget.value.trim();
    }
    renderWidgetContent(currentEditingEl);
    refreshAudioSessions().then(syncAppSliders);
  } else {
    createWidgetEl({
      w: type === 'bongo_cat' ? 2 : (isWeather ? WEATHER_MIN_W
        : (isPomo || type === 'todo_list' ? 2
        : (isClock ? minW : (type === 'volume_slider' || type === 'app_slider' ? 2 : 1)))),
      h: type === 'bongo_cat' ? (bongoSize === '2x2' ? 2 : 1) : ((isPomo || type === 'todo_list') ? 2 : (isClock ? minH : 1)),
      icon: inpIcon.value.trim() || (type === 'bongo_cat' ? "🐈" : (isPomo ? "🍅" : (isClock ? "🕐" : (isWeather ? "🌤️" : (type === 'todo_list' ? "✅" : "⭐"))))),
      type,
      icon2x: iconUI.getIcon2x() || undefined,
      ...display,
      target: type === 'bongo_cat' ? bongoSize
        : (isPomo ? `${pomoWork},${pomoBreak}`
        : (isClock ? `${clockFace},${clockTz}`
        : (isWeather ? `${weatherLat},${weatherLon}`
        : (type === 'volume_slider' ? "50"
        : (type === 'app_slider' ? (selApp.value || "") : (type === 'todo_list' ? '' : inpTarget.value.trim())))))),
      cfg: type === 'bongo_cat' ? { size: bongoSize, showKps: bongoShowKps }
        : (isClock ? { face: clockFace, tz: clockTz, label: clockLabel }
        : (isWeather ? { lat: weatherLat, lon: weatherLon, city: weatherCity, skin: weatherSkin, apiKey: weatherKey } : undefined))
    });
  }

  saveCurrentLayout();
  hydrateVectorIcons();   // bộ icon nạp lazy: điền SVG cho span còn rỗng
  modal.classList.remove('active');
  currentEditingEl = null;
});

btnDelete.addEventListener('click', () => {
  if (currentEditingEl) {
    grid.removeWidget(currentEditingEl);
    saveCurrentLayout();
  }
  modal.classList.remove('active');
  currentEditingEl = null;
});

/* Click phải vào nền trống -> tạo phím mới */
document.querySelector('.deck-viewport').addEventListener('contextmenu', (e) => {
  if (!isEditMode) return;                            // Run Mode: không tạo phím mới
  if (e.target.closest('.grid-stack-item')) return;
  e.preventDefault();
  openEditModal(null);
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (settingsModal && settingsModal.classList.contains('active')) {
      closeSettings();
    } else if (modal.classList.contains('active')) {
      modal.classList.remove('active');
    } else {
      const tauri = window.__TAURI__ ? (window.__TAURI__.core || window.__TAURI__.tauri) : null;
      if (tauri) tauri.invoke('close_app');
    }
  }
});

/* 9. Nạp dữ liệu: ưu tiên layout đã lưu, nếu không thì dùng mặc định */

/* Đảm bảo LUÔN có đúng một phím "settings" trên lưới (kể cả layout cũ đã lưu
   từ trước khi có tính năng này). */

/* =========================================================================
   6e. WIDGET TO-DO (todo_list)
   -------------------------------------------------------------------------
   - CHẠM phím = mở cửa sổ soạn việc (todo.html) trên MÀN HÌNH PC.
   - Dữ liệu nằm ở localStorage (src/todo-store.js), dùng chung 2 cửa sổ.
   - Cửa sổ soạn lưu ngay mỗi thao tác -> deck nhận 'storage' (hoặc vòng quét
     2s dự phòng) và tự vẽ lại nội dung. Số dòng hiện ra tuỳ chiều cao ô (CSS
     container query), việc chưa xong luôn nằm trên.
   ========================================================================= */
function todoMarkup() {
  return `
    <div class="todo-unit" data-state="empty">
      <div class="todo-head"><span class="todo-title">Việc cần làm</span><span class="todo-count"></span></div>
      <ul class="todo-list"></ul>
      <div class="todo-empty">Chạm để thêm việc</div>
      <div class="todo-mini"><b class="todo-left">0</b><span>việc</span></div>
    </div>`;
}

function toggleTodoItem(id) {
  const items = loadTodos();
  const idx = items.findIndex((item) => item.id === id);
  if (idx === -1) return;
  items[idx].done = !items[idx].done;
  saveTodos(items);
  updateTodoWidgets();
}

function updateTodoWidget(el, force = false) {
  const unit = el.querySelector('.todo-unit');
  if (!unit) return;
  applyWidgetTier(el, unit);
  const raw = localStorage.getItem(TODO_KEY) || '';
  if (!force && el.__todoRaw === raw) return;      // dữ liệu chưa đổi -> khỏi vẽ lại
  el.__todoRaw = raw;
  const items = loadTodos();
  const done = items.filter((i) => i.done).length;
  const left = items.length - done;
  unit.dataset.state = !items.length ? 'empty' : (left === 0 ? 'clear' : 'open');
  unit.querySelector('.todo-count').textContent = items.length ? `${done}/${items.length}` : '';
  unit.querySelector('.todo-left').textContent = String(left);
  const ordered = items.filter((i) => !i.done).concat(items.filter((i) => i.done)).slice(0, 8);
  const list = unit.querySelector('.todo-list');
  list.innerHTML = ordered.map((i) =>
    `<li class="todo-item${i.done ? ' done' : ''}" data-id="${escapeHtml(String(i.id))}"><i class="todo-box"></i><span>${escapeHtml(i.text)}</span></li>`).join('');
  list.querySelectorAll('.todo-item').forEach((item) => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.todo-item')) toggleTodoItem(item.dataset.id);
    });
  });
  unit.title = items.length ? `${left} việc còn lại · ${done}/${items.length} đã xong` : 'Chạm để thêm việc';
}

function updateTodoWidgets() {
  document.querySelectorAll('.grid-stack-item[data-type="todo_list"]').forEach((el) => updateTodoWidget(el));
}

/** Mở cửa sổ soạn việc trên màn hình PC (Rust chọn màn không phải panel).
 * Luôn coi đây là "bắt đầu mở editor", không báo đỏ nếu popup bị chặn hoặc
 * Tauri chưa sẵn sàng; ưu tiên fallback browser để người dùng vẫn có thể chỉnh sửa.
 */
async function openTodoEditor() {
  if (getTauri()) {
    try {
      await invokeCmd('open_todo_window');
      return true;
    } catch (err) {
      console.warn('open_todo_window lỗi, thử fallback browser:', err);
    }
  }

  try {
    const popup = window.open('todo.html', 'todo-editor', 'width=460,height=640,resizable=yes,scrollbars=yes');
    if (popup) {
      popup.focus();
    }
    return true;
  } catch (err) {
    console.error('Không mở được cửa sổ To Do:', err);
    return true; // không flash đỏ vì đây là hành động đã được thử, không phải lỗi dữ liệu
  }
}

window.addEventListener('storage', (e) => { if (e.key === TODO_KEY || e.key === null) updateTodoWidgets(); });
window.addEventListener('focus', updateTodoWidgets);
setInterval(updateTodoWidgets, 2000);   // dự phòng nếu 'storage' không tới (kể cả lúc deck đang tối)

function ensureSettingsKey() {
  if (document.querySelector('.grid-stack-item[data-type="settings"]')) return;
  createWidgetEl({ x: 7, y: 0, w: 1, h: 1, icon: "⚙️", type: "settings", target: "" });
}
ensureSettingsKey();
syncDeckAudio();   // đồng bộ NGAY lúc khởi động (không chờ nhịp 2s đầu tiên)

/* Đặt lại bố cục về mặc định (gọi từ nút trong modal Cài đặt) */
function resetLayout() {
  grid.removeAll();
  defaultWidgets.forEach(w => createWidgetEl(w));
  saveCurrentLayout();
}

// Bộ icon vector nạp lazy: sau khi layout dựng xong, điền SVG cho các phím đang dùng.
hydrateVectorIcons();

/* 9. Nạp dữ liệu: ưu tiên layout đã lưu, nếu không thì dùng mặc định */
(function loadLayout() {
  let widgetsToLoad = defaultWidgets;
  const savedData = localStorage.getItem(STORAGE_KEY);
  
  if (savedData) {
    try {
      const parsed = JSON.parse(savedData);
      
      // Validate parsed data
      if (!Array.isArray(parsed)) {
        throw new Error('Invalid layout data: not an array');
      }
      
      // Check if any widget has valid structure
      const hasValidWidgets = parsed.some(w => 
        w && typeof w === 'object' && 
        typeof w.x === 'number' && 
        typeof w.y === 'number'
      );
      
      if (!hasValidWidgets) {
        throw new Error('Invalid layout data: no valid widgets found');
      }
      
      widgetsToLoad = parsed;
      console.log('Loaded saved layout:', parsed.length, 'widgets');
      
    } catch (err) {
      console.warn('Layout corrupt, auto-fallback to default:', err.message);
      // Clear corrupt data
      localStorage.removeItem(STORAGE_KEY);
      widgetsToLoad = defaultWidgets;
    }
  } else {
    console.log('No saved layout, using defaults');
  }
  
  widgetsToLoad.forEach(w => createWidgetEl(w));
  scheduleSliderRefresh();
})();

/* Render backdrop grid on initial load */
renderExactBackdrop();
