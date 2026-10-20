import './icons.css';

/* =========================================================================
   HỆ THỐNG ICON THỐNG NHẤT
   -------------------------------------------------------------------------
   Giá trị `icon` của một phím có thể là:
     "lucide:home"   glyph UI (Lucide)       -> SVG inline, tô theo --accent
     "si:youtube"    logo (Simple Icons)     -> SVG inline, tô theo --accent
     đường dẫn / data:image/...              -> ảnh (kèm bản 2x ở `icon2x`)
     emoji                                   -> lựa chọn phụ
   Dữ liệu glyph nạp LAZY (dynamic import) nên bộ logo ~MB không làm chậm
   khởi động; chỉ nạp khi có phím dùng nó hoặc khi mở tab Logo.
   ========================================================================= */

const SET_LOADERS = {
  lucide: () => import('./icon-data-lucide.js').then((m) => m.LUCIDE),
  si: () => import('./icon-data-simple.js').then((m) => m.SIMPLE),
};
const data = {};
const pending = {};

export function loadIconSet(prefix) {
  if (data[prefix]) return Promise.resolve(data[prefix]);
  if (!SET_LOADERS[prefix]) return Promise.resolve({});
  if (!pending[prefix]) {
    pending[prefix] = SET_LOADERS[prefix]()
      .then((d) => (data[prefix] = d))
      .catch((e) => {
        console.warn('Không nạp được bộ icon', prefix, e);
        return (data[prefix] = {});
      });
  }
  return pending[prefix];
}

/* ---- id <-> SVG ---- */
const ID_RE = /^(lucide|si):([a-z0-9-]{1,64})$/;

export function parseIconId(v) {
  const m = ID_RE.exec(String(v || '').trim());
  return m ? { set: m[1], name: m[2] } : null;
}
export const isVectorIcon = (v) => !!parseIconId(v);

