import {
  isEditMode,
  keyContent,
  pressFeedback,
  releaseFeedback,
  flashKeycap,
} from '../core/mode-manager.js';
import { liveWidgetRegistry } from '../core/registry.js';
import { widgetRegistry } from '../core/widget-registry.js';
import { clockDateShort } from './clock.js';
import { clampFloat, escapeHtml } from '../core/utils.js';

export const WEATHER_DEFAULT = { lat: 10.9804, lon: 106.6519, city: 'THỦ DẦU MỘT', skin: 'soft' };
export const WEATHER_REFRESH_MS = 15 * 60 * 1000;
const WEATHER_STALE_MS = 30 * 60 * 1000;
const WEATHER_TAP_DEBOUNCE_MS = 500;
export const WEATHER_MIN_W = 3;
const WEATHER_CACHE_KEY = 'STREAMDECK_VK02_WEATHER_CACHE';
const weatherCache = new Map();
let runtime = null;

function getTauri() {
  return runtime.getTauri();
}
function invokeCmd(...args) {
  return runtime.invokeCmd(...args);
}
function applyWidgetTier(...args) {
  return runtime.applyWidgetTier(...args);
}

/** Giờ:phút "HH:MM" của một mốc thời gian (tooltip "cập nhật lúc…"). */
function wxHm(ts) {
  const d = new Date(Number(ts) || Date.now());
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
export function normalizeWeatherSkin(value) {
  return value === 'flat' ? 'flat' : 'soft';
}
export function parseWeatherCfg(el) {
  let raw = {};
  try {
    raw = JSON.parse(el.dataset.cfg || '{}') || {};
  } catch (_) {}
  const parts = String(el.dataset.target || '').split(',');
  const lat = clampFloat(raw.lat !== undefined ? raw.lat : parts[0], -90, 90, WEATHER_DEFAULT.lat);
  const lon = clampFloat(
    raw.lon !== undefined ? raw.lon : parts[1],
    -180,
    180,
    WEATHER_DEFAULT.lon
  );
  const city =
    typeof raw.city === 'string' && raw.city.trim() ? raw.city.trim() : WEATHER_DEFAULT.city;
  const skin = normalizeWeatherSkin(raw.skin);
  const apiKey = typeof raw.apiKey === 'string' ? raw.apiKey.trim() : '';
  return { lat, lon, city, skin, apiKey };
}

/** Nhóm icon vector tương ứng mã thời tiết WMO (0-99). */
function weatherIconGroup(code) {
  if (code === 0) return 'sun';
  if (code === 1) return 'partly';
  if (code === 2 || code === 3) return 'cloud';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'rain';
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
const WX_CLOUD_PATH =
  'M9.6 20.6h12.1a5 5 0 0 0 .6-9.95 6.6 6.6 0 0 0-12.5-1.2 4.7 4.7 0 0 0-.2 11.15z';

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
  const grad = (part, from, to) =>
    `<linearGradient id="${gid(part)}" x1="0.1" y1="0" x2="0.9" y2="1">` +
    `<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient>`;
  const defs =
    `<defs>${grad('body', palBody[0], palBody[1])}` +
    `${grad('cloud', palCloud[0], palCloud[1])}` +
    `${grad('extra', palExtra[0], palExtra[1])}</defs>`;

  const rays = [];
  for (let i = 0; i < 8; i++) {
    const a = (i * 45 * Math.PI) / 180;
    rays.push(
      `<line class="wx-ray" x1="${(16 + Math.cos(a) * 9.6).toFixed(1)}" y1="${(16 + Math.sin(a) * 9.6).toFixed(1)}" x2="${(16 + Math.cos(a) * 12.6).toFixed(1)}" y2="${(16 + Math.sin(a) * 12.6).toFixed(1)}"></line>`
    );
  }
  /* NẮNG: 2 lớp động — quầng sáng "thở" + 8 tia quay chậm 20s/vòng. */
  const sunFull =
    `<circle class="wx-halo wx-anim wx-anim-breathe" cx="16" cy="16" r="10.8" fill="${url('body')}"></circle>` +
    `<g class="wx-anim wx-anim-spin" stroke="${url('body')}" stroke-width="1.7" stroke-linecap="round">${rays.join('')}</g>` +
    `<circle class="wx-sun" cx="16" cy="16" r="6.4" fill="${url('body')}"></circle>`;
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
  const drop = (x, y, s) =>
    `<path class="wx-drop" transform="translate(${x} ${y}) scale(${s})" d="M0 0c1.15 1.5 1.95 2.5 1.95 3.4a1.95 1.95 0 0 1-3.9 0c0-.9.8-1.9 1.95-3.4z" fill="${url('extra')}"></path>`;
  const dropsLight = drop(9.2, 22.2, 0.86) + drop(14.2, 22.2, 0.86) + drop(19.2, 22.2, 0.86);
  const dropsHeavy = drop(8.8, 21.4, 1.06) + drop(13.8, 21.4, 1.06) + drop(18.8, 21.4, 1.06);
  const flakes = `<circle class="wx-flake" cx="12" cy="24.8" r="1.3" fill="${url('extra')}"></circle>\n        <circle class="wx-flake" cx="17" cy="26.6" r="1.3" fill="${url('extra')}"></circle>\n        <circle class="wx-flake" cx="22" cy="24.8" r="1.3" fill="${url('extra')}"></circle>`;
  const haze = `<line class="wx-haze" x1="8.5" y1="23" x2="23.5" y2="23"></line>\n        <line class="wx-haze" x1="10.5" y1="26.4" x2="21.5" y2="26.4"></line>`;
  const bolt = `<polygon class="wx-bolt wx-anim wx-anim-blink" points="17.8,21.4 13.2,27.8 16.4,27.8 14.6,32 20.6,24.4 17.2,24.4 19.4,21.4" fill="${url('body')}"></polygon>`;

  let inner = drift(cloudFull);
  if (group === 'sun') inner = isDay ? sunFull : moonFull;
  else if (group === 'partly') inner = (isDay ? sunCorner : moonCorner) + drift(cloudFull);
  else if (group === 'fog')
    inner =
      drift(cloudSmall) +
      `<g class="wx-anim wx-anim-drift" stroke="${url('extra')}" stroke-width="1.8" stroke-linecap="round">${haze}</g>`;
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
const WX_G_DROP =
  '<path d="M6 1.15c2.45 2.8 4.05 4.95 4.05 6.95a4.05 4.05 0 1 1-8.1 0C1.95 6.1 3.55 3.95 6 1.15z" fill="currentColor"/>';
const WX_G_THERMO =
  '<path d="M6 1.2a1.55 1.55 0 0 0-1.55 1.55v4.28a2.75 2.75 0 1 0 3.1 0V2.75A1.55 1.55 0 0 0 6 1.2z" fill="currentColor"/>';
const WX_G_WIND =
  '<g fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M1.4 4.2h6.2a1.5 1.5 0 1 0 0-3"/><path d="M1.4 6.4h4.2"/><path d="M1.4 8.4h5.4a1.35 1.35 0 1 1 0 2.7"/></g>';
const WX_G_PLACE =
  '<path fill-rule="evenodd" d="M6 1.1A3.75 3.75 0 0 0 2.25 4.85c0 2.8 3.35 5.8 3.65 6.05l.1.09.1-.09c.3-.25 3.65-3.25 3.65-6.05A3.75 3.75 0 0 0 6 1.1zm0 5.05a1.35 1.35 0 1 1 0-2.7 1.35 1.35 0 0 1 0 2.7z" fill="currentColor"/>';
const WX_G_WARN =
  '<g fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><path d="M6 1.6 11.1 10.4H.9z"/><path d="M6 4.5v3.1M6 9.1v.6"/></g>';
/* Glyph badge "dữ liệu cũ": đồng hồ + mũi tên quay lại. Dùng viewBox 24x24 (khác
   bộ glyph 12x12 của 4 móc chỉ số) để không lẫn với hàng chỉ số phụ. */
const WX_G_STALE =
  '<path d="M12 3.1a8.9 8.9 0 1 0 8.9 8.9h-2.3A6.6 6.6 0 1 1 12 5.4z" fill="currentColor"/><path d="M11.1 7.3a.95.95 0 0 1 .95.95v3.6l2.3 1.5a.95.95 0 1 1-1.04 1.6l-2.7-1.75a.95.95 0 0 1-.44-.8V8.25a.95.95 0 0 1 .93-.95z" fill="currentColor"/>';

/** Bọc 1 glyph 12x12 thành <svg> dùng chung: pin | drop | thermo | wind | warn. */
function wxGlyph(name, cls = '') {
  const body =
    { drop: WX_G_DROP, thermo: WX_G_THERMO, wind: WX_G_WIND, place: WX_G_PLACE, warn: WX_G_WARN }[
      name
    ] || WX_G_WARN;
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
  const full = cityEl.querySelector('.wc-full');
  const short = cityEl.querySelector('.wc-short');
  if (full) full.textContent = cityText;
  if (short) short.textContent = cityShort(cityText);
}

function setWeatherIcon(iconEl, markup) {
  if (!iconEl) return;
  // Parse qua <template> (HTML parser) để các phần tử SVG nhận đúng namespace SVG.
  // DOMParser 'image/svg+xml' trên markup không có xmlns làm phần tử rơi vào namespace rỗng -> không vẽ.
  const tpl = document.createElement('template');
  tpl.innerHTML = markup;
  const svg = tpl.content.firstElementChild;
  if (!svg || svg.localName !== 'svg') return;
  iconEl.replaceChildren(document.importNode(svg, true));
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
          <div class="wx-art"><span class="weather-icon">${weatherIconSvg(2, true)}</span></div>
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

  const widgetEl = unit.closest('.grid-stack-item');
  const iconEl = liveWidgetRegistry.get(widgetEl)?.icon || unit.querySelector('.weather-icon');
  setWeatherIcon(iconEl, weatherIconSvg(code, isDay));

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
  unit.title = [
    cityText,
    condText,
    `${Math.round(temp)}°C`,
    `ướt ${hum}%`,
    `cảm nhận ${feels}°C`,
    `gió ${wind} km/h`,
    `cập nhật ${wxHm(at)}`,
  ]
    .filter(Boolean)
    .join(' · ');

  // Đổi tông màu "màn hình" theo nhóm thời tiết + ngày/đêm (CSS [data-tint]).
  unit.dataset.tint = weatherIconGroup(code);
  unit.dataset.night = isDay ? '0' : '1';
  unit.dataset.updated = String(at);
  unit.classList.remove('is-error');
  // Badge "DỮ LIỆU CŨ": CHỈ khi mất mạng mà dữ liệu đã cũ hơn 30 phút.
  updateWxBadge(unit, !!offline && Date.now() - at > WEATHER_STALE_MS, at);
}

/** Bật/tắt badge "DỮ LIỆU CŨ" + tooltip giờ cập nhật cũ. */
function updateWxBadge(unit, stale, ts) {
  const badge = unit.querySelector('.wx-badge');
  if (!badge) return;
  badge.hidden = !stale;
  if (unit.dataset.stale !== (stale ? '1' : '0')) unit.dataset.stale = stale ? '1' : '0';
  if (!stale) {
    badge.removeAttribute('title');
    return;
  }
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
    const iconEl = unit.querySelector('.weather-icon');
    if (iconEl) setWeatherIcon(iconEl, weatherIconSvg(2, true));
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
    return raw && typeof raw === 'object' ? raw : {};
  } catch (_) {
    return {};
  }
}
function wxCacheSave(key, entry) {
  try {
    const all = wxCacheLoad();
    all[key] = entry;
    localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(all));
  } catch (err) {
    console.warn('Không ghi được cache thời tiết:', err);
  }
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
  return cold && typeof cold.ts === 'number' && cold.data ? cold : null;
}
wxCacheHydrate(); // chạy TRƯỚC lần vẽ widget đầu tiên (xem loadLayout ở cuối file)

