import { widgetRegistry } from './widget-registry.js';

/**
 * Renderer mỏng: tra widget trong registry và chạy create() -> markup/setup.
 * Kiểu phím không phải widget (open_url, launch_app...) rơi về icon mặc định.
 */
export function createWidgetRenderer(services) {
  const {
    formatIconSource,
    applyKeyTitle,
    registerLiveWidget,
    unregisterLiveWidget,
    widgetRegistry: injectedRegistry,
  } = services;

  /** Registry mặc định là singleton; test có thể truyền instance riêng. */
  const registry = injectedRegistry || widgetRegistry;

  /** Instance do registry tạo (để gọi destroy đúng đối tượng). */
  const widgetInstances = new WeakMap();

  function destroyWidgetContent(el) {
    unregisterLiveWidget(el);
    const instance = widgetInstances.get(el);
    if (instance) {
      instance.destroy?.(el);
      widgetInstances.delete(el);
    }
    delete el.__renderedWidgetType;
  }

  function renderWidgetBody(el) {
    const content = el.querySelector('.grid-stack-item-content') || el;
    const type = el.dataset.type;
    const registered = registry.getWidget(type);
    if (registered) {
      const instance = registered.create({ el, content, services });
      if (!instance || typeof instance.markup !== 'string') {
        throw new Error('Widget "' + type + '" trả về markup không hợp lệ');
      }
      content.innerHTML = instance.markup;
      instance.setup?.(el, content);
      widgetInstances.set(el, instance);
      return;
    }
    content.innerHTML = `
      <div class="deck-icon-core" data-fit="${el.dataset.fit === 'cover' ? 'cover' : 'contain'}">
        <span class="icon-chip">${formatIconSource(el.dataset.icon, el.dataset.icon2x)}</span>
      </div>`;
  }

  function renderWidgetContent(el) {
    destroyWidgetContent(el);
    renderWidgetBody(el);
    el.__renderedWidgetType = el.dataset.type;
    applyKeyTitle(el);
    registerLiveWidget(el);
  }

  return { renderWidgetContent, renderWidgetBody, destroyWidgetContent };
}