/** SVG của icon (rỗng nếu bộ icon chưa nạp hoặc không có tên đó). */
export function vectorSvg(id) {
  const p = parseIconId(id);
  if (!p) return '';
  const rec = data[p.set] && data[p.set][p.name];
  if (!rec) return '';
  if (p.set === 'lucide') {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${rec[1]}</svg>`;
  }
  return `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="${rec[1]}"/></svg>`;
}

/** Markup đồng bộ: nếu bộ icon đã nạp thì có SVG luôn, chưa thì để span rỗng
    và hydrateVectorIcons() sẽ điền sau. id đã qua regex nên an toàn khi nhúng. */
export function vectorMarkup(id) {
  const p = parseIconId(id);
  if (!p) return '';
  const safe = `${p.set}:${p.name}`;
  return `<span class="icon-vec" data-icon-id="${safe}">${vectorSvg(safe)}</span>`;
}

export async function hydrateVectorIcons(root = document) {
  const spans = [...root.querySelectorAll('.icon-vec[data-icon-id]')].filter((s) => !s.firstChild);
  if (!spans.length) return;
  const sets = new Set(spans.map((s) => (parseIconId(s.dataset.iconId) || {}).set).filter(Boolean));
  await Promise.all([...sets].map(loadIconSet));
  spans.forEach((s) => {
    const svg = vectorSvg(s.dataset.iconId);
    if (svg) s.innerHTML = svg;
    else s.textContent = '⏹️'; // id không còn trong bộ icon
  });
}

/* ---- tìm kiếm (bỏ dấu tiếng Việt, khớp mọi từ) ---- */
const fold = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();

export async function searchIcons(prefix, query, limit = 120) {
  const set = await loadIconSet(prefix);
  const terms = fold(query).trim().split(/\s+/).filter(Boolean);
  const first = [];
  const rest = [];
  for (const [name, rec] of Object.entries(set)) {
    const label = name.replace(/-/g, ' ');
    const hay = `${fold(label)} ${fold(rec[0])}`;
    if (!terms.every((t) => hay.includes(t))) continue;
    (terms.length && fold(label).startsWith(terms[0]) ? first : rest).push(name);
  }
  const all = first.concat(rest);
  return { names: all.slice(0, limit), total: all.length };
}

/* ---- emoji (lựa chọn phụ) ---- */
const EMOJI = [
  ['⭐', 'sao'],
  ['🔊', 'am luong'],
  ['🔇', 'tat tieng'],
  ['🎵', 'nhac'],
  ['🎧', 'tai nghe'],
  ['🎮', 'game'],
  ['💬', 'chat'],
  ['📧', 'mail'],
  ['📁', 'thu muc'],
  ['📝', 'ghi chu'],
  ['📊', 'bieu do'],
  ['🧰', 'cong cu'],
  ['🌐', 'web'],
  ['🔍', 'tim'],
  ['⚙️', 'cai dat'],
  ['🔒', 'khoa'],
  ['🔔', 'chuong'],
  ['📷', 'camera'],
  ['🎬', 'phim'],
  ['📺', 'tv'],
  ['💻', 'may tinh'],
  ['🖥️', 'man hinh'],
  ['⌨️', 'ban phim'],
  ['🖱️', 'chuot'],
  ['🍅', 'pomodoro'],
  ['⏱️', 'dong ho'],
  ['🕐', 'gio'],
  ['🌤️', 'thoi tiet'],
  ['☀️', 'nang'],
  ['🌙', 'dem'],
  ['⚡', 'dien'],
  ['🔥', 'lua'],
  ['🚀', 'ten lua'],
  ['🎯', 'muc tieu'],
  ['💡', 'y tuong'],
  ['🛒', 'mua'],
  ['🏠', 'nha'],
  ['📅', 'lich'],
  ['📌', 'ghim'],
  ['🔗', 'link'],
  ['☁️', 'may'],
  ['📥', 'tai xuong'],
  ['🎙️', 'micro'],
  ['📡', 'phat'],
  ['🧠', 'ai'],
  ['🤖', 'robot'],
  ['🛠️', 'sua'],
  ['🧪', 'thu nghiem'],
];

/* =========================================================================
   CHUẨN HOÁ ẢNH TẢI LÊN: 1:1, 144px (+ bản 288px), PNG — quy tắc Elgato.
   Ảnh không vuông được đặt VỪA khung vào canvas vuông trong suốt (không cắt
   mất nội dung); muốn phủ kín thì dùng tuỳ chọn "Phủ kín phím" của phím.
   ========================================================================= */
export const ICON_SIZE = 144;

async function decodeImage(file) {
  if (file.type !== 'image/svg+xml' && typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file);
      return {
        drawable: bmp,
        w: bmp.width,
        h: bmp.height,
        release: () => bmp.close && bmp.close(),
      };
    } catch (_) {
      /* rơi xuống đường <img> */
    }
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch (e) {
    URL.revokeObjectURL(url);
    throw new Error('Không đọc được ảnh này');
  }
  // SVG không khai báo kích thước có thể cho naturalWidth = 0.
  return {
    drawable: img,
    w: img.naturalWidth || ICON_SIZE,
    h: img.naturalHeight || ICON_SIZE,
    release: () => URL.revokeObjectURL(url),
  };
}

function renderSquare(src, size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const k = Math.min(size / src.w, size / src.h);
  const dw = Math.max(1, Math.round(src.w * k));
  const dh = Math.max(1, Math.round(src.h * k));
  ctx.drawImage(src.drawable, Math.floor((size - dw) / 2), Math.floor((size - dh) / 2), dw, dh);
  return c.toDataURL('image/png');
}

export async function normalizeImageFile(file) {
  const src = await decodeImage(file);
  try {
    return {
      dataUrl144: renderSquare(src, ICON_SIZE),
      dataUrl288: renderSquare(src, ICON_SIZE * 2),
      srcW: src.w,
      srcH: src.h,
    };
  } finally {
    src.release();
  }
}

const b64 = (dataUrl) => String(dataUrl).split(',')[1] || '';

/** Lưu cặp 144/288. Trong Tauri: ghi file PNG (tránh phình localStorage ~5MB);
    ngoài Tauri (chạy dev trên trình duyệt): giữ data URL. */
export async function persistIconPair(pair, invoke) {
  if (invoke && window.__TAURI__) {
    try {
      const r = await invoke('save_icon_pair', {
        png144: b64(pair.dataUrl144),
        png288: b64(pair.dataUrl288),
      });
      if (r && r.path144) return { icon: r.path144, icon2x: r.path288 };
    } catch (e) {
      console.warn('save_icon_pair lỗi, dùng data URL:', e);
    }
  }
  return { icon: pair.dataUrl144, icon2x: pair.dataUrl288 };
}

/* =========================================================================
   GIAO DIỆN PICKER + LẤY ICON TỰ ĐỘNG TRONG MODAL
   ========================================================================= */
const DEFAULT_ICONS = new Set(['', '⭐', '⏹️']);
const AUTO_TYPES = new Set(['launch_app', 'open_url']);

export function initIconUI({ input, invoke, renderIcon, getContext, onChange }) {
  const $ = (id) => document.getElementById(id);
  const btnLib = $('btnIconLib');
  const btnAuto = $('btnIconAuto');
  const panel = $('iconPicker');
  const grid = $('iconGrid');
  const search = $('iconSearch');
  const foot = $('iconPickerFoot');
  const preview = $('iconPreview');
  const status = $('iconStatus');
  const tabs = [...panel.querySelectorAll('[data-tab]')];
  let icon2x = '';
  let tab = 'lucide';
  let timer = 0;
  let seq = 0;

  const say = (msg, err = false) => {
    status.textContent = msg || '';
    status.classList.toggle('err', !!err);
  };
  const hasTauri = () => !!(window.__TAURI__ && invoke);

  function refreshPreview() {
    preview.innerHTML = renderIcon(input.value, icon2x);
    hydrateVectorIcons(preview);
  }
  function assign(icon, i2x = '') {
    input.value = icon;
    icon2x = i2x || '';
    refreshPreview();
    markSelected();
    if (onChange) onChange(icon, icon2x);
  }
  function markSelected() {
    const cur = input.value.trim();
    grid
      .querySelectorAll('button')
      .forEach((b) => b.classList.toggle('selected', b.dataset.value === cur));
  }

  async function renderGrid() {
    const my = ++seq;
    const q = search.value;
    if (tab === 'emoji') {
      const terms = fold(q).split(/\s+/).filter(Boolean);
      const list = EMOJI.filter(([, k]) => terms.every((t) => fold(k).includes(t)));
      grid.innerHTML = list
        .map(([e]) => `<button type="button" data-value="${e}" title="${e}">${e}</button>`)
        .join('');
      foot.textContent = `${list.length} emoji — chỉ là lựa chọn phụ; ưu tiên glyph/logo để đồng bộ màu accent.`;
      return markSelected();
    }
    const { names, total } = await searchIcons(tab, q);
    if (my !== seq) return; // đã có lượt tìm mới hơn
    const set = await loadIconSet(tab);
    const label = (n) => (tab === 'si' ? (set[n] || [n])[0] : n);
    grid.innerHTML = names
      .map((n) => {
        const id = `${tab}:${n}`;
        return `<button type="button" data-value="${id}" title="${label(n).replace(/"/g, '')}">${vectorSvg(id)}</button>`;
      })
      .join('');
    if (!Object.keys(set).length) {
      foot.textContent =
        tab === 'si'
          ? 'Bộ logo chưa được đóng gói. Chạy "npm run build:icons" một lần để nạp Simple Icons.'
          : 'Bộ glyph trống.';
    } else {
      foot.textContent =
        total > names.length
          ? `Hiện ${names.length}/${total} — gõ thêm để lọc.`
          : `${total} kết quả.`;
    }
    markSelected();
  }

  function openTab(t) {
    tab = t;
    tabs.forEach((b) => b.classList.toggle('active', b.dataset.tab === t));
    search.placeholder =
      t === 'si'
        ? 'Tìm logo… (youtube, discord, steam)'
        : t === 'emoji'
          ? 'Tìm emoji…'
          : 'Tìm glyph… (home, âm lượng, mic)';
    renderGrid();
  }

  btnLib.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) {
      openTab(tab);
      search.focus();
    }
  });
  tabs.forEach((b) => b.addEventListener('click', () => openTab(b.dataset.tab)));
  search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(renderGrid, 120);
  });
  grid.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-value]');
    if (b) assign(b.dataset.value, '');
  });
  input.addEventListener('input', () => {
    icon2x = '';
    refreshPreview();
    markSelected();
    if (onChange) onChange(input.value, '');
  });

  /* ---- tải ảnh lên: chuẩn hoá 1:1 / 144 / 288 ---- */
  async function importFile(file) {
    if (!file) return;
    say('Đang chuẩn hoá ảnh…');
    try {
      const pair = await normalizeImageFile(file);
      const stored = await persistIconPair(pair, invoke);
      assign(stored.icon, stored.icon2x);
      const note =
        pair.srcW === pair.srcH ? '' : ` (gốc ${pair.srcW}×${pair.srcH}, đã đặt vừa khung vuông)`;
      const small =
        Math.min(pair.srcW, pair.srcH) < ICON_SIZE ? ' Ảnh gốc nhỏ hơn 144px nên sẽ hơi mờ.' : '';
      say(`Đã chuẩn hoá 144px + 288px${note}.${small}`);
    } catch (e) {
      say(String(e.message || e), true);
    }
  }

  /* ---- icon thật của app / favicon của web ---- */
  async function fetchAuto({ silent = false } = {}) {
    const ctx = getContext();
    if (!AUTO_TYPES.has(ctx.type) || !ctx.target) {
      if (!silent) say('Nhập đích (đường dẫn app / URL) trước.', true);
      return false;
    }
    if (!hasTauri()) {
      if (!silent) say('Chỉ lấy được icon khi chạy trong app Tauri.', true);
      return false;
    }
    if (!silent)
      say(ctx.type === 'launch_app' ? 'Đang trích icon từ ứng dụng…' : 'Đang lấy favicon…');
    try {
      const r =
        ctx.type === 'launch_app'
          ? await invoke('get_app_icon', { target: ctx.target })
          : await invoke('get_favicon', { url: ctx.target });
      if (!r || !r.path144) throw new Error('Không nhận được icon');
      assign(r.path144, r.path288);
      if (!silent) say('Đã lấy icon.');
      return true;
    } catch (e) {
      if (!silent) say(String(e), true);
      return false;
    }
  }
  btnAuto.addEventListener('click', () => fetchAuto());

  return {
    importFile,
    getIcon2x: () => icon2x,
    setValue(icon, i2x = '') {
      input.value = icon;
      icon2x = i2x || '';
      refreshPreview();
      say('');
      panel.hidden = true;
    },
    syncType(type) {
      btnAuto.style.display = AUTO_TYPES.has(type) ? '' : 'none';
    },
    /** Gọi khi bấm Lưu: nếu người dùng chưa chọn icon (còn mặc định) thì tự lấy. */
    async autoFillIfDefault() {
      const ctx = getContext();
      if (!DEFAULT_ICONS.has(input.value.trim()) || !AUTO_TYPES.has(ctx.type) || !ctx.target)
        return false;
      return fetchAuto({ silent: true });
    },
  };
}