/** Trạng thái chờ / lỗi (chưa lấy được dữ liệu thời tiết).
 *  Ô đổi sang tông đỏ + icon cảnh báo; dòng mô tả (.weather-cond) nói rõ lý do. */
function markWeatherPlaceholder(unit, city, message) {
  const widgetEl = unit.closest('.grid-stack-item');
  const iconEl = liveWidgetRegistry.get(widgetEl)?.icon || unit.querySelector('.weather-icon');
  setWeatherIcon(iconEl, weatherIconSvg(2, true));
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
  updateWxBadge(unit, false, 0); // trạng thái lỗi đã thay cho badge "cũ"
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
  if (cached) applyWeatherToUnit(unit, cached.data, cfg.city, cached.ts); // hiện ngay

  if (!force && cached && Date.now() - cached.ts < WEATHER_REFRESH_MS) return;
  if (!getTauri()) {
    // chạy ngoài Tauri (dev web) -> không có dữ liệu thật
    if (!cached) markWeatherPlaceholder(unit, cfg.city, 'Chưa kết nối');
    return;
  }

  setWeatherLoading(unit, true, !cached);
  try {
    const data = await invokeCmd('get_weather_data', { lat: cfg.lat, lon: cfg.lon });
    if (data && typeof data.temp === 'number') {
      const ts = Date.now();
      weatherCache.set(key, { ts, data });
      wxCacheSave(key, { ts, data }); // giữ số qua lần mở app sau
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
  const content = keyContent(el);
  if (el.__weatherWiredTo === content) return;
  destroyWeatherWidget(el);
  const handlers = {
    pointerdown: (e) => {
      if (isEditMode || e.button) return;
      pressFeedback(el);
    },
    release: () => releaseFeedback(el),
    click: async () => {
      if (isEditMode || runtime.didDragJustHappen()) return;
      releaseFeedback(el);
      const now = Date.now();
      if (el.__wxBusy) return; // đang tải
      if (now - (el.__wxTapAt || 0) < WEATHER_TAP_DEBOUNCE_MS) return; // chạm dồn dập
      el.__wxTapAt = now;
      el.__wxBusy = true;
      try {
        await updateWeatherWidget(el, true);
      } finally {
        el.__wxBusy = false;
      }
      flashKeycap(el, !el.querySelector('.weather-unit.is-error'));
    },
  };
  content.addEventListener('pointerdown', handlers.pointerdown);
  content.addEventListener('pointerup', handlers.release);
  content.addEventListener('pointercancel', handlers.release);
  content.addEventListener('pointerleave', handlers.release);
  content.addEventListener('click', handlers.click);
  el.__weatherWiredTo = content;
  el.__weatherListeners = { content, handlers };
}

function destroyWeatherWidget(el) {
  const record = el.__weatherListeners;
  if (record) {
    record.content.removeEventListener('pointerdown', record.handlers.pointerdown);
    record.content.removeEventListener('pointerup', record.handlers.release);
    record.content.removeEventListener('pointercancel', record.handlers.release);
    record.content.removeEventListener('pointerleave', record.handlers.release);
    record.content.removeEventListener('click', record.handlers.click);
  }
  delete el.__weatherListeners;
  delete el.__weatherWiredTo;
  el.__wxBusy = false;
}

export function createWeatherWidget(services) {
  runtime = services;
  return {
    type: 'weather_widget',
    markup: weatherMarkup,
    setup: setupWeatherWidget,
    register(el) {
      const unit = el.querySelector('.weather-unit');
      return unit
        ? { el, type: 'weather_widget', unit, icon: unit.querySelector('.weather-icon') }
        : null;
    },
    update(entry, force = false) {
      return entry ? updateWeatherWidget(entry.el, force) : undefined;
    },
    destroy(el) {
      destroyWeatherWidget(el);
    },
    refreshAll(registry) {
      for (const refs of registry.values()) {
        if (refs.type === 'weather_widget') updateWeatherWidget(refs.el, false);
      }
    },
  };
}

widgetRegistry.registerWidget({
  type: 'weather_widget',
  label: 'Thời tiết',
  icon: '🌤️',
  defaultSize: [3, 1],
  fixedSize: true,
  configFields: [
    { key: 'city', type: 'city', label: 'Thành phố' },
    { key: 'lat', type: 'number', label: 'Vĩ độ' },
    { key: 'lon', type: 'number', label: 'Kinh độ' },
    { key: 'skin', type: 'select', label: 'Skin', options: ['soft', 'flat'] },
  ],
  create: ({ el, services }) => {
    const widget = services.weatherWidget;
    return {
      markup: widget.markup(parseWeatherCfg(el).city),
      setup: () => {
        widget.setup(el);
        widget.update(widget.register(el));
      },
      destroy: () => widget.destroy(el),
    };
  },
});
