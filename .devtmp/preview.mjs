/* Sinh .devtmp/preview.html: xem trước 2 widget ở đúng các cỡ ô (1x1 / 2x1 / 2x2)
   bằng CSS + markup THẬT của app (đọc từ index.html, src/core, src/widgets, src/styles).
   Chạy: node .devtmp/preview.mjs  ->  mở .devtmp/preview.html */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { root, jsSrc, cssSrc } from './_sources.mjs';

const htmlSrc = readFileSync(path.join(root, 'index.html'), 'utf8');
/* Mặt THẺ LẬT (flip) là tính năng TUỲ CHỌN -> chỉ dựng ô xem trước khi nguồn có. */
const hasFlip = /function\s+clockFlipMarkup\s*\(/.test(jsSrc);

function extract(name) {
  const fn = new RegExp('function\\s+' + name + '\\s*\\(').exec(jsSrc);
  if (fn) return jsSrc.slice(fn.index, jsSrc.indexOf('\n}', fn.index) + 2);
  const cn = new RegExp('const\\s+' + name + '\\s*=').exec(jsSrc);
  return jsSrc.slice(cn.index, jsSrc.indexOf('\n', cn.index));
}
const names = ['escapeHtml', 'weatherIconGroup', 'weatherIconSvg', 'wxGlyph', 'weatherMarkup',
  'cityShort', 'cityLabelHtml', 'clampInt', 'volLevel', 'volumeMarkup',
  'clockDateShort', 'clockTickMarkup', 'clockNumeralMarkup', 'clockAnalogMarkup', 'clockDigitalMarkup'];
if (hasFlip) names.push('clockFlipMarkup');
const constNames = ['WX_CLOUD_PATH', 'WX_MOON_PATH', 'CLOCK_WEEKDAY',
  'WX_G_DROP', 'WX_G_THERMO', 'WX_G_WIND', 'WX_G_PLACE', 'WX_G_WARN', 'WX_G_STALE'];
const api = new Function(
  constNames.map(extract).join('\n') + '\n'
  + names.map(extract).join('\n') + '\nreturn { ' + names.concat(constNames).join(', ') + ' };'
)();

const style = cssSrc;

const keycap = (type, w, h, inner) => `
    <figure>
      <div class="grid-stack-item" data-type="${type}" style="width:${w}px;height:${h}px">
        <div class="grid-stack-item-content">${inner}</div>
      </div>
      <figcaption>${type} · ${w / 160}x${h / 160}</figcaption>
    </figure>`;

const clockCell = (face, w, h, label) => keycap('mini_clock', w, h,
  face === 'analog' ? api.clockAnalogMarkup(label) : api.clockDigitalMarkup(label));

/* Ô ĐỒNG HỒ FLIP (thẻ lật): markup THẬT + class cỡ ô như applyWidgetTier();
   vòng tick bên dưới điền số theo giờ thật và chạy hoạt ảnh lật y như app. */
const flipCell = (w, h, label) => keycap('mini_clock', w, h,
  api.clockFlipMarkup(label)
    .replace('class="clock-unit keycap-clock-flip"',
      `class="clock-unit keycap-clock-flip ${tiers(w, h)}"`));

/* Ô ÂM LƯỢNG (fader capsule thống nhất): h > w -> orient="v" (fill dâng từ đáy),
   muted = trạng thái TẮT TIẾNG (track xám + icon viền đỏ). */
const volCell = (w, h, pct, muted = false) => {
  let inner = api.volumeMarkup('<span class="icon-emoji">🔊</span>', pct);
  if (h > w) inner = inner.replace('data-orient="h"', 'data-orient="v"');
  if (muted) {
    inner = inner
      .replace('class="volume-deck-unit"', 'class="volume-deck-unit is-muted"')
      .replace('data-state="active"', 'data-state="muted"')
      .replace('class="vol-icon app-icon-btn"', 'class="vol-icon app-icon-btn muted"');
  }
  return keycap('volume_slider', w, h, inner);
};

/* Ô "CÀI ĐẶT DECK" (luôn 1x1): markup THẬT lấy từ createWidget trong main.js.
   Mặt phím KHÔNG có chữ — chỉ bánh răng + vòng trạng thái. ratio = tỉ lệ vòng
   đã sáng (0 = chưa vào Chế độ Chỉnh sửa, 0.65 = đang chỉnh sửa). */
const SETTINGS_CIRC = 282.743;                 // 2*pi*45, khớp .settings-ring-progress
const setStart = jsSrc.indexOf('<div class="deck-icon-core settings-core">');
const settingsRaw = jsSrc.slice(setStart, jsSrc.indexOf('`;', setStart));
const settingsCell = (ratio) => keycap('settings', 160, 160,
  settingsRaw.replace('class="settings-ring-progress"',
    `class="settings-ring-progress" style="stroke-dashoffset:${(SETTINGS_CIRC * (1 - ratio)).toFixed(2)}"`));

/* Cỡ ô (px) -> class tier ĐÚNG như applyWidgetTier() trong app (is-mini/short/big/tall)
   để preview phản ánh đúng layout thật, không chỉ markup. Ô thật = 160px/lưới. */
const tiers = (wPx, hPx) => {
  const w = Math.max(1, Math.round(wPx / 160));
  const h = Math.max(1, Math.round(hPx / 160));
  const out = [];
  if (w <= 1 && h <= 1) out.push('is-mini');
  if (h <= 1 && w >= 2) out.push('is-short');
  if (w >= 2 && h >= 2) out.push('is-big');
  if (w <= 1 && h >= 2) out.push('is-tall');
  if (w >= 3 && h <= 1) out.push('is-wide3');   // 3x1: đủ 4 vùng (có vạch ngăn)
  return out.join(' ');
};

/* Điền dữ liệu thời tiết giả vào markup THẬT (icon/tông màu/skin lấy từ hàm thật).
   o = { city, code, night, tint, temp, cond, date, hum, feels, wind, skin, stale } */
const wxFill = (w, h, o, extraCls = '') => api.weatherMarkup(o.city)
  .replace('class="weather-unit keycap-weather"',
    `class="weather-unit keycap-weather ${tiers(w, h)}${extraCls}"`)
  .replace('data-tint="cloud" data-night="0" data-skin="soft"',
    `data-tint="${o.tint}" data-night="${o.night}" data-skin="${o.skin || 'soft'}"`)
  .replace(/<span class="weather-icon">[\s\S]*?<\/svg><\/span>/,
    `<span class="weather-icon">${api.weatherIconSvg(o.code, o.night === '0')}</span>`)
  .replace('class="weather-value">--<', `class="weather-value">${o.temp}<`)
  .replace('class="weather-cond">Đang tải…<', `class="weather-cond">${o.cond}<`)
  .replace(/class="weather-date">[^<]*</, `class="weather-date">${o.date || 'T5, 08/10'}<`)
  .replace('class="weather-hum">--<', `class="weather-hum">${o.hum === undefined ? '--' : o.hum + '%'}<`)
  .replace('class="weather-feels">--<', `class="weather-feels">${o.feels === undefined ? '--' : o.feels + '°'}<`)
  .replace('class="weather-wind">--<', `class="weather-wind">${o.wind === undefined ? '--' : String(o.wind)}<`)
  .replace('<span class="wx-badge" hidden>', o.stale ? '<span class="wx-badge">' : '<span class="wx-badge" hidden>')
  .replace('<b class="wx-badge-text"></b>', `<b class="wx-badge-text">${o.stale ? 'DỮ LIỆU CŨ' : ''}</b>`);

const wxCell = (w, h, o) => keycap('weather_widget', w, h, wxFill(w, h, o));

/* Ô ĐANG TẢI: chưa có dữ liệu -> "--°C" + minh hoạ xoay mờ (.is-loading) */
const wxLoadingCell = (w, h, o) => keycap('weather_widget', w, h,
  wxFill(w, h, { ...o, temp: '--', cond: 'Đang tải…' }, ' is-loading'));

const errCell = (w, h) => keycap('weather_widget', w, h,
  api.weatherMarkup('TP. HỒ CHÍ MINH')
    .replace('class="weather-unit keycap-weather"',
      `class="weather-unit keycap-weather ${tiers(w, h)} is-error"`)
    .replace('data-tint="cloud" data-night="0" data-skin="soft"',
      'data-tint="error" data-night="0" data-skin="soft"')
    .replace(/<span class="weather-icon">[\s\S]*?<\/svg><\/span>/,
      '<span class="weather-icon">'
      + '<svg class="wx-svg wx-svg-warn" viewBox="0 0 12 12" preserveAspectRatio="xMidYMid meet">'
      + api.WX_G_WARN + '</svg></span>')
    .replace('class="weather-cond">Đang tải…<', 'class="weather-cond">CHƯA KẾT NỐI<'));

/* Markup Pomodoro THẬT (lấy từ createWidget) + gán pha/trạng thái y như renderPomodoro */
const POMO_CIRC = 2 * Math.PI * 45;
const pomoStart = jsSrc.indexOf('<div class="pomodoro-unit"');
const pomoRaw = jsSrc.slice(pomoStart, jsSrc.indexOf('`;', pomoStart));
const pomoCell = (w, h, o) => keycap('pomodoro', w, h,
  pomoRaw
    .replace('class="pomodoro-unit"', `class="pomodoro-unit ${tiers(w, h)}"`)
    .replace('data-mode="work" data-state="idle" style="--pomo-ratio:1"',
      `data-mode="${o.mode}" data-state="${o.state}" style="--pomo-ratio:${o.ratio}" title="${o.title}"`)
    .replace('class="timer-progress work"',
      `class="timer-progress ${o.mode}" style="stroke-dasharray:${POMO_CIRC.toFixed(2)};`
      + `stroke-dashoffset:${(POMO_CIRC * (1 - o.ratio)).toFixed(2)}"`)
    .replace('class="timer-time">25:00<', `class="timer-time">${o.time}<`));

const rows = [
  ['FADER ÂM LƯỢNG — capsule THỐNG NHẤT (hệ thống & per-app cùng một ẩn dụ): 1x1 / 2x1 / ô CAO 1x2 / tắt tiếng', [
    volCell(160, 160, 35),
    volCell(320, 160, 72),
    volCell(160, 320, 60),
    volCell(320, 160, 45, true)
  ]],
  ['POMODORO — PHA "LÀM VIỆC" (đỏ cam): chờ chạm ▶ / tạm dừng ❚❚ / đang chạy ▶ (nhấp nháy nhẹ)', [
    pomoCell(320, 160, { mode: 'work', state: 'idle', ratio: 1, time: '25:00', title: 'POMODORO · CHẠM ĐỂ CHẠY' }),
    pomoCell(320, 160, { mode: 'work', state: 'paused', ratio: 0.62, time: '15:22', title: 'LÀM VIỆC · TẠM DỪNG' }),
    pomoCell(320, 160, { mode: 'work', state: 'running', ratio: 0.35, time: '08:44', title: 'LÀM VIỆC · ĐANG CHẠY' })
  ]],
  ['POMODORO — PHA "NGHỈ NGƠI" (xanh ngọc) + các cỡ 1x1 / 2x2', [
    pomoCell(320, 160, { mode: 'break', state: 'running', ratio: 0.48, time: '02:30', title: 'NGHỈ NGƠI · ĐANG CHẠY' }),
    pomoCell(160, 160, { mode: 'work', state: 'running', ratio: 0.72, time: '18:05', title: 'LÀM VIỆC · ĐANG CHẠY' }),
    pomoCell(320, 320, { mode: 'break', state: 'paused', ratio: 0.28, time: '01:24', title: 'NGHỈ NGƠI · TẠM DỪNG' })
  ]],
  ['ĐỒNG HỒ DIGITAL — 1x1 / 2x1 / 2x2', [
    clockCell('digital', 160, 160, 'HÀ NỘI'),
    clockCell('digital', 320, 160, 'HÀ NỘI'),
    clockCell('digital', 320, 320, 'HÀ NỘI')
  ]],
  ...(hasFlip ? [['ĐỒNG HỒ FLIP — thẻ lật kiểu lịch (2x1 khuyến nghị / 3x1 / 1x1 / 2x2)', [
    flipCell(320, 160, 'HÀ NỘI'),
    flipCell(480, 160, 'HÀ NỘI'),
    flipCell(160, 160, 'HÀ NỘI'),
    flipCell(320, 320, 'HÀ NỘI')
  ]]] : []),
  ['ĐỒNG HỒ ANALOG — 2x2 (khuyến nghị) và 1x1', [
    clockCell('analog', 320, 320, 'HÀ NỘI'),
    clockCell('analog', 160, 160, 'HÀ NỘI')
  ]],
  ['THỜI TIẾT 3x1 (MẶC ĐỊNH) — 4 vùng: tình trạng + °C lớn | vạch ngăn | ngày + 📍TP | minh hoạ tràn mép', [
    wxCell(480, 160, { city: 'TP. HỒ CHÍ MINH', code: 0, night: '0', tint: 'sun', temp: 34, cond: 'Trời quang', date: 'T5, 08/10', hum: 52, feels: 38, wind: 9 }),
    wxCell(480, 160, { city: 'TP. HỒ CHÍ MINH', code: 63, night: '0', tint: 'rain', temp: 27, cond: 'Mưa rào', date: 'T5, 08/10', hum: 88, feels: 30, wind: 12 }),
    wxCell(480, 160, { city: 'ĐÀ NẴNG', code: 95, night: '0', tint: 'storm', temp: 29, cond: 'Dông', date: 'T5, 08/10', hum: 82, feels: 34, wind: 21 })
  ]],
  ['THỜI TIẾT — BAN ĐÊM (gradient tím navy) + SKIN "PHẲNG" (#111317, màu chỉ ở minh hoạ)', [
    wxCell(480, 160, { city: 'HÀ NỘI', code: 0, night: '1', tint: 'sun', temp: 22, cond: 'Trời quang', date: 'T5, 08/10', hum: 70, feels: 22, wind: 4 }),
    wxCell(480, 160, { city: 'ĐÀ LẠT', code: 45, night: '1', tint: 'fog', temp: 18, cond: 'Sương mù', date: 'T5, 08/10', hum: 96, feels: 18, wind: 2, skin: 'flat' }),
    wxCell(480, 160, { city: 'SA PA', code: 71, night: '0', tint: 'snow', temp: 3, cond: 'Tuyết', date: 'T5, 08/10', hum: 91, feels: -1, wind: 7, skin: 'flat' })
  ]],
  ['THỜI TIẾT — THU GỌN: 2x1 (bỏ vạch ngăn, ngày + TP xuống dưới °C) / 1x1 / 2x2 (gió + độ ẩm) / 1x2 (cao hẹp)', [
    wxCell(320, 160, { city: 'HÀ NỘI', code: 1, night: '1', tint: 'partly', temp: 25, cond: 'Ít mây', date: 'T5, 08/10', hum: 99, feels: 31, wind: 3 }),
    wxCell(160, 160, { city: 'HÀ NỘI', code: 0, night: '0', tint: 'sun', temp: 22, cond: 'Quang', date: 'T5, 08/10', hum: 70, feels: 22, wind: 4 }),
    wxCell(320, 320, { city: 'TP. HỒ CHÍ MINH', code: 61, night: '0', tint: 'rain', temp: 27, cond: 'Mưa', date: 'T5, 08/10', hum: 88, feels: 30, wind: 12 }),
    wxCell(160, 320, { city: 'HUẾ', code: 51, night: '0', tint: 'drizzle', temp: 24, cond: 'Mưa phùn', date: 'T5, 08/10', hum: 92, feels: 26, wind: 5 })
  ]],
  ['THỜI TIẾT — TRẠNG THÁI: đang tải (--°C + minh hoạ xoay mờ) / dữ liệu cũ > 30 phút / lỗi mạng', [
    wxLoadingCell(480, 160, { city: 'TP. HỒ CHÍ MINH', code: 2, night: '0', tint: 'cloud' }),
    wxCell(480, 160, { city: 'TP. HỒ CHÍ MINH', code: 3, night: '1', tint: 'cloud', temp: 25, cond: 'Nhiều mây', date: 'T5, 08/10', hum: 88, feels: 27, wind: 8, stale: true }),
    errCell(320, 160)
  ]],
  ['PHÍM "CÀI ĐẶT DECK" 1x1 — mặt phím KHÔNG có chữ: chỉ bánh răng + vòng trạng thái (bình thường / đang ở Chế độ Chỉnh sửa)', [
    settingsCell(0),
    settingsCell(0.65)
  ]]
];

const page = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<title>Preview widget Fader / Pomodoro / Đồng hồ / Thời tiết / Cài đặt — Stream Deck VK02</title>
<style>${style}
    /* ---- Khung mô phỏng ĐÚNG lưới thật: ô 160x160 (panel 1280x800, 8x5) ---- */
    body { margin: 0; padding: 14px; background: #07080c; color: #cfd8e3;
           font-family: system-ui, "Segoe UI", sans-serif; }
    h2 { font-size: 12px; letter-spacing: 1.4px; color: #7d879b; margin: 18px 0 8px; }
    .row { display: flex; gap: 14px; align-items: flex-start; flex-wrap: wrap; }
    figure { margin: 0; }
    figcaption { margin-top: 6px; font-size: 10px; letter-spacing: 0.6px; color: #6d7a90; }
    .grid-stack-item { padding: 6px; box-sizing: border-box; }
    .grid-stack-item-content {
      width: 100%; height: 100%; position: relative;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      overflow: hidden;
    }
</style>
</head>
<body>
${rows.map(([title, cells]) => `<h2>${title}</h2>\n  <div class="row">${cells.join('')}\n  </div>`).join('\n  ')}

<script>
/* Bản rút gọn của vòng tick trong app — cập nhật DOM y như updateClockWidget(). */
const WD = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const ARC = 2 * Math.PI * 45.6;
function tick() {
  const now = new Date();
  const ms = ((now.getHours() * 3600) + (now.getMinutes() * 60) + now.getSeconds()) * 1000
    + now.getMilliseconds();
  const frac = (now.getSeconds() * 1000 + now.getMilliseconds()) / 60000;
  const date = WD[now.getDay()] + ', ' + String(now.getDate()).padStart(2, '0') + '/'
    + String(now.getMonth() + 1).padStart(2, '0');
  document.querySelectorAll('.clock-unit').forEach((unit) => {
    const set = (sel, val) => { const el = unit.querySelector(sel); if (el) el.textContent = val; };
    if (unit.dataset.face === 'analog') {
      const hand = (sel, deg) => {
        const el = unit.querySelector(sel);
        if (el) el.style.setProperty('--angle', deg.toFixed(2) + 'deg');
      };
      hand('.hand-second', (ms / 1000) * 6);
      hand('.hand-minute', (ms / 60000) * 6);
      hand('.hand-hour', (ms / 3600000) * 30);
      const arc = unit.querySelector('.clock-arc');
      if (arc) arc.style.setProperty('--sec-offset', (ARC * (1 - frac)).toFixed(2));
      set('.clock-date-mini', date);
      return;
    }
    /* Mặt LẬT: 4 tấm HH + MM theo 24 GIỜ (không nhãn AM/PM) — lật y như
       setFlipCard() trong app (nửa trên ăn số mới ngay, nửa dưới đổi khi lá
       lật đáp xuống). */
    if (unit.dataset.face === 'flip') {
      const digits = String(now.getHours()).padStart(2, '0')
        + String(now.getMinutes()).padStart(2, '0');
      unit.querySelectorAll('.flip-card').forEach((card, i) => {
        const next = digits[i];
        if (card.dataset.digit === next) return;
        const prev = card.dataset.digit || '';
        card.dataset.digit = next;
        card.querySelector('.flip-top > .flip-digit').textContent = next;
        card.querySelector('.flip-fold-bottom > .flip-digit').textContent = next;
        if (!prev) {
          card.querySelector('.flip-bottom > .flip-digit').textContent = next;
          return;
        }
        card.querySelector('.flip-fold-top > .flip-digit').textContent = prev;
        card.querySelector('.flip-bottom > .flip-digit').textContent = prev;
        card.classList.remove('is-flipping');
        void card.offsetWidth;
        card.classList.add('is-flipping');
      });
      return;
    }
    set('.clock-time', String(now.getHours()).padStart(2, '0') + ':'
      + String(now.getMinutes()).padStart(2, '0'));
    set('.clock-secs', String(now.getSeconds()).padStart(2, '0'));
    set('.clock-date', date);
    const bar = unit.querySelector('.clock-bar-fill');
    if (bar) bar.style.width = (frac * 100).toFixed(2) + '%';
  });
}
document.querySelectorAll('.clock-unit').forEach((u) => u.classList.add('is-animating'));
/* Lá lật dưới đáp xuống -> nửa tĩnh phía dưới nhận số mới rồi trả 2 lá về
   trạng thái nghỉ (y như animationend trong setupClockWidget của app) */
document.addEventListener('animationend', (e) => {
  if (!e.target.classList.contains('flip-fold-bottom')) return;
  const card = e.target.closest('.flip-card');
  if (!card) return;
  const bottom = card.querySelector('.flip-bottom > .flip-digit');
  if (bottom) bottom.textContent = card.dataset.digit || bottom.textContent;
  card.classList.remove('is-flipping');
});
tick();
setInterval(tick, 1000);
</script>
</body>
</html>
`;

writeFileSync(path.join(root, '.devtmp', 'preview.html'), page, 'utf8');
console.log('Đã tạo .devtmp/preview.html (' + page.length + ' ký tự)');

