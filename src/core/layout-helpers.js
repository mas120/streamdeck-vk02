import { COLS, ROWS } from './grid.js';
import { clampInt } from './utils.js';
import { parseClockCfg } from '../widgets/clock.js';
import { parseWeatherCfg } from '../widgets/weather.js';

/** Bảng đánh dấu ô đã bị chiếm để tìm chỗ trống. */
export function buildOccupancyMap(grid) {
  const map = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  grid.engine.nodes.forEach((node) => {
    for (let y = node.y; y < node.y + node.h; y++) {
      for (let x = node.x; x < node.x + node.w; x++) {
        if (map[y] && map[y][x] !== undefined) map[y][x] = true;
      }
    }
  });
  return map;
}

/** Tìm vị trí trống đầu tiên cho widget kích thước w x h. */
export function findFreeSlot(grid, w, h) {
  const map = buildOccupancyMap(grid);
  const W = Math.min(Math.max(1, w), COLS);
  const H = Math.min(Math.max(1, h), ROWS);
  for (let y = 0; y <= ROWS - H; y++) {
    for (let x = 0; x <= COLS - W; x++) {
      let free = true;
      for (let yy = y; yy < y + H && free; yy++) {
        for (let xx = x; xx < x + W; xx++) {
          if (map[yy][xx]) {
            free = false;
            break;
          }
        }
      }
      if (free) return { x, y };
    }
  }
  return { x: 0, y: 0 };
}

/** Giới hạn w x h theo vùng trống liền kề bắt đầu từ ô (x,y). */
export function fitToFree(grid, x, y, w, h) {
  const map = buildOccupancyMap(grid);
  let W = 1;
  while (W < w && x + W < COLS && !map[y][x + W]) W++;
  let H = 1;
  while (H < h && y + H < ROWS) {
    let rowFree = true;
    for (let xx = x; xx < x + W; xx++)
      if (map[y + H][xx]) {
        rowFree = false;
        break;
      }
    if (!rowFree) break;
    H++;
  }
  return { w: W, h: H };
}

/** Một phím -> object layout; dùng chung cho lưu layout và snapshot Hoàn tác. */
export function serializeNode(node) {
  const el = node.el;
  const item = {
    x: node.x,
    y: node.y,
    w: node.w,
    h: node.h,
    icon: el.dataset.icon || '⏹️',
    type: el.dataset.type || 'open_url',
    target: el.dataset.target || '',
  };
  if (el.dataset.icon2x) item.icon2x = el.dataset.icon2x;
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
      savedAt: Date.now(),
    };
  }
  // Widget "sống" (đồng hồ / thời tiết): lưu cấu hình để khôi phục đúng kiểu mặt / toạ độ.
  if (item.type === 'mini_clock') item.cfg = parseClockCfg(el);
  if (item.type === 'weather_widget') item.cfg = parseWeatherCfg(el);
  return item;
}
