/* Kiểm tra nhanh dist: CSS inline + bundle JS có ĐỦ tính năng Weather Widget
   mới (skin / gradient spec / badge / cache / is-wide3 / animation).
   Chạy sau `vite build`: node scripts/_dist.mjs */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(root, 'dist');
const assets = readdirSync(path.join(distDir, 'assets'));
const html = readFileSync(path.join(distDir, 'index.html'), 'utf8');
const jsFile = assets.find((f) => /^main-.*\.js$/.test(f));
const js = readFileSync(path.join(distDir, 'assets', jsFile), 'utf8');

let bad = 0;
const check = (label, cond, extra = '') => {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + label + (cond || !extra ? '' : '  ::  ' + extra));
  if (!cond) bad++;
};

check('dist/index.html còn CSS inline của widget (không bị tách thiếu)', html.includes('wx-scrim'));
check('CSS: 6 nền gradient ĐÚNG bảng màu spec',
  ['#1e6fa8', '#3ea5e8', '#2b3947', '#455d73', '#0d6b63', '#189e82',
    '#301f5c', '#58338c', '#1b1642', '#392873', '#2a0b0b', '#451212']
    .every((c) => html.includes(c)));
check('CSS: 2 skin (soft mặc định + flat #111317) + lớp làm dịu 30%',
  html.includes('data-skin="flat"]') && html.includes('#111317') && /--wx-scrim: ?\.?0?\.?3\b/.test(html));
check('CSS: bố cục 4 vùng (wx-body/wx-divider/wx-meta/wx-art) + is-wide3',
  ['wx-body', 'wx-divider', 'wx-meta', 'wx-art', 'is-wide3'].every((c) => html.includes(c)));
check('CSS: animation vi mô (wxSpin 20s + wxFall + reduced-motion + idle 40%)',
  html.includes('@keyframes wxSpin') && html.includes('@keyframes wxFall')
  && html.includes('prefers-reduced-motion') && /body\.idle \.weather-unit\.keycap-weather/.test(html));
check('CSS: badge "DỮ LIỆU CŨ" + đang tải xoay mờ',
  html.includes('wx-badge') && html.includes('.keycap-weather.is-loading .weather-icon'));
check('HTML: dropdown Skin có cả 2 lựa chọn + ô API key',
  html.includes('id="selWeatherSkin"') && html.includes('value="soft"')
  && html.includes('value="flat"') && html.includes('id="inpWeatherKey"'));
check('JS bundle: gradient minh hoạ + tier is-wide3 + chống dội 1200ms',
  js.includes('wxg-') && js.includes('is-wide3') && js.includes('1200'));
check('JS bundle: cache LocalStorage + ngưỡng CŨ 30 phút (18e5 ms)',
  js.includes('STREAMDECK_VK02_WEATHER_CACHE') && (js.includes('18e5') || js.includes('1800000')));
check('JS bundle: gọi Rust get_weather_data + trạng thái đang tải',
  js.includes('get_weather_data') && js.includes('is-loading'));
check('JS bundle: có badge tiếng Việt "DỮ LIỆU CŨ"',
  js.includes('DỮ LIỆU CŨ'));
check('JS bundle: phím mẫu thời tiết đặt 3x1 + skin mặc định "soft"',
  /w:3,h:1[^}]{0,120}?weather_widget/.test(js) && js.includes('skin:`soft`'));

console.log(bad === 0 ? '\nDIST OK' : '\nDIST CÓ LỖI: ' + bad);
process.exit(bad === 0 ? 0 : 1);
