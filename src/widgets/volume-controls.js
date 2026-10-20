import { clampInt } from '../core/utils.js';

export function volumeValueFromKey(value, key, shiftKey = false) {
  const current = clampInt(value, 0, 100, 50);
  const step = shiftKey ? 5 : 1;
  if (key === 'ArrowRight' || key === 'ArrowUp') return Math.min(100, current + step);
  if (key === 'ArrowLeft' || key === 'ArrowDown') return Math.max(0, current - step);
  if (key === 'PageUp') return Math.min(100, current + 10);
  if (key === 'PageDown') return Math.max(0, current - 10);
  if (key === 'Home') return 0;
  if (key === 'End') return 100;
  return null;
}
