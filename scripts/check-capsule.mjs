/* Kiểm tra TÍNH NHẤT QUÁN của bản redesign "Cyber-Glass + Capsule Fader":
   1. design token trong index.html;
   2. CSS của Capsule Fader (ngang/dọc) + slider per-app + LED;
   3. MỌI class mà markup (JS) sinh ra đều PHẢI có CSS (bắt drift markup <-> CSS);
   4. đấu dây tương tác: throttle 20ms, flush cuối, bỏ qua nút mute, fader dọc,
      refresh khi đổi cỡ ô / đổi cỡ cửa sổ;
   5. không còn tàn dư slider cũ (touch-track/touch-fill/vol-status-row).
   Chạy: node scripts/check-capsule.mjs */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { root, jsSrc, cssSrc as style, extractFn, widgetSrc } from './_sources.mjs';

const html = readFileSync(path.join(root, 'index.html'), 'utf8');

let pass = 0;
let fail = 0;
const ok = (label, cond, extra = '') => {
  if (cond) { pass++; console.log('PASS  ' + label); }
  else { fail++; console.log('FAIL  ' + label + (extra ? '  ::  ' + extra : '')); }
};

/* Mặt THẺ LẬT (flip) là tính năng TUỲ CHỌN: mọi kiểm tra liên quan chỉ chạy khi
   mã nguồn thực sự có mặt đó; nếu không thì in SKIP (không tính là lỗi). */
