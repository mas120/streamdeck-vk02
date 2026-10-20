import { wireCapsuleDrag } from './volume.js';
import { isEditMode, playKeySound } from '../core/mode-manager.js';
import { widgetRegistry } from '../core/widget-registry.js';

export function createAppSliderWidget(services) {
  let audioSessionCache = [];
  let syncBusy = false;
  let inflightScan = null;

  function setFillPercent(unit, percent) {
    if (unit) unit.style.setProperty('--fill-percent', String(percent));
  }

  function setAppState(unit, state) {
    if (unit) unit.dataset.state = state;
  }

  /* Nhiều phím + vòng poll cùng gọi: dùng chung 1 lần quét Rust (EnumWindows + COM). */
  function refreshAudioSessions() {
    if (!services.getTauri()) return Promise.resolve(audioSessionCache);
    inflightScan ??= services
      .invokeCmd('get_audio_sessions')
      .then((list) => {
        if (Array.isArray(list)) audioSessionCache = list;
      })
      .catch((error) => console.warn('get_audio_sessions lỗi:', error))
      .then(() => {
        inflightScan = null;
        return audioSessionCache;
      });
    return inflightScan;
  }

  function findSessionByName(name) {
    if (!name) return null;
    const wanted = name.toLowerCase();
    return audioSessionCache.find((session) => session.name.toLowerCase() === wanted) || null;
  }

  function markup(icon) {
    return `
      <div class="app-deck-unit" data-state="off" style="--fill-percent:0">
        <div class="app-head">
          <button type="button" class="app-icon-btn">${icon}</button>
          <span class="app-text">
            <span class="app-name"></span>
            <span class="app-hint"></span>
          </span>
          <span class="app-percent">--</span>
        </div>
        <div class="app-track"><div class="app-fill"></div></div>
        <i class="app-led" aria-hidden="true"></i>
      </div>`;
  }

  function update(el) {
    if (el.dataset.dragging === '1') return;
    const unit = el.querySelector('.app-deck-unit');
    if (!unit) return;
    services.applyWidgetTier(el, unit);
    const session = findSessionByName(el.dataset.target);
    const percentEl = unit.querySelector('.app-percent');
    const iconButton = unit.querySelector('.app-icon-btn');
    const nameEl = unit.querySelector('.app-name');
    const hintEl = unit.querySelector('.app-hint');

    if (!session) {
      const hasTarget = !!String(el.dataset.target || '').trim();
      const pretty = services.prettyProcName(el.dataset.target);
      const hint = hasTarget ? 'Chưa phát âm thanh' : 'Chạm để chọn app';
      el.dataset.pid = '';
      unit.classList.remove('is-muted');
      iconButton.classList.remove('muted');
      if (nameEl) nameEl.textContent = pretty;
      if (hintEl) hintEl.textContent = hint;
      if (percentEl) percentEl.textContent = '--';
      unit.title = hasTarget ? `${pretty} · ${hint}` : hint;
      setFillPercent(unit, 0);
      setAppState(unit, 'off');
      return;
    }

    unit.removeAttribute('title');
    el.dataset.pid = session.pid;
    const percent = Math.round((session.volume || 0) * 100);
    if (nameEl) nameEl.textContent = session.label || session.name || '';
    if (percentEl) percentEl.textContent = `${percent}%`;
    setFillPercent(unit, percent);
    iconButton.classList.toggle('muted', !!session.muted);
    unit.classList.toggle('is-muted', !!session.muted);
    setAppState(unit, session.muted ? 'muted' : percent > 0 ? 'active' : 'idle');
  }

  async function sync() {
    if (syncBusy) return;
    const elements = document.querySelectorAll('.grid-stack-item[data-type="app_slider"]');
    if (!elements.length) return;
    syncBusy = true;
    try {
      await refreshAudioSessions();
      elements.forEach(update);
    } finally {
      syncBusy = false;
    }
  }

  function setup(container, el) {
    const unit = container.querySelector('.app-deck-unit');
    if (!unit) return;
    const percentEl = unit.querySelector('.app-percent');
    const iconButton = unit.querySelector('.app-icon-btn');
    let animationFrame = null;
    let pendingVolume = null;

    function flushVolume() {
      animationFrame = null;
      if (pendingVolume === null) return;
      const pid = parseInt(el.dataset.pid, 10);
      const volume = pendingVolume;
      pendingVolume = null;
      if (!pid) return;
      services
        .invokeCmd('set_app_volume', { pid, volume })
        .catch((error) => console.error('set_app_volume lỗi:', error));
    }

    function queueVolume(fraction) {
      pendingVolume = Math.max(0, Math.min(1, fraction));
      if (animationFrame === null) animationFrame = requestAnimationFrame(flushVolume);
    }

    wireCapsuleDrag(el, unit, (ratio) => {
      const percent = Math.round(ratio * 100);
      setFillPercent(unit, percent);
      if (percentEl) percentEl.textContent = `${percent}%`;
      const session = audioSessionCache.find((item) => item.pid === parseInt(el.dataset.pid, 10));
      if (session) {
        session.volume = ratio;
        setAppState(unit, session.muted ? 'muted' : percent > 0 ? 'active' : 'idle');
      }
      queueVolume(ratio);
    });

    unit.addEventListener('pointerup', () => {
      if (pendingVolume !== null && animationFrame === null) flushVolume();
    });
    iconButton.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      if (!isEditMode) playKeySound();
    });
    iconButton.addEventListener('click', async (event) => {
      event.stopPropagation();
      if (services.didDragJustHappen()) return;
      const pid = parseInt(el.dataset.pid, 10);
      if (!pid) {
        if (!String(el.dataset.target || '').trim()) {
          services.openEditModal(el);
          return;
        }
        await refreshAudioSessions();
        update(el);
        return;
      }
      try {
        const muted = await services.invokeCmd('toggle_app_mute', { pid });
        unit.classList.toggle('is-muted', !!muted);
        iconButton.classList.toggle('muted', !!muted);
        setAppState(unit, muted ? 'muted' : 'active');
        if (typeof muted === 'boolean') {
          const session = audioSessionCache.find((item) => item.pid === pid);
          if (session) session.muted = muted;
        }
        services.flashKeycap(el, true);
      } catch (error) {
        console.error('toggle_app_mute lỗi:', error);
        services.flashKeycap(el, false);
      }
    });
    el.__appSliderCleanup = () => {
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      el.__appSliderCleanup = null;
    };
  }

  function destroy(el) {
    el.__appSliderCleanup?.();
    delete el.__appSliderCleanup;
  }

  return {
    type: 'app_slider',
    markup,
    setup,
    register(el) {
      const unit = el.querySelector('.app-deck-unit');
      return unit ? { el, type: 'app_slider', unit } : null;
    },
    update,
    destroy,
    sync,
    refresh: refreshAudioSessions,
    getSessions: () => audioSessionCache,
  };
}

widgetRegistry.registerWidget({
  type: 'app_slider',
  label: 'Âm lượng ứng dụng',
  icon: '🎚️',
  defaultSize: [2, 1],
  create: ({ el, content, services }) => {
    const widget = services.appSliderWidget;
    return {
      markup: widget.markup(services.formatIconSource(el.dataset.icon, el.dataset.icon2x)),
      setup: () => {
        widget.setup(content, el);
        widget.update(el);
        widget.refresh().then(() => widget.update(el));
      },
      destroy: () => widget.destroy(el),
    };
  },
});
