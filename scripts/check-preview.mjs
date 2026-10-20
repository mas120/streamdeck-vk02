/* Kiểm tra file .devtmp/preview.html sinh ra có đúng nội dung mong đợi.
   Chạy `npm run preview` trước nếu chưa có file. */
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { root, jsSrc } from './_sources.mjs';

const file = path.join(root, '.devtmp', 'preview.html');
if (!existsSync(file)) {
  console.error('Chưa có .devtmp/preview.html — chạy `npm run preview` trước.');
  process.exit(1);
}
const h = readFileSync(file, 'utf8');
const q = String.fromCharCode(34);
/* Mặt THẺ LẬT là tính năng tuỳ chọn -> chỉ kiểm tra khi nguồn thực sự có. */
const hasFlip = /function\s+clockFlipMarkup\s*\(/.test(jsSrc);
const skip = (label) => console.log('SKIP  ' + label + '  (nguồn không có mặt thẻ lật)');

let bad = 0;
const check = (label, cond, extra = '') => {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + label + (cond || !extra ? '' : '  ::  ' + extra));
  if (!cond) bad++;
};

check('có icon mặt trăng (ô ban đêm)', h.includes('wx-moon'));
check('có icon mặt trời (ô ban ngày)', h.includes('wx-sun'));
check('có đủ 8 nhóm tông màu', ['sun', 'partly', 'cloud', 'fog', 'drizzle', 'rain', 'snow', 'storm', 'error']
  .every((t) => h.includes('data-tint=' + q + t + q)));
check('có ô trạng thái lỗi + chữ nói rõ lý do ngay trên ô',
  h.includes('is-error') && h.includes('weather-cond">CHƯA KẾT NỐI'));
check('ô ĐANG TẢI: "--°C" + minh hoạ xoay mờ (.is-loading), chữ "Đang tải…"',
  h.includes('keycap-weather is-short is-wide3 is-loading')
  && h.includes('weather-cond">Đang tải…') && h.includes('is-loading .weather-icon'));