const hasFlip = /function\s+clockFlipMarkup\s*\(/.test(jsSrc);
const skip = (label) => console.log('SKIP  ' + label + '  (nguồn không có mặt thẻ lật)');

/* ===================== 1. DESIGN TOKEN ===================== */
ok('token: nền tối --bg #090a0f', /--bg:\s*#090a0f/.test(style));
ok('token: bo góc keycap --radius-key 16px', /--radius-key:\s*16px/.test(style));
ok('token: nhấn phím --press-transform + --press-shadow',
  /--press-transform:\s*scale\(0\.96\)\s*translateY\(2px\)/.test(style) && style.includes('--press-shadow'));
ok('token: gradient fill --fill-from/--fill-to/--fill-glow',
  ['--fill-from:', '--fill-to:', '--fill-glow:'].every((t) => style.includes(t)));
ok('keycap :active dùng --press-transform (không hard-code scale)',
  /:active[^{]*\{[^}]*var\(--press-transform\)/.test(style));

/* ===================== 2. CAPSULE FADER (ÂM LƯỢNG) ===================== */
ok('fader: có bể chứa + lớp nội dung (core/icon/số)',
  ['.volume-deck-unit', '.volume-core', '.vol-icon', '.vol-number'].every((c) => style.includes(c)));
ok('fader ngang: fill rộng theo --fill-percent + gradient 90deg',
  /\.volume-fill\s*\{[^}]*width:\s*calc\(var\(--fill-percent[^}]*90deg/.test(style));
ok('fader: vạch mức phát sáng theo --fill-glow',
  /\.volume-fill::after\s*\{[^}]*var\(--fill-glow\)/.test(style));
ok('fader dọc (ô cao): [data-orient="v"] fill dâng từ ĐÁY',
  /\[data-orient="v"\]\s*\.volume-fill\s*\{[^}]*height:\s*calc\(var\(--fill-percent[^}]*0deg/.test(style));
ok('fader: lớp fill không nuốt cử chỉ vuốt (pointer-events: none)',
  /\.volume-fill\s*\{[^}]*pointer-events:\s*none/.test(style));

/* ===================== 3. SLIDER PER-APP + LED ===================== */
ok('app: .app-fill rộng theo --fill-percent', /\.app-fill\s*\{[^}]*width:\s*calc\(var\(--fill-percent/.test(style));
ok('app: LED 4px có 3 trạng thái active/muted/idle',
  style.includes('.app-led') && ['active', 'muted', 'idle']
    .every((s) => style.includes('[data-state="' + s + '"] .app-led')));
ok('app 1x1: .is-mini ẩn tên + thanh gạt, vẫn hiện LED',
  /\.app-deck-unit\.is-mini \.app-name/.test(style)
  && /\.app-deck-unit\.is-mini \.app-led\s*\{\s*display:\s*block/.test(style));
ok('icon 1x1 dùng squircle .icon-chip', style.includes('.icon-chip'));


/* ===================== 4. MARKUP (JS) <-> CSS =====================
   Mọi class xuất hiện trong markup sinh ra từ JS phải có rule CSS tương ứng,
   nếu không ô sẽ mất định dạng mà không ai báo lỗi. */
function extractFnOrThrow(name, src = jsSrc) {
  const fn = extractFn(src, name);
  if (!fn) throw new Error('Không tìm thấy hàm: ' + name);
  return fn;
}
const markup = {};
const markupFns = ['volumeMarkup', 'weatherMarkup', 'clockDigitalMarkup',
  'clockAnalogMarkup', 'clockTickMarkup', 'clockNumeralMarkup'];
if (hasFlip) markupFns.push('clockFlipMarkup');
markupFns.forEach((n) => { markup[n] = extractFnOrThrow(n); });
/* markup() của app-slider là hàm lồng trong setup widget -> trích riêng theo file. */
markup.appMarkup = extractFnOrThrow('markup', widgetSrc('app-slider.js'));
const pomoStart = jsSrc.indexOf('<div class="pomodoro-unit');
if (pomoStart < 0) throw new Error('Không tìm thấy markup .pomodoro-unit trong src/widgets/pomodoro.js');
markup.pomodoro = jsSrc.slice(pomoStart, jsSrc.indexOf('`;', pomoStart));

const cssClasses = new Set();
for (const m of style.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) cssClasses.add(m[1]);

/* Class CHỈ dùng làm móc JS / do thư viện sinh / kế thừa style từ cha:
   - grid-stack-item*: GridStack sinh và thuộc CSS của thư viện;
   - wx-sr / pomo-sr: lớp chữ ẩn thị giác (đã kiểm riêng ở smoke.mjs);
   - clock-secs: kế thừa font/màu từ .clock-secs-chip;
   - weather-hum / weather-feels / weather-wind: móc JS, kế thừa kiểu chữ +
     màu từ .weather-stat (kiểm riêng bên dưới);
   - weather-cond: móc JS, ẩn thị giác nhờ .wx-sr;
   - pomodoro-mode / pomodoro-state: móc JS, ẩn thị giác nhờ .pomo-sr. */
const HOOK_ONLY = new Set(['grid-stack-item', 'grid-stack-item-content', 'wx-sr', 'pomo-sr',
  'clock-secs', 'weather-hum', 'weather-feels', 'weather-wind', 'weather-cond',
  'pomodoro-mode', 'pomodoro-state', 'pomo-time-display']);
const orphan = [];
for (const [name, src] of Object.entries(markup)) {
  for (const m of src.matchAll(/class="([^"]*)"/g)) {
    for (const raw of m[1].split(/\s+/)) {
      const cls = raw.replace(/\$\{[^}]*\}/g, '').trim();
      if (!cls || /[${}'+`]/.test(cls) || HOOK_ONLY.has(cls)) continue;
      if (!cssClasses.has(cls)) orphan.push(name + ' -> .' + cls);
    }
  }
}
ok('markup <-> CSS: không có class "mồ côi"',
  orphan.length === 0, 'thiếu CSS: ' + [...new Set(orphan)].join(', '));
ok('móc JS thời tiết nằm trong .weather-stat (nguồn kiểu chữ + màu)',
  /class="weather-stat" data-stat="hum"[\s\S]{0,240}?class="weather-hum"/.test(jsSrc));
ok('móc JS pomodoro nằm cạnh lớp ẩn thị giác .pomo-sr',
  jsSrc.includes('class="pomo-sr pomodoro-mode"') && jsSrc.includes('class="pomo-sr pomodoro-state"'));
ok('app: .app-name/.app-percent/.app-track/.app-fill/.app-led đều có CSS',
  ['.app-name', '.app-percent', '.app-track', '.app-fill', '.app-led']
    .every((c) => cssClasses.has(c.slice(1))));

/* ===================== 5. ĐẤU DÂY TƯƠNG TÁC ===================== */
ok('throttle chung CAPSULE_THROTTLE_MS = 20ms', /const CAPSULE_THROTTLE_MS = 20;/.test(jsSrc));
ok('1 động cơ kéo dùng cho CẢ 2 slider (1 định nghĩa + 2 chỗ gọi)',
  (jsSrc.match(/wireCapsuleDrag\(/g) || []).length === 3,
  'số lần=' + (jsSrc.match(/wireCapsuleDrag\(/g) || []).length);
ok('pointerdown: bỏ qua nút mute (.app-icon-btn)', /closest\('\.app-icon-btn'\)/.test(jsSrc));
ok('pointerdown: nhường Edit Mode (không kích hoạt khi đang sửa)',
  /'pointerdown', \(e\) => \{\s*if \(isEditMode\) return;/.test(jsSrc));
ok('pointerdown: chặn GridStack cướp cử chỉ (stopPropagation + setPointerCapture)',
  /pointerdown[\s\S]{0,600}?stopPropagation\(\)[\s\S]{0,200}?setPointerCapture/.test(jsSrc));
ok('nhả tay: FLUSH giá trị cuối (không mất mức vừa chọn)',
  /dataset\.dragging = '0';[\s\S]{0,400}?apply\(queued, true\);/.test(jsSrc));
ok('fader dọc khi ô CAO hơn rộng (h > w -> data-orient="v")',
  /const orient = h > w \? 'v' : 'h';/.test(jsSrc));
ok('fader dọc: % tính từ ĐÁY ô (rect.bottom - clientY)', /rect\.bottom - clientY/.test(jsSrc));
ok('slider per-app: gom IPC theo 1 frame (requestAnimationFrame)',
  /requestAnimationFrame\(flushVolume\)/.test(jsSrc));
ok('ghi mức vào DOM qua đúng 1 hàm setFillPercent',
  /function setFillPercent\(/.test(jsSrc) && (jsSrc.match(/setFillPercent\(/g) || []).length >= 3);
ok('app 1x1: update() của app-slider gán class cỡ ô qua applyWidgetTier()',
  /function update\(el\)[\s\S]*?applyWidgetTier\(el, unit\);/.test(widgetSrc('app-slider.js')));
ok('đổi cỡ ô (resizestop) -> làm mới fader/cỡ ô',
  /grid\.on\('resizestop'[\s\S]{0,300}?scheduleSliderRefresh\(\);/.test(jsSrc));
ok('đổi cỡ cửa sổ -> scheduleSliderRefresh (gom 60ms -> refreshSliderLayouts)',
  /addEventListener\('resize', scheduleSliderRefresh\)/.test(jsSrc)
  && /function scheduleSliderRefresh\(\)[\s\S]{0,300}?refreshSliderLayouts\(\);[\s\S]{0,60}?\}, 60\);/.test(jsSrc));

/* ===================== 6. TÀN DƯ BẢN CŨ ===================== */
const stale = ['touch-track', 'touch-fill', 'vol-status-row', 'updateVolumeWidget'];
const foundStale = stale.filter((t) => html.includes(t) || jsSrc.includes(t));
ok('không còn tàn dư slider cũ', foundStale.length === 0, foundStale.join(', '));

/* ===================== 7. ĐỒNG HỒ / THỜI TIẾT / POMODORO ===================== */
ok('đồng hồ: ngày ngắn "Tx, dd/mm"', /return `\$\{weekday\}, \$\{day\}\/\$\{month\}`;/.test(jsSrc));
ok('đồng hồ digital: hero + số + chip giây + thanh quét có CSS',
  ['.clock-hero', '.clock-time', '.clock-secs-chip', '.clock-bar-fill'].every((c) => style.includes(c)));
ok('đồng hồ: chữ trắng tuyết có @supports background-clip:text',
  /@supports[^{]*background-clip[^{]*\{[\s\S]{0,200}?\.clock-time/.test(style));
/* Các kiểm tra của mặt THẺ LẬT + chuẩn hoá 3 kiểu mặt chỉ chạy khi nguồn có flip. */
if (hasFlip) {
ok('đồng hồ flip: 4 tấm lật + 2 lá lật/tấm đều có CSS',
  ['.flip-row', '.flip-card', '.flip-half', '.flip-fold-top', '.flip-fold-bottom',
    '.flip-digit'].every((c) => style.includes(c)));
ok('đồng hồ flip: mỗi tấm TỰ là container -> số đo theo chính bề ngang tấm',
  /\.flip-card\s*\{[^}]*container-type:\s*size/.test(style)
  && /\.flip-digit\s*\{[^}]*font-size:\s*min\(150cqw/.test(style));
ok('đồng hồ flip: 2 nhịp lật (trên 300ms, dưới trễ 300ms) + 2 @keyframes',
  /\.flip-card\.is-flipping > \.flip-fold-top\s*\{[^}]*flipFoldTop 300ms/.test(style)
  && /\.flip-card\.is-flipping > \.flip-fold-bottom\s*\{[^}]*flipFoldBottom 300ms ease-out 300ms/.test(style)
  && style.includes('@keyframes flipFoldTop') && style.includes('@keyframes flipFoldBottom'));
ok('đồng hồ flip: JS đổi đúng 4 tấm theo chuỗi số HH+MM 24 giờ (getHours)',
  /String\(now\.getHours\(\)\)\.padStart\(2, '0'\)[\s\S]{0,80}?String\(now\.getMinutes\(\)\)/.test(jsSrc)
  && /entry\.flipCards\.forEach\(\(card, index\) => setFlipCard\(card, digits\[index\]\)\)/.test(jsSrc));
ok('đồng hồ flip: đã bỏ hẳn 12 giờ/AM-PM (không còn trong JS lẫn CSS)',
  !jsSrc.includes('h12 = hours') && !jsSrc.includes('% 12 || 12')
  && !jsSrc.includes('flip-period')
  && !style.includes('.flip-period') && !style.includes('--flip-ink-dim'));
ok('đồng hồ flip: nửa dưới chỉ nhận số mới khi lá lật đáp xuống (animationend)',
  /function handleFlipAnimationEnd[\s\S]{0,300}?flip-fold-bottom[\s\S]{0,300}?bottom\.textContent = card\.dataset\.digit/
    .test(jsSrc));
ok('đồng hồ: 3 kiểu mặt chuẩn hoá qua normalizeClockFace (cả lúc lưu và lúc đọc)',
  /function normalizeClockFace\(value\)/.test(jsSrc)
  && /const face = normalizeClockFace\(raw\.face/.test(jsSrc)
  && /normalizeClockFace\(selClockFace\.value\)/.test(jsSrc));
ok('đồng hồ flip: phím tự nới tối thiểu 2x1 (Analog 2x2, Digital 1x1)',
  /const minW = clockFace === 'digital' \? 1 : 2;/.test(jsSrc)
  && /const minH = clockFace === 'analog' \? 2 : 1;/.test(jsSrc));
} else {
  skip('đồng hồ flip: CSS 4 tấm/2 lá lật + JS 24 giờ + chuẩn hoá 3 kiểu mặt');
}
ok('thời tiết: đơn vị °C nằm ở .weather-degree (có CSS)',
  /class="weather-degree">°C</.test(jsSrc) && style.includes('.weather-degree'));
ok('thời tiết ô 2x1: .is-short có bố cục riêng', /\.keycap-weather\.is-short \.weather-hero/.test(style));
ok('pomodoro: 5 giai đoạn cây (data-tree) có CSS + markup mặc định seed',
  ['seed', 'sprout', 'growing', 'full', 'dead']
    .every((t) => style.includes('.pomodoro-unit[data-tree="' + t + '"] .tree-' + t))
  && jsSrc.includes('data-tree="seed"'));
ok('pomodoro: 3 trạng thái + 2 pha có CSS riêng',
  ['idle', 'running', 'paused'].every((s) => style.includes('.pomodoro-unit[data-state="' + s + '"]'))
  && style.includes('.timer-progress.break'));

/* ===================== 8. FADER THỐNG NHẤT (B2/B3) ===================== */
ok('âm lượng: có thanh capsule .volume-track (không còn fill phủ kín keycap)',
  style.includes('.volume-track')
  && !/\.volume-deck-unit\s*\{[^}]*border-radius:\s*var\(--radius-key\)/.test(style));
ok('âm lượng + per-app: track CÙNG chiều cao (một ẩn dụ fader duy nhất)',
  /\.volume-track\s*\{[^}]*height:\s*min\(26px, 20cqh\)/.test(style)
  && /\.app-track\s*\{[^}]*height:\s*min\(26px, 20cqh\)/.test(style));
ok('cả 2 fader đều có NÚM capsule ở mép fill (::after bo 999px)',
  /\.volume-fill::after\s*\{[^}]*border-radius:\s*999px/.test(style)
  && /\.app-fill::after\s*\{[^}]*border-radius:\s*999px/.test(style));
ok('ô âm lượng dùng chung "màn hình" LCD (:is() có .volume-deck-unit)',
  /:is\([^)]*\.volume-deck-unit[^)]*\)\s*\{/.test(style));
ok('nút tắt/bật tiếng hệ thống dùng chung khối .app-icon-btn',
  /class="vol-icon app-icon-btn"/.test(jsSrc) && style.includes('.vol-icon'));
ok('trạng thái tắt tiếng của ô âm lượng có CSS (track xám + số % mờ)',
  style.includes('.volume-deck-unit.is-muted .volume-fill')
  && style.includes('.volume-deck-unit.is-muted .vol-number'));
ok('đang vuốt: tắt transition của cả 2 fill (fill bám đúng ngón tay)',
  /\[data-dragging="1"\]\s*\.volume-fill/.test(style)
  && /\[data-dragging="1"\]\s*\.app-fill/.test(style));
/* :hover trên keycap chỉ được nằm trong @media (hover: hover) and (pointer: fine). */
const HOVER_GATE = '@media (hover: hover) and (pointer: fine) {';
let ungatedStyle = style;
for (let at = ungatedStyle.indexOf(HOVER_GATE); at >= 0; at = ungatedStyle.indexOf(HOVER_GATE)) {
  let depth = 0;
  let end = at;
  for (; end < ungatedStyle.length; end++) {
    if (ungatedStyle[end] === '{') depth++;
    else if (ungatedStyle[end] === '}' && --depth === 0) break;
  }
  ungatedStyle = ungatedStyle.slice(0, at) + ungatedStyle.slice(end + 1);
}
ok('không còn :hover keycap ngoài @media (hover: hover) (tránh hover "dính" trên panel cảm ứng)',
  style.includes(HOVER_GATE) && !/\.grid-stack-item-content:hover/.test(ungatedStyle));
ok('đổi cỡ ô -> làm mới tier cho cả đồng hồ/thời tiết (không chờ tick)',
  /type === 'weather_widget' \|\| type === 'mini_clock'[\s\S]{0,200}?applyWidgetTier\(el, unit\);/.test(jsSrc));

/* ============== 9. CHỐNG CHẠM NHẦM + TẮT TIẾNG HỆ THỐNG (A4) ============== */
const dragFn = extractFnOrThrow('wireCapsuleDrag', widgetSrc('volume.js'));
ok('vuốt: có dead-zone DRAG_ENGAGE_PX (chạm lỡ KHÔNG làm nhảy âm lượng)',
  /const DRAG_ENGAGE_PX = 8;/.test(dragFn)
  && /Math\.hypot\(e\.clientX - downX, e\.clientY - downY\) < DRAG_ENGAGE_PX/.test(dragFn)
  && !/apply\(ratio, true\)/.test(dragFn));
ok('âm lượng hệ thống: bấm icon = tắt/bật tiếng THẬT (set_master_mute, GIỮ nguyên mức cũ)',
  /function setSystemMute\(muted\)/.test(jsSrc)
  && /invokeCmd\('set_master_mute', \{ muted \}\)/.test(jsSrc)
  && /const ok = await runtime\.setSystemMute\(!wasMuted\);/.test(jsSrc)
  && /if \(!ok\) setVolumeMuted\(unit, widgetEl, wasMuted\);/.test(jsSrc)
  /* chống hồi quy: KHÔNG được quay lại "mute giả" bằng set_volume 0 */
  && !/set_volume', wasMuted \? level : 0\)/.test(jsSrc));
ok('tắt tiếng: đổi HÌNH ngay (class is-muted + data-state) trước khi chờ IPC',
  /classList\.toggle\('is-muted', muted\)/.test(jsSrc)
  && /dataset\.state = muted \? 'muted'/.test(jsSrc));

/* ============== 10. FONT THUẦN VIỆT + TOKEN + GLOSS (P4/D1) ============== */
ok('font: có token --font-ui + --font-num (ưu tiên font Windows đủ dấu tiếng Việt)',
  /--font-ui:\s*"Segoe UI Variable Text", "Segoe UI"/.test(style)
  && /--font-num:\s*"JetBrains Mono", "Cascadia Mono", "Consolas"/.test(style));
ok('font: KHÔNG dùng font chỉ có trên macOS (-apple-system / BlinkMacSystemFont)',
  !/font-family:[^;]*?(apple-system|BlinkMacSystemFont)/.test(style));
ok('font: body dùng var(--font-ui); mọi dãy số dùng var(--font-num)',
  /body\s*\{[^}]*font-family:\s*var\(--font-ui\)/.test(style)
  && (style.match(/font-family:\s*var\(--font-num\)/g) || []).length >= 8
  && !/"SF Mono"/.test(style));
ok('font: số luôn tabular-nums (không "nhảy" chữ số khi giá trị đổi)',
  (style.match(/font-variant-numeric:\s*tabular-nums/g) || []).length >= 6);
ok('token: pha pomodoro + màu cảnh báo + lòng/viền track đều đã token hoá',
  ['--pomo-work:', '--pomo-break:', '--warn:', '--track-bg:', '--track-edge:'].every((t) => style.includes(t))
  && style.includes('var(--track-edge)') && style.includes('color: var(--warn)'));
ok('gloss: widget "màn hình" được giảm gloss (không "bẹt" mặt LCD)',
  /\[data-type="pomodoro"\][\s\S]{0,600}?::before\s*\{[\s\S]{0,60}?opacity:\s*0\.5/.test(style));
ok('layout mặc định: phím Task Manager không còn icon ⚙️ (tránh trùng phím Cài đặt)',
  !/icon: "⚙️", type: "launch_app"/.test(jsSrc));

/* ============== 11. CÀI ĐẶT DECK: KHÔNG CÒN PHÍM 1x1, VÀO QUA NHẤN GIỮ + THANH CÔNG CỤ ============== */
ok('cài đặt: không còn phím 1x1 "settings" (markup, CSS .settings-core/.settings-hint đã xoá)',
  !jsSrc.includes('settings-core') && !jsSrc.includes('settings-hint')
  && !style.includes('.settings-core') && !style.includes('.settings-hint'));
ok('cài đặt: thanh công cụ nổi #editToolbar có nút Cài đặt + Xong',
  /id="editToolbar"[\s\S]{0,400}?id="settingsOpenBtn"[\s\S]{0,200}?id="editDoneBtn"/.test(html));
ok('cài đặt: vào Edit Mode bằng nhấn giữ trên ô trống (long-press-entry.js)',
  existsSync(path.join(root, 'src', 'core', 'long-press-entry.js')));

/* ===== 12. CẤU HÌNH BUILD (Vite multi-page) + QUYỀN CỬA SỔ TO-DO =====
   Bản build chỉ chứa trang nào được khai trong rollupOptions.input; cửa sổ To-do
   do Rust mở bằng WebviewUrl::App("todo.html") nên THIẾU input đó = cửa sổ trắng.
   Cửa sổ không khớp capability nào thì bị chặn TOÀN BỘ IPC, kể cả command riêng
   của app -> nút "Xong" (close_todo_window) không chạy. */
const viteCfg = readFileSync(path.join(root, 'vite.config.js'), 'utf8');
const caps = JSON.parse(readFileSync(path.join(root, 'src-tauri', 'capabilities', 'default.json'), 'utf8'));
const libRs = readFileSync(path.join(root, 'src-tauri', 'src', 'lib.rs'), 'utf8');
const todoHtml = readFileSync(path.join(root, 'todo.html'), 'utf8');
ok('build: vite.config.js khai CẢ index.html lẫn todo.html (multi-page)',
  /input:\s*\{[\s\S]{0,240}?main:\s*'index\.html'/.test(viteCfg)
  && /todo:\s*'todo\.html'/.test(viteCfg));
const tauriCfg = JSON.parse(readFileSync(path.join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'));
const devUrlPort = (String(tauriCfg.build && tauriCfg.build.devUrl).match(/:(\d+)/) || [])[1];
ok('build: cổng dev server khớp devUrl (tauri.conf.json) + strictPort',
  (/const\s+DEV_PORT\s*=\s*1420/.test(viteCfg) || /port:\s*1420/.test(viteCfg))
  && /strictPort:\s*true/.test(viteCfg)
  && devUrlPort === '1420',
  'devUrl=' + (tauriCfg.build && tauriCfg.build.devUrl) + ' port tách được=' + devUrlPort);
ok('build: todo.html là trang Vite thật (script module -> /src/todo-store.js)',
  /<script type="module">/.test(todoHtml) && todoHtml.includes("/src/todo-store.js"));
ok('quyền: cửa sổ "todo" nằm trong capabilities/default.json (windows)',
  Array.isArray(caps.windows) && caps.windows.includes('main') && caps.windows.includes('todo'),
  'windows=' + JSON.stringify(caps.windows));
ok('quyền: cửa sổ To-do mở đúng nhãn + đúng file, có lệnh đóng riêng',
  /WebviewWindowBuilder::new\(&app, "todo", WebviewUrl::App\("todo\.html"\.into\(\)\)\)/.test(libRs)
  && /fn close_todo_window/.test(libRs) && /open_todo_window,/.test(libRs));
/* Có dist nghĩa là đã build -> bắt buộc phải có ĐỦ 2 trang (chưa build thì bỏ qua) */
const distBuilt = existsSync(path.join(root, 'dist', 'index.html'));
ok('build: dist có ĐỦ 2 trang (dist/todo.html) khi đã build',
  !distBuilt || existsSync(path.join(root, 'dist', 'todo.html')),
  distBuilt ? 'THIẾU dist/todo.html -> cửa sổ To-do sẽ trắng' : 'chưa build (bỏ qua)');

console.log('\n===== ' + pass + ' PASS / ' + fail + ' FAIL =====');
process.exit(fail === 0 ? 0 : 1);
