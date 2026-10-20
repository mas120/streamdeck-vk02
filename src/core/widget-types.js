import { COLS, ROWS } from './grid.js';

const DEFAULT_ICONS = {
  pomodoro: '🍅',
  mini_clock: '🕐',
  weather_widget: '🌤️',
  todo_list: '✅',
  bongo_cat: '🐈',
  mic_widget: '🎙️',
  media_player: '🎵',
  music_wave: '🎵',
  shutdown_widget: '⏻',
};

/** Icon mặc định khi người dùng để trống ô Biểu tượng. */
export function defaultIconForType(type, fallback = '⏹️') {
  return DEFAULT_ICONS[type] || fallback;
}

/* Cỡ mặc định theo loại: Thời tiết 3x1, Pomodoro/To-do 2x2, slider 2x1, Bongo 2x1|2x2,
   Đồng hồ Digital 1x1 / Thẻ lật 2x1 / Analog 2x2, còn lại 1x1. */
export function defaultSize(type, { clockFace, bongoSize, weatherMinW = 3 } = {}) {
  let size;
  switch (type) {
    case 'weather_widget':
      size = [weatherMinW, 1];
      break;
    case 'pomodoro':
    case 'todo_list':
      size = [2, 2];
      break;
    case 'app_slider':
    case 'volume_slider':
      size = [2, 1];
      break;
    case 'bongo_cat':
      size = [2, bongoSize === '2x2' ? 2 : 1];
      break;
    case 'mic_widget':
      size = [1, 1];
      break;
    case 'shutdown_widget':
      size = [1, 1];
      break;
    case 'media_player':
      size = [3, 1];
      break;
    case 'music_wave':
      size = [3, 1];
      break;
    case 'mini_clock':
      size = clockFace === 'analog' ? [2, 2] : clockFace === 'flip' ? [2, 1] : [1, 1];
      break;
    default:
      size = [1, 1];
  }
  return { w: Math.min(size[0], COLS), h: Math.min(size[1], ROWS) };
}
