/* Smoke test cho widget Đồng hồ & Thời tiết (bản redesign).
   Chạy: node .devtmp/smoke.mjs  — chỉ test các hàm THUẦN (không cần DOM). */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { root, jsSrc, cssSrc as css, extractFn } from './_sources.mjs';

const html = readFileSync(path.join(root, 'index.html'), 'utf8');

let pass = 0;
let fail = 0;
const ok = (label, cond, extra = '') => {
  if (cond) { pass++; console.log('PASS  ' + label); }
  else { fail++; console.log('FAIL  ' + label + (extra ? '  ::  ' + extra : '')); }
};

/* Mặt THẺ LẬT (flip) là tính năng TUỲ CHỌN: chỉ kiểm tra khi mã nguồn thực sự
   có mặt đó; nguồn không có -> in SKIP thay vì đánh FAIL (tránh test báo lỗi
   oan khi tính năng chưa/không được bật). */
const hasFlip = /function\s+clockFlipMarkup\s*\(/.test(jsSrc);
const skip = (label) => console.log('SKIP  ' + label + '  (nguồn không có mặt thẻ lật)');

/* --- Lấy source của 1 hàm / 1 const trong src/core + src/widgets để test riêng --- */
function extract(name) {
  const fn = extractFn(jsSrc, name);
  if (fn) return fn;
  if (new RegExp('function\\s+' + name + '\\s*\\(').test(jsSrc)) {
    throw new Error('Không tìm thấy kết thúc của hàm ' + name);
  }
  const cn = new RegExp('const\\s+' + name + '\\s*=').exec(jsSrc);
  if (cn) {
    const end = jsSrc.indexOf('\n', cn.index);
    return jsSrc.slice(cn.index, end < 0 ? undefined : end);
  }
  throw new Error('Không tìm thấy khai báo: ' + name);
}

const fnNames = ['escapeHtml', 'clampFloat', 'weatherIconGroup', 'wmoConditionVi',
  'weatherIconSvg', 'wxGlyph', 'weatherMarkup', 'cityShort', 'cityLabelHtml',
  'clockTickMarkup', 'clockNumeralMarkup',
  'clockAnalogMarkup', 'clockDigitalMarkup',
  'clockDateShort', 'wxNum'];
if (hasFlip) fnNames.push('clockFlipMarkup', 'normalizeClockFace');
const constNames = ['WX_CLOUD_PATH', 'WX_MOON_PATH', 'CLOCK_WEEKDAY', 'CLOCK_ARC_LEN',
  'WX_G_DROP', 'WX_G_THERMO', 'WX_G_WIND', 'WX_G_PLACE', 'WX_G_WARN', 'WX_G_STALE'];

const api = new Function(
  constNames.map(extract).join('\n') + '\n' + fnNames.map(extract).join('\n')
  + '\nreturn { ' + fnNames.join(', ') + ', CLOCK_ARC_LEN, CLOCK_WEEKDAY };'
)();

/* --- Helper: kiểm tra thẻ HTML/SVG có đóng mở cân đối --- */
const VOID_TAGS = new Set(['br', 'img', 'input', 'hr', 'meta', 'link']);
function balanced(markup) {
  const stack = [];
  const re = /<(\/?)([a-zA-Z][\w:-]*)([^>]*)>/g;
  let m;
  while ((m = re.exec(markup))) {
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    const selfClose = /\/$/.test(m[3].trim());
    if (selfClose || VOID_TAGS.has(tag)) continue;
    if (closing) {
      if (stack.pop() !== tag) return false;
    } else {
      stack.push(tag);
    }
  }
  return stack.length === 0;
}
const count = (hay, needle) => hay.split(needle).length - 1;

/* Bỏ hẳn một khối <span class="...">…</span> CÓ LỒNG NHAU (ví dụ .weather-city
   chứa .wc-full + .wc-short): regex non-greedy sẽ dừng ở </span> đầu tiên nên
   chữ của span con lọt ra và bị tính là "chữ trên mặt ô". */
function stripBlock(markup, cls) {
  let out = markup;
  for (let guard = 0; guard < 60; guard++) {
    const open = out.search(new RegExp('<span[^>]*class="[^"]*' + cls + '[^"]*"[^>]*>'));
    if (open < 0) break;
    const tag = /<\/?span\b[^>]*>/g;
    tag.lastIndex = open;
    let depth = 0;
    let end = -1;
    let t;
    while ((t = tag.exec(out))) {
      if (t[0].charAt(1) === '/') {
        depth--;
        if (depth === 0) { end = t.index + t[0].length; break; }
      } else {
        depth++;
      }
    }
    if (end < 0) break;
    out = out.slice(0, open) + ' ' + out.slice(end);
  }
  return out;
}

/* Chữ THỰC SỰ nhìn thấy trên mặt ô:
   - bỏ <svg> (icon/glyph);
   - bỏ nhãn ẩn thị giác .wx-sr / .pomo-sr (screen-reader + tooltip);
   - bỏ thẻ + thuộc tính (title/data-city KHÔNG phải chữ trên ô).
   Ô THỜI TIẾT giờ ĐỌC ĐƯỢC (tình trạng trời + ngày + tên TP) nên KHÔNG bỏ
   .weather-city nữa — dùng để chứng minh bố cục 3x1 có chữ đúng như spec. */
function visibleText(markup) {
  return ['wx-sr', 'pomo-sr'].reduce(stripBlock, markup)
    .replace(/<svg[\s\S]*?<\/svg>/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
const NO_LETTERS = /^[^\p{L}]*$/u;

/* ===================== ĐỒNG HỒ DIGITAL ===================== */
const dig = api.clockDigitalMarkup('Hà Nội <b>');
ok('digital: có đủ các khối mới', ['clock-top', 'clock-date', 'clock-secs-chip',
  'clock-pulse', 'clock-secs', 'clock-hero', 'clock-time', 'clock-bar',
  'clock-bar-fill', 'clock-label'].every((c) => dig.includes(c)),
  dig.replace(/\s+/g, ' ').slice(0, 160));
ok('digital: escapeHtml cho nhãn', dig.includes('Hà Nội &lt;b&gt;') && !dig.includes('<b>'));
ok('digital: thẻ cân đối', balanced(dig));
ok('digital: không có is-compact/is-short sót lại', !dig.includes('is-compact'));

/* ===================== ĐỒNG HỒ ANALOG ===================== */
const ana = api.clockAnalogMarkup('HÀ NỘI');
ok('analog: có vành + mặt số + glare', ['clock-rim', 'clock-dial', 'clock-glare'].every((c) => ana.includes(c)));
ok('analog: có cung giây + 3 kim + tâm', ['clock-arc-track', 'clock-arc', 'hand-hour',
  'hand-minute', 'hand-second', 'clock-center-cap', 'clock-center-dot', 'clock-date-mini'].every((c) => ana.includes(c)));
ok('analog: đủ 60 vạch phút', count(ana, 'class="clock-tick') === 60, 'thực tế=' + count(ana, 'class="clock-tick'));
ok('analog: 8 vạch giờ + 4 vạch 12/3/6/9', count(ana, 'is-major') === 8 && count(ana, 'is-quarter') === 4,
  'major=' + count(ana, 'is-major') + ' quarter=' + count(ana, 'is-quarter'));
ok('analog: có 4 số 12/3/6/9', ['>12<', '>3<', '>6<', '>9<'].every((t) => ana.includes(t)));
ok('analog: kim giây có đối trọng (line + circle)',
  /hand-second">\s*<line[^>]*><\/line>\s*<circle/.test(ana));
ok('analog: có 3 gradient trong defs', ['clockDialGrad', 'clockRimGrad', 'clockGlareGrad'].every((g) => ana.includes('id="' + g + '"')));
ok('analog: thẻ cân đối', balanced(ana));
ok('analog: chu vi cung giây khớp CSS (286.51)',
  Math.abs(api.CLOCK_ARC_LEN - 286.51) < 0.02, 'JS=' + api.CLOCK_ARC_LEN.toFixed(2));

/* ===================== ĐỒNG HỒ FLIP (thẻ lật) ===================== */
const flip = hasFlip ? api.clockFlipMarkup('Hà Nội <b>') : '';
if (hasFlip) {
ok('flip: có đủ khối của mặt lật', ['flip-row', 'flip-card', 'flip-half', 'flip-digit',
  'flip-fold-top', 'flip-fold-bottom', 'clock-label'].every((c) => flip.includes(c)),
  flip.replace(/\s+/g, ' ').slice(0, 160));
ok('flip: đúng 4 tấm lật (2 giờ + 2 phút)', count(flip, 'class="flip-card"') === 4,
  'thực tế=' + count(flip, 'class="flip-card"'));
ok('flip: mỗi tấm có 2 nửa TĨNH + 2 LÁ LẬT',
  count(flip, 'class="flip-half flip-top"') === 4 && count(flip, 'class="flip-half flip-bottom"') === 4
  && count(flip, 'flip-fold-top') === 4 && count(flip, 'flip-fold-bottom') === 4,
  'top=' + count(flip, 'class="flip-half flip-top"') + ' foldBottom=' + count(flip, 'flip-fold-bottom'));
ok('flip: 16 chữ số khởi tạo (4 tấm x 4 lớp)',
  count(flip, 'class="flip-digit"') === 16, 'thực tế=' + count(flip, 'class="flip-digit"'));
ok('flip: KHÔNG còn nhãn AM/PM (mặt 24 giờ, không chen chữ vào số)',
  !flip.includes('flip-period') && !/>\s*(AM|PM)\s*</.test(flip) && !flip.includes('flip-ink-dim'));
ok('flip: escapeHtml cho nhãn', flip.includes('Hà Nội &lt;b&gt;') && !flip.includes('<b>'));
ok('flip: thẻ cân đối', balanced(flip));
} else {
  skip('flip: khối markup + 4 tấm lật + 24 giờ không nhãn AM/PM');
}

/* Ba kiểu mặt hợp lệ; dữ liệu cũ / rác đều quy về digital (không vỡ ô) */
if (hasFlip) {
ok('normalizeClockFace: chỉ nhận digital/analog/flip',
  api.normalizeClockFace('flip') === 'flip' && api.normalizeClockFace('analog') === 'analog'
  && api.normalizeClockFace('digital') === 'digital'
  && api.normalizeClockFace(undefined) === 'digital' && api.normalizeClockFace('xyz') === 'digital');
} else {
  skip('normalizeClockFace: chỉ nhận digital/analog/flip');
}

/* ===================== HÀM PHỤ ===================== */
const d = new Date(2026, 9, 8, 13, 5, 7);
ok('clockDateShort: dạng "Tx, dd/mm" (thứ, ngày/tháng)',
  api.clockDateShort(d) === api.CLOCK_WEEKDAY[d.getDay()] + ', 08/10', api.clockDateShort(d));
ok('wxNum: giá trị xấu -> fallback', api.wxNum(undefined, 7) === 7 && api.wxNum('24.9') === 24.9);
ok('clampFloat vẫn hoạt động', api.clampFloat('7,5', -12, 14, 7) === 7.5);

/* ===================== THỜI TIẾT ===================== */
const wx = api.weatherMarkup('TP. Hồ Chí Minh');
ok('weather: có đủ khối mới (4 vùng + badge "dữ liệu cũ")',
  ['wx-body', 'weather-hero', 'weather-cond', 'weather-temp', 'weather-value',
    'weather-degree', 'wx-divider', 'wx-meta', 'weather-date', 'weather-place',
    'weather-city', 'weather-stats', 'weather-stat', 'weather-hum', 'weather-feels',
    'weather-wind', 'wx-art', 'weather-icon', 'wx-badge', 'wx-badge-icon',
    'wx-badge-text'].every((c) => wx.includes(c)),
  wx.replace(/\s+/g, ' ').slice(0, 160));
ok('weather: có data-tint + data-night + data-skin (mặc định "soft") + data-city',
  wx.includes('data-tint="cloud"') && wx.includes('data-night="0"')
  && wx.includes('data-skin="soft"')
  && wx.includes('data-city="TP. Hồ Chí Minh"') && wx.includes('title="TP. Hồ Chí Minh"'));
ok('weather: thẻ cân đối', balanced(wx));

/* --- BỐ CỤC 3x1 ĐỌC ĐƯỢC: tình trạng trời + ngày + tên TP là CHỮ TRÊN Ô --- */
ok('weather: tình trạng trời là CHỮ trên ô (.weather-cond, KHÔNG còn ẩn .wx-sr)',
  wx.includes('class="weather-cond">Đang tải') && !wx.includes('weather-cond wx-sr'));
ok('weather: có dòng thứ/ngày "Tx, dd/mm" (định dạng Việt Nam)',
  /class="weather-date">(CN|T2|T3|T4|T5|T6|T7), \d{2}\/\d{2}</.test(wx));
ok('weather: tên TP nằm sau GHIM ĐỊNH VỊ trong .weather-place (cả dạng đầy đủ + rút gọn)',
  /class="weather-place">[\s\S]{0,420}?wx-glyph-pin[\s\S]{0,420}?class="wc-full">TP\. Hồ Chí Minh<[\s\S]{0,420}?class="wc-short">TP\.HCM</.test(wx));
const wxVisible = visibleText(wx);
ok('weather: chữ nhìn thấy = trạng thái + ngày + TP + số "--" (không chữ rác)',
  ['Đang tải…', 'TP. Hồ Chí Minh', 'TP.HCM', '--'].every((t) => wxVisible.includes(t))
  && wxVisible.length < 90, 'thấy=' + JSON.stringify(wxVisible));
ok('weather: chỉ số phụ chỉ là SỐ (bỏ "km/h" + emoji 💧🌡🌬)',
  !wx.includes('km/h') && !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(wx));
ok('weather: đủ 4 glyph vector 12x12 (ghim + giọt + nhiệt kế + gió)',
  count(wx, 'viewBox="0 0 12 12"') === 4, 'thực tế=' + count(wx, 'viewBox="0 0 12 12"'));
ok('weather: mỗi chỉ số phụ có data-stat để tô màu riêng',
  ['hum', 'feels', 'wind'].every((s) => wx.includes('data-stat="' + s + '"')));
ok('weather: badge "dữ liệu cũ" mặc định ẨN (hidden) — chỉ hiện khi mất mạng',
  wx.includes('class="wx-badge" hidden'));

/* ===================== POMODORO (markup trong src/widgets/pomodoro.js) ============ */
const pomoStart = jsSrc.indexOf('<div class="pomodoro-unit');
if (pomoStart < 0) throw new Error('Không tìm thấy markup .pomodoro-unit trong src/widgets/pomodoro.js');
const pomoMarkup = jsSrc.slice(pomoStart, jsSrc.indexOf('`;', pomoStart));
ok('pomodoro: có vòng LED + đầu cung + số mm:ss + glyph trạng thái',
  ['pomodoro-ring', 'timer-bg', 'timer-progress work', 'timer-head', 'timer-time',
    'pomodoro-mark', 'glyph-play', 'glyph-pause'].every((c) => pomoMarkup.includes(c)));
ok('pomodoro: có data-mode/data-state mặc định + --pomo-ratio cho đầu cung',
  pomoMarkup.includes('data-mode="work"') && pomoMarkup.includes('data-state="idle"')
  && pomoMarkup.includes('--pomo-ratio:1'));
ok('pomodoro: thẻ cân đối', balanced(pomoMarkup));
ok('pomodoro: KHÔNG còn chữ hiển thị trên ô (chỉ số mm:ss + glyph)',
  NO_LETTERS.test(visibleText(pomoMarkup)),
  'thấy=' + JSON.stringify(visibleText(pomoMarkup)));
ok('pomodoro: nhãn pha/trạng thái nằm ở lớp ẩn .pomo-sr (đủ 2 nhãn)',
  count(pomoMarkup, 'class="pomo-sr ') === 2
  && pomoMarkup.includes('>POMODORO<') && pomoMarkup.includes('>CHẠM ĐỂ CHẠY<'));
ok('pomodoro: chữ "LÀM VIỆC / ĐANG CHẠY" không còn trong markup ô',
  !/LÀM VIỆC|ĐANG CHẠY|TẠM DỪNG/.test(pomoMarkup));

const groups = { sun: [0], partly: [1], cloud: [2, 3, 8], fog: [45, 48],
  drizzle: [51, 53, 55, 56, 57], rain: [61, 65, 67, 80, 81, 82], snow: [71, 75, 77, 85, 86],
  storm: [95, 96, 99] };
let mappingOk = true;
for (const [group, codes] of Object.entries(groups)) {
  for (const c of codes) if (api.weatherIconGroup(c) !== group) mappingOk = false;
}
ok('weatherIconGroup: map đúng 8 nhóm WMO', mappingOk);

let svgOk = true;
let svgBad = '';
for (const codes of Object.values(groups)) {
  for (const c of codes) {
    for (const isDay of [true, false]) {
      const svg = api.weatherIconSvg(c, isDay);
      const good = svg.startsWith('<svg class="wx-svg"') && svg.endsWith('</svg>')
        && balanced(svg) && !/undefined|NaN/.test(svg);
      if (!good) { svgOk = false; svgBad = 'code=' + c + ' isDay=' + isDay; }
    }
  }
}
ok('weatherIconSvg: mọi mã WMO (ngày + đêm) đều hợp lệ', svgOk, svgBad);

ok('icon ban đêm: trời quang -> mặt trăng + sao',
  api.weatherIconSvg(0, false).includes('wx-moon') && api.weatherIconSvg(0, false).includes('wx-star')
  && !api.weatherIconSvg(0, false).includes('wx-sun'));
ok('icon ban ngày: trời quang -> mặt trời',
  api.weatherIconSvg(0, true).includes('wx-sun') && !api.weatherIconSvg(0, true).includes('wx-moon'));
ok('icon ban đêm: ít mây -> trăng + mây',
  api.weatherIconSvg(1, false).includes('wx-moon') && api.weatherIconSvg(1, false).includes('wx-cloud'));
ok('icon: mã lạ (8) -> mây', api.weatherIconSvg(8, true).includes('wx-cloud'));
ok('icon: mặc định isDay=true', api.weatherIconSvg(0).includes('wx-sun'));

/* --- HÌNH MINH HOẠ: gradient mềm + TỐI ĐA 2 LỚP động cho mọi mã WMO --- */
let animOk = true;
let animBad = '';
for (const codes of Object.values(groups)) {
  for (const c of codes) {
    for (const isDay of [true, false]) {
      const svg = api.weatherIconSvg(c, isDay);
      const layers = count(svg, 'wx-anim ');
      const grads = count(svg, '<linearGradient');
      if (layers > 2 || layers < 1 || grads !== 3 || !svg.includes('<defs>')) {
        animOk = false;
        animBad = `code=${c} isDay=${isDay} lớp=${layers} gradient=${grads}`;
      }
    }
  }
}
ok('icon: 3 gradient <defs> + 1..2 LỚP động (.wx-anim) ở mọi mã WMO', animOk, animBad);
ok('icon: id gradient KÈM nhóm + ngày/đêm (nhiều ô trên deck không đụng nhau)',
  api.weatherIconSvg(0, true).includes('wxg-sun-d-body')
  && api.weatherIconSvg(0, false).includes('wxg-sun-n-body')
  && api.weatherIconSvg(63, true).includes('wxg-rain-d-extra')
  && api.weatherIconSvg(0, true).includes('fill="url(#wxg-sun-d-body)"'));
ok('icon: nắng = tia quay CHẬM 20s/vòng + quầng sáng "thở" (đúng 2 lớp)',
  api.weatherIconSvg(0, true).includes('wx-anim-spin')
  && api.weatherIconSvg(0, true).includes('wx-anim-breathe'));
ok('icon: mưa = hạt rơi, tuyết = dập dềnh, sương = 2 lớp trôi, dông = chớp nháy',
  api.weatherIconSvg(63, true).includes('wx-anim-fall')
  && api.weatherIconSvg(71, true).includes('wx-anim-sway')
  && count(api.weatherIconSvg(45, true), 'wx-anim-drift') === 2
  && api.weatherIconSvg(95, true).includes('wx-anim-blink'));
ok('icon: hạt mưa là HÌNH GIỌT có gradient (không còn gạch mảnh đơn sắc)',
  count(api.weatherIconSvg(63, true), 'class="wx-drop"') === 3
  && count(api.weatherIconSvg(63, true), 'url(#wxg-rain-d-extra)') >= 3);

/* ===================== NGÂN SÁCH KÍCH THƯỚC (lưới 8x5 @1280x800) =====
   cellW = cellH = 160px; MARGIN = 8 (main.js) -> content = cell - 16;
   Giao diện SD-LOOK: màn hình LCD tràn kín mặt phím (bỏ khung 10px cũ)
   -> LCD = content = cell - 16; font dùng cqw/cqh theo chính ô đó.
   Ước lượng bề rộng chữ mono ~0.62em/ký tự (đã trừ letter-spacing -0.02em). */
const CELL = 160;
const lcd = (w, h) => ({ W: w * CELL - 16, H: h * CELL - 16 });
const mono = (chars, fs, lsEm = 0) => chars * (0.62 + lsEm) * fs;
const fits = (used, avail) => used <= avail + 0.5;

[['1x1', 1, 1, 27], ['2x1', 2, 1, 21], ['2x2', 2, 2, 29]].forEach(([label, w, h, cqw]) => {
  const { W, H } = lcd(w, h);
  const fs = (cqw / 100) * W;
  const need = mono(5, fs, -0.02);          // "00:26"
  ok(`layout ${label}: giờ hero lọt bề ngang màn hình`,
    fits(need, W - 16), 'cần=' + need.toFixed(1) + 'px / có=' + (W - 16).toFixed(1) + 'px');
});

/* Thời tiết: bám sát các giá trị min(...cqw, ...cqh) trong index.html.
   LCD trừ tiếp padding 6px/8px của .weather-unit -> vùng dùng được (W-16, H-12). */
const cq = (v, box) => (v / 100) * box;
const digitW = (n, fs) => n * 0.58 * fs;      // tabular-nums + letter-spacing -0.02em
const wxBox = (W, H, tier) => ({
  icon: tier === 'mini' ? Math.min(cq(34, W), cq(34, H))
    : tier === 'big' ? Math.min(cq(28, W), cq(28, H))
      : tier === 'tall' ? Math.min(cq(34, W), cq(22, H))
        : Math.min(cq(24, W), cq(58, H)),
  value: tier === 'mini' ? Math.min(cq(34, W), cq(30, H))
    : tier === 'big' ? Math.min(cq(30, W), cq(26, H))
      : tier === 'tall' ? Math.min(cq(34, W), cq(18, H))
        : Math.min(cq(30, W), cq(42, H)),
  stat: Math.min(cq(4.6, W), cq(4.6, H)),
  place: tier === 'big' ? cq(3.4, W) : Math.min(cq(4.6, W), cq(6.6, H)),
  gapHero: (tier === 'mini' || tier === 'tall') ? Math.min(cq(1.6, W), cq(2, H)) : Math.min(cq(3.2, W), cq(5, H)),
  stacked: tier === 'mini' || tier === 'tall'
});

[['1x1', 1, 1, 'mini'], ['2x1', 2, 1, 'short'], ['2x2', 2, 2, 'big'], ['1x2', 1, 2, 'tall']]
  .forEach(([label, w, h, tier]) => {
    const { W, H } = lcd(w, h);
    const b = wxBox(W, H, tier);
    const tempW = digitW(2, b.value) + 0.44 * b.value;             // "25" + "°"
    const heroW = b.stacked ? Math.max(b.icon, tempW) : b.icon + b.gapHero + tempW;
    const heroH = b.stacked ? b.icon + b.gapHero + b.value : Math.max(b.icon, b.value);
    // Hàng chỉ số phụ chỉ có ở ô lớn (>=2x2): glyph + số, cách nhau min(4.4cqw, 5.6cqh)
    const statGap = Math.min(cq(4.4, W), cq(5.6, H));
    const statCell = (chars) => b.stat * 1.2 + b.stat * 0.32 + digitW(chars, b.stat);
    const statsW = tier === 'big' ? statCell(3) + statCell(3) + statCell(1) + 2 * statGap : 0;
    const statsH = tier === 'big' ? b.stat * 1.2 : 0;
    const needW = Math.max(heroW, statsW);
    ok(`layout ${label}: khối thời tiết (icon + số + chỉ số) lọt bề ngang`,
      fits(needW, W - 16), 'cần=' + needW.toFixed(1) + 'px / có=' + (W - 16).toFixed(1) + 'px');
    const needH = b.place + 2 + heroH + (statsH ? 2 + statsH : 0);
    ok(`layout ${label}: khối thời tiết lọt bề dọc`,
      fits(needH, H - 12), 'cần=' + needH.toFixed(1) + 'px / có=' + (H - 12).toFixed(1) + 'px');
  });

/* Pomodoro: số mm:ss + glyph phải nằm gọn LÒNG vòng LED.
   .pomodoro-ring { inset: 6% } -> hộp vuông cạnh 0.88*min(W,H); viewBox 100 &
   stroke-width 6 -> bán kính lòng trong = (45 - 3)/50 = 0.84 của bán kính hộp. */
[['1x1', 1, 1], ['2x1', 2, 1], ['2x2', 2, 2]].forEach(([label, w, h]) => {
  const { W, H } = lcd(w, h);
  const fs = Math.min(cq(17, W), cq(22, H));           // .timer-time
  const opening = 0.88 * Math.min(W, H) * (42 / 50);
  const needW = digitW(5, fs) + 0.02 * fs * 5;         // "25:00"
  const needH = fs + Math.min(cq(2, W), cq(1.2, H)) + Math.min(cq(7.4, W), cq(9, H));
  ok(`layout ${label}: số mm:ss lọt lòng vòng Pomodoro (ngang)`,
    fits(needW, opening), 'cần=' + needW.toFixed(1) + 'px / lòng vòng=' + opening.toFixed(1) + 'px');
  ok(`layout ${label}: số + glyph lọt lòng vòng Pomodoro (dọc)`,
    fits(needH, opening), 'cần=' + needH.toFixed(1) + 'px / lòng vòng=' + opening.toFixed(1) + 'px');
});


/* Ngân sách CHIỀU DỌC: cao màn hình - padding 12px phải chứa đủ các hàng. */
[['1x1', 1, 1], ['2x1', 2, 1], ['2x2', 2, 2]].forEach(([label, w, h]) => {
  const { W, H } = lcd(w, h);
  const isMini = w === 1 && h === 1;
  const isBig = w === 2 && h === 2;
  const top = isMini ? 0.08 * W : (isBig ? 0.064 * W : Math.min(0.06 * W, 0.10 * H));
  const hero = isMini ? 0.27 * W : (isBig ? 0.29 * W : 0.21 * W);
  const labelH = Math.min(0.054 * W, 0.094 * H);
  const need = (isMini ? 0 : top) + 3 + hero + 3 + 3 + 3 + labelH + 12;
  ok(`layout ${label}: đồng hồ digital lọt bề dọc`,
    fits(need, H), 'cần=' + need.toFixed(1) + 'px / có=' + H + 'px');
});

/* ===================== CSS (index.html) ===================== */
const styleBlock = css;
ok('CSS: ngoặc {} cân đối',
  count(styleBlock, '{') === count(styleBlock, '}'),
  '{=' + count(styleBlock, '{') + ' }=' + count(styleBlock, '}'));

const needCss = ['.clock-unit', '.clock-top', '.clock-date', '.clock-secs-chip', '.clock-pulse',
  '.clock-hero', '.clock-time', '.clock-bar', '.clock-bar-fill', '.clock-rim', '.clock-dial',
  '.clock-glare', '.clock-tick', '.clock-num', '.clock-arc-track', '.clock-arc', '.clock-hand',
  '.hand-hour', '.hand-minute', '.hand-second', '.clock-center-cap', '.clock-center-dot',
  '.clock-date-mini', '.clock-bezel', '.clock-face', '.clock-label',
  '.weather-unit', '.weather-place', '.weather-city', '.weather-hero', '.weather-icon',
  '.weather-temp', '.weather-value', '.weather-degree', '.weather-stats', '.weather-stat',
  '.weather-cond', '.weather-date', '.wx-body', '.wx-divider', '.wx-meta', '.wx-art',
  '.wx-badge', '.wx-badge-icon', '.wx-badge-text', '.wx-anim', '.wx-anim-spin',
  '.wx-anim-fall', '.wx-anim-drift', '@keyframes wxSpin', '@keyframes wxFall',
  '.weather-unit.keycap-weather', '.keycap-weather[data-skin="flat"]',
  '.keycap-weather[data-night="1"]',
  '.wx-glyph-pin', '.wx-sr', '.pomo-sr',
  '.pomodoro-unit', '.pomodoro-ring', '.timer-bg', '.timer-progress', '.timer-head',
  '.timer-time', '.pomodoro-mark', '.pomo-glyph',
  '.wx-moon', '.wx-star', '.keycap-weather.is-mini', '.keycap-weather.is-big',
  '.keycap-weather.is-tall', '.keycap-clock-digital.is-mini', '.keycap-clock-digital.is-big',
  '.keycap-clock-analog.is-mini', '.keycap-clock-analog.is-animating',
  '.keycap-clock-digital.is-animating',
  '@keyframes clockPulse', '@keyframes pomoBreathe'];
/* Selector CSS của mặt THẺ LẬT chỉ bắt buộc khi nguồn có mặt đó. */
if (hasFlip) needCss.push('.keycap-clock-flip', '.flip-row', '.flip-card', '.flip-half',
  '.flip-top', '.flip-bottom', '.flip-fold-top', '.flip-fold-bottom', '.flip-digit',
  '.keycap-clock-flip.is-mini', '--flip-ink:', '@keyframes flipFoldTop', '@keyframes flipFoldBottom');
const missCss = needCss.filter((sel) => !styleBlock.includes(sel));
ok('CSS: phủ hết selector của widget mới', missCss.length === 0, 'thiếu=' + missCss.join(', '));

ok('CSS: cung giây dùng var(--sec-offset)',
  /\.clock-arc\s*\{[^}]*stroke-dashoffset:\s*var\(--sec-offset/.test(styleBlock));
ok('CSS: có 8 data-tint + error', ['sun', 'partly', 'cloud', 'fog', 'drizzle', 'rain', 'snow', 'storm', 'error']
  .every((t) => styleBlock.includes('[data-tint="' + t + '"]')));
ok('CSS: có nhánh ban đêm [data-night="1"]',
  count(styleBlock, '[data-night="1"]') >= 2);
ok('CSS: dùng container query (cqw/cqh) + fallback px',
  styleBlock.includes('container-type: size') && styleBlock.includes('cqw') && styleBlock.includes('cqh'));
ok('CSS: không còn .is-compact cho clock/weather',
  !/keycap-(clock|weather)\.is-compact/.test(styleBlock));
ok('CSS: LCD :is() vẫn gồm .clock-unit và .weather-unit',
  /:is\([^)]*\.clock-unit[^)]*\.weather-unit[^)]*\)\s*\{/.test(styleBlock));
ok('CSS: chỉ ô lớn (.is-big) mới hiện hàng chỉ số phụ .weather-stats',
  /\.keycap-weather\.is-big \.weather-stats\s*\{\s*display: inline-flex/.test(styleBlock));
ok('CSS: tên TP hiện ở mọi cỡ ô ngang (rút gọn), ô 2x2 dùng tên đầy đủ',
  /\.wx-meta \.wc-short\s*\{\s*display: inline/.test(styleBlock)
  && /\.keycap-weather\.is-big \.wc-full\s*\{\s*display: inline/.test(styleBlock)
  && /\.keycap-weather\.is-mini \.wx-meta\b/.test(styleBlock));

/* --- BỐ CỤC 4 VÙNG + 2 SKIN + 6 NỀN GRADIENT theo spec --- */
ok('CSS: tình trạng trời HIỆN trên ô (13px, trắng 85%)',
  /\.weather-cond\s*\{[^}]*font-size: 13px/.test(styleBlock)
  && /\.weather-cond\s*\{[^}]*color: rgba\(255, 255, 255, 0\.85\)/.test(styleBlock));
ok('CSS: số nhiệt độ 48px "Segoe UI Light" 300 + °C 20px mờ',
  styleBlock.includes('"Segoe UI Light"')
  && /\.weather-value\s*\{[^}]*font-size: 48px/.test(styleBlock)
  && /\.weather-value\s*\{[^}]*font-weight: 300/.test(styleBlock)
  && /\.weather-degree\s*\{\s*font-size: 20px/.test(styleBlock));
ok('CSS: vạch ngăn 1px trắng 20% cao 60% (chỉ ô >= 3 cột)',
  /\.wx-divider\s*\{[\s\S]{0,200}?width: 1px;[\s\S]{0,80}?height: 60%;/.test(styleBlock)
  && /\.wx-divider\s*\{[\s\S]{0,240}?background: rgba\(255, 255, 255, 0\.2\)/.test(styleBlock)
  && /\.keycap-weather\.is-wide3 \.wx-divider\s*\{\s*display: block/.test(styleBlock));
ok('CSS: minh hoạ TRÀN mép phải ~15% (translateX(15%) + .wx-art tự cắt)',
  /\.wx-art\s*\{[\s\S]{0,260}?overflow: hidden/.test(styleBlock)
  && styleBlock.includes('transform: translateX(15%)'));
ok('CSS: 2x1 bỏ vạch ngăn, ngày + TP thành 1 dòng nhỏ DƯỚI số °C',
  /\.keycap-weather\.is-short:not\(\.is-wide3\) \.wx-body\s*\{[\s\S]{0,320}?grid-template-areas: "hero art" "meta art"/.test(styleBlock)
  && /\.keycap-weather\.is-short \.wx-meta\s*\{[^}]*flex-direction: row/.test(styleBlock));
ok('CSS: 2x2 minh hoạ LỚN trên, dưới là °C + text + chỉ số',
  /\.keycap-weather\.is-big \.wx-body\s*\{[\s\S]{0,320}?grid-template-areas: "art art" "hero meta"/.test(styleBlock));
ok('CSS: 1x1 chỉ còn minh hoạ + số °C (ẩn divider/meta/trạng thái)',
  /\.keycap-weather\.is-mini \.wx-divider,\s*\n\s*\.keycap-weather\.is-mini \.wx-meta,\s*\n\s*\.keycap-weather\.is-mini \.weather-cond \{ display: none/.test(styleBlock));
ok('CSS: 5 nền gradient ĐÚNG bảng màu spec (nắng/mây/mưa/dông/lỗi)',
  [['sun', '#1e6fa8', '#3ea5e8'], ['cloud', '#2b3947', '#455d73'], ['rain', '#0d6b63', '#189e82'],
    ['storm', '#301f5c', '#58338c'], ['error', '#2a0b0b', '#451212']]
    .every(([t, a, b]) => new RegExp('data-tint="' + t + '"\\]\\s*\\{ --wx-bg: linear-gradient\\(135deg, '
      + a + ', ' + b + '\\)').test(styleBlock)));
ok('CSS: ban đêm (data-night="1") dùng gradient tím navy #1b1642 -> #392873',
  /data-night="1"\]\s*\{ --wx-bg: linear-gradient\(135deg, #1b1642, #392873\)/.test(styleBlock));
ok('CSS: skin "Phẳng" = nền #111317 + bỏ lớp scrim',
  /data-skin="flat"\]\s*\{ --wx-bg: #111317/.test(styleBlock)
  && /data-skin="flat"\]::after \{ display: none/.test(styleBlock));
ok('CSS: lớp LÀM DỊU 30% độ chói (--wx-scrim: 0.3 + scrim ::after)',
  styleBlock.includes('--wx-scrim: 0.3')
  && /calc\(0\.62 \* var\(--wx-scrim\)\)/.test(styleBlock));
ok('CSS: badge "DỮ LIỆU CŨ" tự ẩn theo [hidden] + có icon riêng',
  styleBlock.includes('.wx-badge[hidden] { display: none; }')
  && styleBlock.includes('.wx-badge-icon'));
ok('CSS: đang tải -> minh hoạ XOAY MỜ',
  /\.keycap-weather\.is-loading \.weather-icon \{ opacity: 0\.45; animation: wxSpin/.test(styleBlock));
ok('CSS: deck RẢNH -> hạ sáng 40% + đứng mọi animation thời tiết',
  /body\.idle \.weather-unit\.keycap-weather \{ filter: brightness\(0\.4\)/.test(styleBlock)
  && /body\.idle \.weather-unit \.wx-anim/.test(styleBlock));
ok('CSS: tắt animation vi mô khi prefers-reduced-motion',
  /@media \(prefers-reduced-motion: reduce\) \{\s*\n\s*\.weather-unit \.wx-anim,/.test(styleBlock));
ok('CSS: KHÔNG còn rule chết .weather-extra / .weather-meta',
  !/\.weather-(extra|meta)\s*[,{]/.test(styleBlock));
ok('CSS: KHÔNG còn rule hiển thị .pomodoro-state / .pomodoro-mode',
  !/\.pomodoro-(state|mode)\s*[,{]/.test(styleBlock));
ok('CSS: .pomodoro-unit có container-type: size (để dùng cqw/cqh)',
  /\.pomodoro-unit\s*\{[^}]*container-type: size/.test(styleBlock));
ok('CSS: màu PHA pomodoro đổi qua [data-mode] + stroke currentColor',
  /\.pomodoro-unit\[data-mode="break"\]\s*\{\s*color:/.test(styleBlock)
  && /\.timer-progress\s*\{[^}]*stroke: currentColor/.test(styleBlock));
ok('CSS: trạng thái pomodoro dùng [data-state] idle/running/paused',
  ['[data-state="idle"]', '[data-state="running"]', '[data-state="paused"]']
    .every((s) => styleBlock.includes(s)));
ok('CSS: đầu cung .timer-head xoay theo var(--pomo-ratio)',
  /\.timer-head\s*\{[^}]*rotate\(calc\(var\(--pomo-ratio/.test(styleBlock));
ok('CSS: lớp chữ ẩn .wx-sr/.pomo-sr không chiếm diện tích (clip-path + 1px)',
  /\.wx-sr,\s*\.pomo-sr\s*\{[^}]*clip-path: inset\(50%\)/.test(styleBlock));
ok('CSS: lớp chữ ẩn khai báo SAU các rule mô tả (để luôn thắng)',
  styleBlock.indexOf('.wx-sr,') > styleBlock.indexOf('.weather-stat {'));
ok('CSS: tôn trọng prefers-reduced-motion cho pomodoro',
  /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]{0,240}\.pomodoro-unit/.test(styleBlock));

/* ===================== JS: renderPomodoro / applyWeatherToUnit ============= */
const renderSrc = extract('renderPomodoro');
ok('js: renderPomodoro ghi MÀU pha + TRẠNG THÁI bằng data-attr (thay cho chữ)',
  renderSrc.includes('unit.dataset.mode') && renderSrc.includes('unit.dataset.state')
  && renderSrc.includes('--pomo-ratio'));
ok('js: renderPomodoro đưa nhãn pha/trạng thái vào tooltip (unit.title)',
  /unit\.title = /.test(renderSrc));
ok('js: nhãn pha/trạng thái chỉ còn ghi vào .pomo-sr (ẩn thị giác)',
  /modeEl\.textContent = modeText/.test(renderSrc)
  && /stateEl\.textContent = stateText/.test(renderSrc));

const applySrc = extract('applyWeatherToUnit');
ok('js: applyWeatherToUnit gom đơn vị + trạng thái trời vào TOOLTIP',
  /unit\.title = /.test(applySrc) && applySrc.includes('km/h') && applySrc.includes('ướt'));
ok('js: chỉ số phụ ghi SỐ thuần vào ô (đơn vị chỉ ở tooltip)',
  /humEl\.textContent =/.test(applySrc) && /feelsEl\.textContent =/.test(applySrc)
  && /windEl\.textContent = String\(wind\)/.test(applySrc));
ok('js: trạng thái lỗi dùng icon cảnh báo (không viết câu chữ lên ô)',
  /WX_G_WARN/.test(extract('markWeatherPlaceholder')));

/* ============== JS: THỜI TIẾT — cache / làm mới / skin / badge ============= */
ok('js: applyWeatherToUnit ghi TRẠNG THÁI TRỜI + NGÀY vào chữ trên ô',
  /condEl\.textContent = condText/.test(applySrc)
  && /dateEl\.textContent = clockDateShort\(new Date\(at\)\)/.test(applySrc));
ok('js: tuổi dữ liệu + tooltip giờ cập nhật (data-updated + wxHm)',
  /unit\.dataset\.updated = String\(at\)/.test(applySrc)
  && /cập nhật \$\{wxHm\(at\)\}/.test(applySrc));
ok('js: cache LocalStorage kèm timestamp + nạp lúc khởi động (không chờ mạng)',
  jsSrc.includes("localStorage.setItem(WEATHER_CACHE_KEY") 
  && /function wxCacheHydrate\(\)/.test(jsSrc)
  && /wxCacheHydrate\(\);\s+\/\/ chạy TRƯỚC lần vẽ widget đầu tiên/.test(jsSrc)
  && /const cached = wxCacheGet\(key\)/.test(jsSrc));
ok('js: dữ liệu quá 30 phút + MẤT MẠNG -> badge "DỮ LIỆU CŨ" kèm tooltip giờ cũ',
  jsSrc.includes('WEATHER_STALE_MS = 30 * 60 * 1000')
  && /updateWxBadge\(unit, !!offline && \(Date\.now\(\) - at\) > WEATHER_STALE_MS, at\)/.test(applySrc)
  && /badge\.title = `Dữ liệu lúc \$\{wxHm\(ts\)\}/.test(extract('updateWxBadge')));
ok('js: mất mạng vẫn hiện số CŨ (offline = true) thay vì xoá trắng ô',
  /if \(cached\) applyWeatherToUnit\(unit, cached\.data, cfg\.city, cached\.ts, true\)/.test(jsSrc));
ok('js: ĐANG TẢI -> icon xoay mờ + "--°C" khi chưa có số nào',
  /function setWeatherLoading\(unit, on, blank = false\)/.test(jsSrc)
  && /setWeatherLoading\(unit, true, !cached\)/.test(jsSrc)
  && /setWeatherLoading\(unit, false\);/.test(jsSrc));
ok('js: chạm = làm mới ngay nhưng có CHỐNG DỘI 1,2s + bỏ qua khi đang tải',
  jsSrc.includes('WEATHER_TAP_DEBOUNCE_MS = 1200')
  && /if \(el\.__wxBusy\) return;/.test(jsSrc)
  && /now - \(el\.__wxTapAt \|\| 0\) < WEATHER_TAP_DEBOUNCE_MS/.test(jsSrc)
  && /el\.__wxBusy = true;/.test(jsSrc));
ok('js: skin chuẩn hoá 1 hàm dùng CHUNG cho lúc đọc + lúc lưu + lúc áp',
  /function normalizeWeatherSkin\(value\)/.test(jsSrc)
  && /const skin = normalizeWeatherSkin\(raw\.skin\)/.test(jsSrc)
  && /applyWeatherSkin\(unit, cfg\.skin\)/.test(jsSrc)
  && /normalizeWeatherSkin\(selWeatherSkin/.test(jsSrc));
ok('js: ô thời tiết MẶC ĐỊNH 3x1 (tạo mới + mẫu ở layout mặc định)',
  jsSrc.includes('WEATHER_MIN_W = 3')
  && /type === 'weather_widget'\) \? WEATHER_MIN_W/.test(jsSrc)
  && /w: isWeather \? WEATHER_MIN_W/.test(jsSrc)
  && /w: 3, h: 1, icon: "🌤️", type: "weather_widget"/.test(jsSrc));
ok('js: gán tier is-wide3 (>= 3 cột, 1 hàng) để CSS dựng đủ 4 vùng',
  /classList\.toggle\('is-wide3', w >= 3 && h <= 1\)/.test(jsSrc));
ok('html: modal có dropdown Skin + API key (dự phòng) cho widget thời tiết',
  html.includes('id="selWeatherSkin"') && html.includes('value="soft"')
  && html.includes('value="flat"') && html.includes('id="inpWeatherKey"'));
ok('html: modal hint nói rõ 3x1 + badge "DỮ LIỆU CŨ"',
  /(?:Ô chuẩn 3x1|O chuan 3x1)/.test(html)
  && /(?:DỮ LIỆU CŨ|DU LIEU CU)/.test(html));

/* ===================== RUST (lib.rs) ===================== */
const rs = readFileSync(path.join(root, 'src-tauri', 'src', 'lib.rs'), 'utf8');
ok('rust: WeatherInfo có is_day/feels_like/humidity/wind',
  ['is_day: bool', 'feels_like: f32', 'humidity: u8', 'wind: f32'].every((f) => rs.includes(f)));
ok('rust: URL Open-Meteo xin đủ trường mới',
  rs.includes('is_day,apparent_temperature,relative_humidity_2m,wind_speed_10m'));

console.log('\n===== ' + pass + ' PASS / ' + fail + ' FAIL =====');
process.exit(fail === 0 ? 0 : 1);
