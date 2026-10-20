import { keyContent } from './mode-manager.js';

export function createIconSource({ isVectorIcon, vectorMarkup, escapeHtml, clampInt }) {
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
    return `<img data-key-icon="1" src="${escapeHtml(trimmed)}"${srcsetAttr(icon2x)} alt="" />`;
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

    return `<img data-key-icon="1" src="${escapeHtml(src)}"${srcsetAttr(icon2x)} alt="" />`;
  }

  return `<span class="icon-emoji">${escapeHtml(trimmed)}</span>`;
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
  if (!text) return;
  const t = document.createElement('span');
  t.className = 'key-title';
  t.textContent = text;
  t.dataset.pos = el.dataset.titlePos || 'bottom';
  t.dataset.shadow = el.dataset.titleShadow === '0' ? '0' : '1';
  t.style.setProperty('--title-size', (el.dataset.titleSize || '14') + 'px');
  content.appendChild(t);
}


  return { formatIconSource, prettyProcName, applyDisplayToEl, applyKeyTitle };
}