const ticks = (h.match(/class="clock-tick/g) || []).length;
check('2 mặt analog x 60 vạch', ticks === 120, 'thực tế=' + ticks);
check('có container query', h.includes('container-type: size') && h.includes('cqw'));
/* --- ĐỒNG HỒ FLIP: 4 tấm lật/cỡ ô x 4 cỡ ô (24 giờ, không nhãn AM/PM) --- */
if (hasFlip) {
const flipCards = (h.match(/class="flip-card"/g) || []).length;
check('đồng hồ flip: 4 tấm x 4 cỡ ô = 16 tấm lật', flipCards === 16, 'thực tế=' + flipCards);
check('đồng hồ flip: có 2 lá lật + CSS 2 nhịp lật, KHÔNG còn AM/PM',
  h.includes('flip-fold-top') && h.includes('flip-fold-bottom')
  && !h.includes('flip-period') && h.includes('@keyframes flipFoldBottom'));
} else {
  skip('đồng hồ flip: 16 tấm lật + 2 lá lật/cỡ ô');
}
/* --- GLANCEABLE: ô chỉ còn SỐ + MÀU + GLYPH (không câu chữ tĩnh) --- */
/* Đếm đúng MARKUP ô (không đếm selector CSS cũng chứa data-type="pomodoro") */
const pomoCells = (h.match(/class="grid-stack-item" data-type="pomodoro"/g) || []).length;
check('6 ô pomodoro (2 pha x 3 trạng thái)', pomoCells === 6, 'thực tế=' + pomoCells);
check('pomodoro đủ 3 trạng thái + 2 pha',
  ['idle', 'running', 'paused'].every((s) => h.includes('data-state=' + q + s + q))
  && h.includes('data-mode=' + q + 'work' + q) && h.includes('data-mode=' + q + 'break' + q));
check('vòng tiến độ pomodoro được set dashoffset theo tỉ lệ',
  (h.match(/stroke-dashoffset:\d/g) || []).length >= 6);
check('pomodoro giữ nhãn pha/trạng thái ở lớp ẩn .pomo-sr',
  h.includes('pomo-sr pomodoro-mode') && h.includes('pomo-sr pomodoro-state'));
const wxTiers = (h.match(/keycap-weather is-(mini|short|big|tall)/g) || []).length;
check('ô thời tiết gán đúng cỡ (is-mini/is-short/is-big/is-tall + is-wide3 cho 3x1)',
  wxTiers >= 12, 'thực tế=' + wxTiers);
check('ô 3x1 (mặc định) có đủ 4 vùng: vạch ngăn + ngày + ghim TP + minh hoạ',
  h.includes('keycap-weather is-short is-wide3')
  && h.includes('class="wx-divider"') && h.includes('class="wx-body"')
  && h.includes('class="wx-art"')
  && /class="weather-date">(CN|T2|T3|T4|T5|T6|T7), \d{2}\/\d{2}</.test(h)
  && h.includes('wx-glyph-pin'));
check('2 skin: gradient Màu dịu (mặc định) + Phẳng #111317',
  (h.match(/data-skin="soft"/g) || []).length >= 8
  && h.includes('data-skin="flat"')
  && h.includes('.keycap-weather[data-skin="flat"]    { --wx-bg: #111317; }'));
check('lỗi mạng = ICON cảnh báo + tông đỏ; chữ trên ô nói rõ "CHƯA KẾT NỐI"',
  h.includes('wx-svg-warn') && h.includes('data-tint="error"'));
check('badge "DỮ LIỆU CŨ" có mặt (ô mất mạng > 30 phút)',
  h.includes('class="wx-badge"') && h.includes('DỮ LIỆU CŨ'));
check('minh hoạ dùng gradient <defs> + lớp động .wx-anim',
  h.includes('<linearGradient') && h.includes('wx-anim-spin') && h.includes('wx-anim-fall'));
check('chữ "LÀM VIỆC/ĐANG CHẠY/km/h" không hiện trên mặt ô',
  !h.includes('weather-extra') && !h.includes('km/h<'));
check('không tham chiếu file ngoài', !/<script src|<link /.test(h));
check('có CSS của app (LCD + weather)', h.includes(':is(.deck-icon-core') && h.includes('[data-night=' + q + '1' + q + ']'));
/* --- FADER ÂM LƯỢNG capsule thống nhất (B2/B3) --- */
const volCells = (h.match(/class="grid-stack-item" data-type="volume_slider"/g) || []).length;
check('có ô âm lượng capsule ở 3 cỡ + ô tắt tiếng (1x1/2x1/1x2/muted)', volCells === 4,
  'thực tế=' + volCells);
check('fader: có thanh capsule + núm + nhánh DỌC trong preview',
  h.includes('volume-track') && h.includes('volume-fill')
  && h.includes('data-orient=' + q + 'v' + q) && h.includes('volume-deck-unit is-muted'));
/* --- PHÍM "CÀI ĐẶT DECK" 1x1: mặt phím không còn chữ --- */
const setCells = (h.match(/class="grid-stack-item" data-type="settings"/g) || []).length;
check('có 2 ô Cài đặt 1x1 (bình thường / đang chỉnh sửa)', setCells === 2, 'thực tế=' + setCells);
check('ô Cài đặt: KHÔNG còn chữ "NHẤP ĐÔI" trên mặt ô + không còn CSS .settings-hint',
  !h.includes('settings-hint') && !/>NHẤP ĐÔI</.test(h) && h.includes('settings-ring-progress'));
check('ô Cài đặt: vòng trạng thái được đặt dashoffset theo tỉ lệ giữ (đúng 2 ô)',
  (h.match(/settings-ring-progress" style="stroke-dashoffset:/g) || []).length === 2,
  'thực tế=' + (h.match(/settings-ring-progress" style="stroke-dashoffset:/g) || []).length);
console.log('kích thước: ' + Math.round(statSync(file).size / 1024) + ' kB');
console.log(bad === 0 ? '\nPREVIEW OK' : '\nPREVIEW CÓ LỖI: ' + bad);
process.exit(bad === 0 ? 0 : 1);
