import 'gridstack/dist/gridstack.min.css';
import { GridStack } from 'gridstack';

export const COLS = 8;
export const ROWS = 5;
export const MARGIN = 8;
export const STORAGE_KEY = 'STREAMDECK_VK02_LAYOUT';

let grid = null;
export const getGrid = () => grid;

export function getExactCellHeight() {
  return window.innerHeight / ROWS;
}

export function initGrid() {
  grid = GridStack.init({
    column: COLS,
    row: ROWS,
    maxRow: ROWS,
    cellHeight: getExactCellHeight(),
    margin: MARGIN,
    float: true,
    disableDrag: true,
    disableResize: true,
    animate: true,
    resizable: { handles: 'se' },
    draggable: { handle: '.drag-handle' },
  });
  return grid;
}

export function initBackdrop() {
  let renderQueued = false;
  const scheduleRender = () => {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      renderExactBackdrop();
    });
  };

  const renderExactBackdrop = () => {
    const backdrop = document.getElementById('deckBackdrop');
    if (!backdrop || !grid) return;

    const cellW = grid.cellWidth();
    const cellH = grid.getCellHeight();
    const margin = typeof grid.opts.margin === 'number' ? grid.opts.margin : MARGIN;
    if (!cellW || !cellH) return;

    const fragment = document.createDocumentFragment();
    for (let row = 0; row < ROWS; row++) {
      for (let column = 0; column < COLS; column++) {
        const slot = document.createElement('div');
        slot.className = 'slot-cell';
        slot.style.left = `${column * cellW + margin}px`;
        slot.style.top = `${row * cellH + margin}px`;
        slot.style.width = `${cellW - 2 * margin}px`;
        slot.style.height = `${cellH - 2 * margin}px`;
        fragment.appendChild(slot);
      }
    }
    backdrop.replaceChildren(fragment);
  };

  requestAnimationFrame(scheduleRender);
  setTimeout(scheduleRender, 120);
  let resizeFrame = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      grid.cellHeight(getExactCellHeight());
      scheduleRender();
    });
  });
  return scheduleRender;
}
