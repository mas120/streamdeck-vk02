import { TODO_KEY, loadTodos, saveTodos } from '../todo-store.js';
import { widgetRegistry } from '../core/widget-registry.js';

export function createTodoWidget({
  applyWidgetTier,
  escapeHtml,
  isDeckPaused,
  getTauri,
  invokeCmd,
}) {
  function toggleItem(id, row) {
    const items = loadTodos();
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) return;
    const completing = !items[index].done;
    items[index].done = !items[index].done;
    const commit = () => {
      saveTodos(items);
      updateAll();
    };
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (completing && row && !reduceMotion) {
      row.classList.add('is-completing');
      setTimeout(commit, 160);
    } else {
      commit();
    }
  }

  function markup() {
    return `
      <div class="todo-unit" data-state="empty">
        <div class="todo-head">
          <span class="todo-title">Việc cần làm</span>
          <span class="todo-count"></span>
          <button class="todo-add" type="button" aria-label="Mở danh sách việc" title="Mở danh sách việc"><span aria-hidden="true">+</span></button>
        </div>
        <div class="todo-progress" aria-hidden="true"><span class="todo-progress-fill"></span></div>
        <ul class="todo-list"></ul>
        <div class="todo-empty">Chạm để thêm việc</div>
        <div class="todo-mini"><b class="todo-left">0</b><span>việc</span></div>
      </div>`;
  }

  function register(el) {
    const unit = el.querySelector('.todo-unit');
    if (!unit) return null;
    return {
      el,
      unit,
      count: unit.querySelector('.todo-count'),
      left: unit.querySelector('.todo-left'),
      list: unit.querySelector('.todo-list'),
      progress: unit.querySelector('.todo-progress-fill'),
    };
  }

  function setup(el) {
    const unit = el.querySelector('.todo-unit');
    if (!unit) return;
    if (el.__todoClickHandler && el.__todoClickUnit === unit) return;
    if (el.__todoClickHandler && el.__todoClickUnit) {
      el.__todoClickUnit.removeEventListener('click', el.__todoClickHandler);
    }
    el.__todoClickHandler = (event) => {
      const addButton = event.target.closest('.todo-add');
      if (addButton) {
        event.stopPropagation();
        openEditor();
        return;
      }
      const item = event.target.closest('.todo-item');
      if (!item || !unit.contains(item) || item.classList.contains('is-completing')) return;
      event.stopPropagation(); // không để click nổi lên ô và mở bảng soạn việc
      toggleItem(item.dataset.id, item);
    };
    el.__todoClickUnit = unit;
    unit.addEventListener('click', el.__todoClickHandler);
  }

  function update(entry, force = false) {
    if (!entry) return;
    const { el, unit, count, left: leftValue, list, progress } = entry;
    applyWidgetTier(el, unit);
    const raw = localStorage.getItem(TODO_KEY) || '';
    if (!force && el.__todoRaw === raw) return;
    el.__todoRaw = raw;
    const items = loadTodos();
    const done = items.filter((item) => item.done).length;
    const remaining = items.length - done;
    if (progress) progress.style.width = items.length ? `${(done / items.length) * 100}%` : '0%';
    unit.dataset.state = !items.length ? 'empty' : remaining === 0 ? 'clear' : 'open';
    count.textContent = items.length ? `${done}/${items.length}` : '';
    leftValue.textContent = String(remaining);
    const ordered = items.filter((item) => !item.done).concat(items.filter((item) => item.done));
    list.innerHTML = ordered
      .map(
        (item) =>
          `<li class="todo-item${item.done ? ' done' : ''}" data-id="${escapeHtml(String(item.id))}"><i class="todo-box"></i><span>${escapeHtml(item.text)}</span></li>`
      )
      .join('');
    unit.title = items.length
      ? `${remaining} việc còn lại · ${done}/${items.length} đã xong`
      : 'Chạm để thêm việc';
  }

  function updateAll() {
    if (isDeckPaused()) return;
    document
      .querySelectorAll('.grid-stack-item[data-type="todo_list"]')
      .forEach((el) => update(register(el)));
  }

  async function openEditor() {
    if (getTauri()) {
      try {
        await invokeCmd('open_todo_window');
        return true;
      } catch (err) {
        console.warn('open_todo_window lỗi, thử fallback browser:', err);
      }
    }
    try {
      const popup = window.open(
        'todo.html',
        'todo-editor',
        'width=460,height=640,resizable=yes,scrollbars=yes'
      );
      if (popup) popup.focus();
      return true;
    } catch (err) {
      console.error('Không mở được cửa sổ To Do:', err);
      return true;
    }
  }

  function destroy(el) {
    if (el.__todoClickUnit && el.__todoClickHandler) {
      el.__todoClickUnit.removeEventListener('click', el.__todoClickHandler);
    }
    delete el.__todoClickUnit;
    delete el.__todoClickHandler;
    delete el.__todoRaw;
  }

  return {
    type: 'todo_list',
    markup,
    setup,
    register,
    update,
    destroy,
    updateAll,
    openEditor,
    storageKey: TODO_KEY,
  };
}

widgetRegistry.registerWidget({
  type: 'todo_list',
  label: 'Việc cần làm',
  icon: '📝',
  defaultSize: [2, 2],
  create: ({ el, services }) => {
    const widget = services.todoWidget;
    return {
      markup: widget.markup(),
      setup: () => {
        widget.setup(el);
        widget.update(widget.register(el), true);
      },
      destroy: () => widget.destroy(el),
    };
  },
});
