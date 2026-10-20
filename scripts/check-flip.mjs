/* Kiểm chứng HÀNH VI của mặt đồng hồ THẺ LẬT (flip) — chạy cuối chuỗi
   `npm run check`. Khác các suite khác (chỉ soi markup/CSS tĩnh), suite này lấy
   NGUYÊN mã setFlipCard() + listener animationend từ src/widgets/clock.js rồi chạy trên
   DOM giả tối thiểu để bắt lỗi THỨ TỰ gán số (nửa trên ăn số mới ngay, nửa
   dưới giữ số cũ tới khi lá lật đáp xuống) — lỗi mà test tĩnh không thấy được. */
import fs from 'node:fs';

const clockSrc = fs.readFileSync(new URL('../src/widgets/clock.js', import.meta.url), 'utf8');
let pass = 0; let fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (extra ? ' -> ' + extra : '')); }
};

/* --- 1. Lấy hàm setFlipCard(card, next) nguyên bản từ widgets/clock.js --- */
const s = clockSrc.indexOf('function setFlipCard(card, next) {');
const e = clockSrc.indexOf('\n}', s);
if (s < 0 || e < 0) throw new Error('Không tìm thấy setFlipCard trong widgets/clock.js');
const setFlipCard = new Function('return (' + clockSrc.slice(s, e + 2) + ')')();
const animationFrames = [];
globalThis.requestAnimationFrame = (callback) => animationFrames.push(callback);
function flushAnimationFrames() {
  while (animationFrames.length) animationFrames.shift()();
}

/* --- 2. Lấy nguyên listener animationend trong setupClockWidget --- */
const h = clockSrc.match(/function handleFlipAnimationEnd\(event\) \{[\s\S]*?\n\}/);
if (!h) throw new Error('Không tìm thấy handler animationend trong clock module');
const animationEndHandler = new Function('return (' + h[0] + ')')();
const fakeContent = { cb: animationEndHandler };
ok('animationend: dùng handler thật từ clock component', typeof fakeContent.cb === 'function');

/* --- DOM giả: 1 tấm thẻ gồm 4 lớp số --- */
const classListOf = () => {
  const set = new Set();
  return { has: (c) => set.has(c), add: (c) => set.add(c), remove: (c) => set.delete(c) };
};
function makeCard() {
  const digit = () => ({ textContent: '' });
  const parts = {
    '.flip-top > .flip-digit': digit(),
    '.flip-fold-top > .flip-digit': digit(),
    '.flip-fold-bottom > .flip-digit': digit(),
    '.flip-bottom > .flip-digit': digit(),
  };
  const card = {
    dataset: {}, offsetWidth: 100, parts,
    classList: classListOf(),
    querySelector: (sel) => parts[sel] || null,
  };
  card.parts = parts;
  return card;
}
const txt = (card) => Object.fromEntries(
  Object.entries(card.parts).map(([k, v]) => [k.split(' > ')[0].slice(1), v.textContent]));

/* --- 3. Lần vẽ ĐẦU (chưa có dataset.digit): đặt số, KHÔNG lật --- */
const c = makeCard();
setFlipCard(c, '0');
ok('lần đầu: 4 lớp đều là số 0 + dataset.digit=0',
  JSON.stringify(txt(c)) === JSON.stringify({
    'flip-top': '0', 'flip-fold-top': '0', 'flip-fold-bottom': '0', 'flip-bottom': '0',
  }) && c.dataset.digit === '0', JSON.stringify(txt(c)) + ' digit=' + c.dataset.digit);
ok('lần đầu: KHÔNG thêm .is-flipping (không lật khi mới dựng ô)',
  !c.classList.has('is-flipping'));

/* --- 4. Số KHÔNG đổi: không lật lại --- */
setFlipCard(c, '0');
ok('số không đổi: không thêm .is-flipping', !c.classList.has('is-flipping'));

