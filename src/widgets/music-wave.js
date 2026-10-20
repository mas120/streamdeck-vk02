import { widgetRegistry } from '../core/widget-registry.js';
import '../styles/widgets/music-wave.css';

const BAR_COUNT = 36;
const UPDATE_MS = 70;
const QUIET_THRESHOLD = 0.006;

const clamp01 = (value) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

export function createMusicWaveWidget({ getTauri, invokeCmd }) {
  const units = new Map();
  let timer = null;
  let busy = false;
  let warned = false;

  function markup() {
    const bars = Array.from({ length: BAR_COUNT }, () => '<i class="music-wave-bar"></i>').join('');
    return `<div class="music-wave-unit" data-state="silent" role="img" aria-label="Đang chờ âm thanh đầu ra">
      <div class="music-wave-bars" aria-hidden="true">${bars}</div>
    </div>`;
  }

  function paint(record, peak) {
    const level = peak > QUIET_THRESHOLD ? Math.min(1, Math.pow(peak, 0.58) * 1.25) : 0;
    record.samples[record.cursor] = level;
    record.cursor = (record.cursor + 1) % record.bars.length;

    let active = false;
    record.bars.forEach((bar, index) => {
      const sample = record.samples[(record.cursor + index) % record.bars.length];
      bar.style.setProperty('--bar-level', String(Math.max(0.035, sample)));
      active ||= sample > 0.04;
    });

    record.unit.dataset.state = active ? 'active' : 'silent';
    record.unit.setAttribute(
      'aria-label',
      active ? `Âm thanh đầu ra ${Math.round(peak * 100)}%` : 'Đang chờ âm thanh đầu ra'
    );
  }

  async function tick() {
    if (busy || !units.size || document.hidden || document.body.classList.contains('idle')) return;
    if (!getTauri()) {
      units.forEach(({ unit }) => {
        unit.dataset.state = 'unavailable';
      });
      return;
    }

    busy = true;
    try {
      const peak = clamp01(Number(await invokeCmd('get_output_peak')));
      units.forEach((record) => paint(record, peak));
      warned = false;
    } catch (error) {
      units.forEach(({ unit }) => {
        unit.dataset.state = 'unavailable';
      });
      if (!warned) console.warn('get_output_peak lỗi:', error);
      warned = true;
    } finally {
      busy = false;
    }
  }

  function setup(el) {
    const unit = el.querySelector('.music-wave-unit');
    const bars = Array.from(el.querySelectorAll('.music-wave-bar'));
    if (!unit || !bars.length) return;
    units.set(el, { unit, bars, samples: new Array(bars.length).fill(0), cursor: 0 });
    if (!timer) timer = setInterval(tick, UPDATE_MS);
    tick();
  }

  function destroy(el) {
    units.delete(el);
    if (!units.size && timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  return { type: 'music_wave', markup, setup, destroy };
}

widgetRegistry.registerWidget({
  type: 'music_wave',
  label: 'Sóng nhạc',
  icon: '🌊',
  defaultSize: [3, 1],
  create: ({ el, services }) => {
    const widget = services.musicWaveWidget;
    return {
      markup: widget.markup(),
      setup: () => widget.setup(el),
      destroy: () => widget.destroy(el),
    };
  },
});
