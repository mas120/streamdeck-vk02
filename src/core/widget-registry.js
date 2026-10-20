/**
 * Widget registry — một nơi duy nhất khai báo widget.
 *
 * Mỗi widget đăng ký một descriptor:
 *   {
 *     type: 'volume_slider',          // bắt buộc, khớp data-type của tile
 *     label: 'Âm lượng',              // tên hiển thị (modal / danh sách)
 *     icon: '🔊',                     // icon mặc định (emoji hoặc mã icon)
 *     defaultSize: [2, 1],            // [w, h] gợi ý
 *     configFields: [],               // schema cho modal (P3-5)
 *     create(ctx) -> { markup, setup, destroy }
 *   }
 *
 * create(ctx) nhận { el, content, services } và trả về markup + hook vòng đời.
 * Widget chưa migrate vẫn chạy qua nhánh fallback của renderer.
 */

function normalizeDefinition(definition) {
  if (!definition || typeof definition !== 'object') {
    throw new TypeError('registerWidget: descriptor phải là object');
  }
  const { type } = definition;
  if (typeof type !== 'string' || !type.trim()) {
    throw new TypeError('registerWidget: thiếu type');
  }
  if (typeof definition.create !== 'function') {
    throw new TypeError('registerWidget: ' + type + ' thiếu hàm create()');
  }
  const size = Array.isArray(definition.defaultSize) ? definition.defaultSize : null;
  const configFields = normalizeConfigFields(type, definition.configFields);
  return Object.freeze({
    label: type,
    icon: '',
    defaultSize: size && size.length === 2 ? [Number(size[0]) || 1, Number(size[1]) || 1] : null,
    ...definition,
    type: type.trim(),
    configFields,
  });
}

/** Kiểu field mà modal biết cách dựng. `icon`/`app`/`city` là field đặc thù. */
export const FIELD_TYPES = Object.freeze([
  'text',
  'number',
  'select',
  'color',
  'checkbox',
  'icon',
  'app',
  'city',
]);

function normalizeConfigFields(type, fields) {
  if (fields == null) return Object.freeze([]);
  if (!Array.isArray(fields)) {
    throw new TypeError('registerWidget: configFields của ' + type + ' phải là mảng');
  }
  const seen = new Set();
  const normalized = fields.map((field) => {
    if (!field || typeof field.key !== 'string' || !field.key) {
      throw new TypeError('registerWidget: configFields của ' + type + ' thiếu key');
    }
    if (seen.has(field.key)) {
      throw new TypeError('registerWidget: configFields của ' + type + ' trùng key ' + field.key);
    }
    seen.add(field.key);
    if (!FIELD_TYPES.includes(field.type)) {
      throw new TypeError(
        'registerWidget: configFields của ' + type + ' có type không hỗ trợ: ' + field.type
      );
    }
    return Object.freeze({ ...field, label: field.label || field.key });
  });
  return Object.freeze(normalized);
}

export function createWidgetRegistry() {
  const entries = new Map();

  function registerWidget(definition) {
    const normalized = normalizeDefinition(definition);
    entries.set(normalized.type, normalized);
    return normalized;
  }

  function getWidget(type) {
    return entries.get(type) || null;
  }

  function hasWidget(type) {
    return entries.has(type);
  }

  function listWidgets() {
    return Array.from(entries.values());
  }

  function clear() {
    entries.clear();
  }

  return { registerWidget, getWidget, hasWidget, listWidgets, clear };
}

/** Registry dùng chung cho app (test có thể tạo instance riêng). */
export const widgetRegistry = createWidgetRegistry();