/* --- 5. Đổi số: đúng thứ tự 2 nửa + bật animation --- */
setFlipCard(c, '1');
flushAnimationFrames();
const t = txt(c);
ok('đổi 0->1: nửa TRÊN tĩnh = số MỚI (hiện ngay)', t['flip-top'] === '1', t['flip-top']);
ok('đổi 0->1: lá TRÊN = số CŨ (lật đi) + lá DƯỚI = số MỚI (chờ đáp)',
  t['flip-fold-top'] === '0' && t['flip-fold-bottom'] === '1',
  t['flip-fold-top'] + '/' + t['flip-fold-bottom']);
ok('đổi 0->1: nửa DƯỚI tĩnh VẪN số CŨ (chưa đáp xuống)', t['flip-bottom'] === '0', t['flip-bottom']);
ok('đổi 0->1: có .is-flipping để CSS chạy 2 nhịp lật', c.classList.has('is-flipping'));
ok('đổi 0->1: dataset.digit đã là 1', c.dataset.digit === '1');

/* --- 6. animationend của lá TRÊN: chưa được đổi nửa dưới --- */
const fakeEl = (cls) => ({ classList: { contains: (x) => x === cls }, closest: () => c });
fakeContent.cb({ target: fakeEl('flip-fold-top') });
ok('animationend lá TRÊN: nửa dưới vẫn số CŨ + vẫn đang lật',
  txt(c)['flip-bottom'] === '0' && c.classList.has('is-flipping'));

/* --- 7. animationend của lá DƯỚI: nửa dưới nhận số mới + gỡ .is-flipping --- */
fakeContent.cb({ target: fakeEl('flip-fold-bottom') });
ok('animationend lá DƯỚI: nửa DƯỚI nhận số MỚI (thẻ lật đã đáp)',
  txt(c)['flip-bottom'] === '1', txt(c)['flip-bottom']);
ok('animationend lá DƯỚI: gỡ .is-flipping (sẵn sàng lần lật kế tiếp)',
  !c.classList.has('is-flipping'));
ok('kết thúc 1 nhịp: 2 nửa tĩnh đều là 1 (khớp nhau ở khe giữa)',
  txt(c)['flip-top'] === '1' && txt(c)['flip-bottom'] === '1');

/* --- 8. Lật liên tiếp (giây thứ 2 của cùng phút -> 9) --- */
setFlipCard(c, '9');
flushAnimationFrames();
fakeContent.cb({ target: fakeEl('flip-fold-bottom') });
ok('lật tiếp 1->9: cả 2 nửa tĩnh = 9, hết lật',
  txt(c)['flip-top'] === '9' && txt(c)['flip-bottom'] === '9' && !c.classList.has('is-flipping'));

/* --- 9. Mặt 24 giờ: chuỗi số lấy từ getHours() (không h12/AM-PM) --- */
ok('clock.js: chuỗi 4 tấm lấy từ getHours()+getMinutes() (mặt 24 giờ)',
  /String\(now\.getHours\(\)\)\.padStart\(2, '0'\)[\s\S]{0,80}?String\(now\.getMinutes\(\)\)/.test(clockSrc));
ok('clock.js: KHÔNG còn công thức quy đổi 12 giờ (h12 / %12 / isPm)',
  !/\bh12\b|%\s*12\b|amPm|isPm/.test(clockSrc));
const flipStart = clockSrc.indexOf('function clockFlipMarkup(label) {');
if (flipStart < 0) throw new Error('Không tìm thấy clockFlipMarkup trong widgets/clock.js');
const flipMarkup = clockSrc.slice(flipStart, clockSrc.indexOf('\n}', flipStart));
ok('markup flip: không có nhãn AM/PM (chỉ markup, không tính ghi chú)',
  !/>\s*AM\s*<|>\s*PM\s*<|AM\/PM|am-pm/.test(flipMarkup));

console.log('\n===== flip logic: ' + pass + ' PASS / ' + fail + ' FAIL =====');
process.exitCode = fail ? 1 : 0;
