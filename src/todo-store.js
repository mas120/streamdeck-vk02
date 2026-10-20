/* Kho dữ liệu To-do dùng chung cho deck (main.js) và cửa sổ soạn việc (todo.html).
   Hai cửa sổ cùng origin nên dùng chung localStorage; sự kiện 'storage' báo cho
   deck biết khi cửa sổ kia vừa lưu. */
export const TODO_KEY = 'STREAMDECK_VK02_TODO';

export function loadTodos() {
  try {
    const d = JSON.parse(localStorage.getItem(TODO_KEY) || '{}');
    const items = Array.isArray(d.items) ? d.items : [];
    return items
      .filter((i) => i && typeof i.text === 'string')
      .map((i, idx) => ({ id: String(i.id || `legacy-${idx}`), text: i.text, done: !!i.done }));
  } catch (_) { return []; }
}

export function saveTodos(items) {
  const clean = items.map(({ id, text, done }) => ({ id, text: String(text).slice(0, 200), done: !!done }));
  try {
    localStorage.setItem(TODO_KEY, JSON.stringify({ v: 1, items: clean }));
  } catch (err) {
    console.warn('Không lưu được danh sách việc:', err);
  }
}
