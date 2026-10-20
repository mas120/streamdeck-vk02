/**
 * Bộ đệm lỗi chạy trong bộ nhớ (ring buffer) để xuất chẩn đoán khi cần.
 * Không ghi file, không gửi mạng — P0-4 sẽ đọc qua `diagnostics.format()`.
 */

const DEFAULT_LIMIT = 200;

/** Chuyển mọi kiểu giá trị sang chuỗi an toàn (không ném lỗi). */
function stringifyValue(value) {
  if (value instanceof Error) return value.stack || `${value.name}: ${value.message}`;
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return String(value);
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch (_) {
      return Object.prototype.toString.call(value);
    }
  }
  return String(value);
}

/**
 * Tạo ring buffer độc lập (dùng được trong test, không phụ thuộc DOM).
 * @param {{ limit?: number, now?: () => number }} [options]
 */
export function createDiagnostics({ limit = DEFAULT_LIMIT, now = () => Date.now() } = {}) {
  const entries = [];

  function record(kind, message, detail = '') {
    const entry = {
      at: now(),
      kind: String(kind || 'log'),
      message: stringifyValue(message),
      detail: detail ? stringifyValue(detail) : '',
    };
    entries.push(entry);
    if (entries.length > limit) entries.splice(0, entries.length - limit);
    return entry;
  }

  function list() {
    return entries.slice();
  }

  function clear() {
    entries.length = 0;
  }

  function format({ title = '' } = {}) {
    const lines = [];
    if (title) lines.push(title);
    lines.push(`Số bản ghi: ${entries.length}/${limit}`);
    for (const entry of entries) {
      lines.push(`[${new Date(entry.at).toISOString()}] ${entry.kind.toUpperCase()}: ${entry.message}`);
      if (entry.detail) {
        lines.push(...entry.detail.split('\n').map((line) => `    ${line}`));
      }
    }
    return lines.join('\n');
  }

  return { record, list, clear, format, limit };
}

export const diagnostics = createDiagnostics();

let installed = false;

/**
 * Gắn bắt lỗi vào window/console. Gọi đúng một lần trước khi bootstrap app.
 * @param {object} [scope] giả lập được trong test: { window, console }
 */
export function installDiagnostics(scope = globalThis) {
  if (installed || !scope) return diagnostics;
  installed = true;

  const win = scope.window || (typeof scope.addEventListener === 'function' ? scope : null);
  const con = scope.console;

  if (win && typeof win.addEventListener === 'function') {
    win.addEventListener('error', (event) => {
      if (!event) return;
      const message = event.message || (event.error && event.error.message) || 'Lỗi không rõ';
      const where = event.filename
        ? `${event.filename}:${event.lineno || 0}:${event.colno || 0}`
        : '';
      diagnostics.record('error', message, event.error?.stack || where);
    });

    win.addEventListener('unhandledrejection', (event) => {
      const reason = event && event.reason;
      diagnostics.record('promise', reason?.message || stringifyValue(reason));
    });
  }

  if (con && typeof con.error === 'function') {
    const originalError = con.error.bind(con);
    con.error = (...args) => {
      try {
        diagnostics.record('console', args.map(stringifyValue).join(' '));
      } catch (_) {
        /* Không để chính bộ ghi lỗi làm app lỗi thêm. */
      }
      originalError(...args);
    };
  }

  return diagnostics;
}
