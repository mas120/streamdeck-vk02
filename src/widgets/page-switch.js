/**
 * Phím chuyển trang: hiện "trang hiện tại / tổng" + chấm + tên trang.
 * Chạm ở Run Mode -> sang trang kế (vòng lại trang đầu). Ở Edit Mode không đổi
 * trang để còn sửa phím.
 */
import { isEditMode } from '../core/mode-manager.js';
import { widgetRegistry } from '../core/widget-registry.js';
import { escapeHtml } from '../core/utils.js';
import '../styles/widgets/page-switch.css';

export function pageSwitchMarkup(pages = [], activeId = '') {
  const list = Array.isArray(pages) && pages.length ? pages : [{ id: 'p', name: 'Trang 1' }];
  const found = list.findIndex((page) => page.id === activeId);
  const index = found < 0 ? 0 : found;
  const dots = list
    .map((_, i) => `<span class="ps-dot${i === index ? ' is-on' : ''}"></span>`)
    .join('');
  return `
    <div class="page-switch-unit" data-index="${index + 1}" data-count="${list.length}">
      <div class="ps-count"><strong>${index + 1}</strong><span>/${list.length}</span></div>
      <div class="ps-dots">${dots}</div>
      <div class="ps-name">${escapeHtml(list[index]?.name || '')}</div>
    </div>`;
}

widgetRegistry.registerWidget({
  type: 'page_switch',
  label: 'Chuyển trang',
  icon: '📄',
  defaultSize: [1, 1],
  fixedSize: true,
  create: ({ el, content, services }) => {
    const pages = services.deckPages;
    const unit = () => el.querySelector('.page-switch-unit');
    return {
      markup: pageSwitchMarkup(pages?.list?.() || [], pages?.activeId?.() || ''),
      setup: () => {
        const node = unit();
        if (!node) return;
        node.addEventListener('pointerdown', (event) => {
          if (isEditMode) return;
          event.preventDefault();
          event.stopPropagation();
          services.switchPage?.('next');
        });
      },
    };
  },
});
