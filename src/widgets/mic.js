import { playKeySound } from '../core/mode-manager.js';
import { hydrateVectorIcons, loadIconSet, vectorMarkup } from '../icons.js';

export function createMicWidget({ invokeCmd, flashKeycap, applyWidgetTier }) {
  const clamp01 = (value) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

  function markup() {
    return `
      <div class="mic-deck-unit" data-muted="0" data-level="0" style="--mic-level: 0;" role="switch" tabindex="0" aria-checked="false" aria-label="Micrô đang mở">
        <span class="deck-icon-core" data-fit="contain" aria-hidden="true">
          <span class="icon-chip">${vectorMarkup('lucide:mic')}</span>
        </span>
        <span class="mic-meter" aria-hidden="true"><i class="mic-meter-fill"></i></span>
      </div>
    `;
  }

  function applyState(unit, muted, peak) {
    const pct = Math.round(clamp01(peak) * 100);
    unit.dataset.muted = muted ? '1' : '0';
    unit.dataset.level = String(pct);
    unit.style.setProperty('--mic-level', String(pct));
    unit.classList.toggle('is-muted', !!muted);
    unit.setAttribute('aria-checked', muted ? 'false' : 'true');
    const meter = unit.querySelector('.mic-meter-fill');
    if (meter) meter.style.width = `${pct}%`;
    unit.setAttribute('aria-label', muted
      ? 'Micrô đã tắt'
      : (pct > 0 ? `Micrô đang mở, mức tín hiệu ${pct}%` : 'Micrô đang mở, chưa nhận tín hiệu'));

    const chip = unit.querySelector('.icon-chip');
    const iconId = `lucide:${muted ? 'mic-off' : 'mic'}`;
    if (chip?.firstElementChild?.dataset.iconId !== iconId) {
      if (chip) chip.innerHTML = vectorMarkup(iconId);
      loadIconSet('lucide').then(() => hydrateVectorIcons(chip));
    }
  }

  async function syncState(el) {
    const unit = el.querySelector('.mic-deck-unit');
    if (!unit) return;
    try {
      const state = await invokeCmd('get_mic_state');
      if (!state || typeof state !== 'object') return;
      const raw = Number(state.peak) || 0;
      const level = raw > 0 ? clamp01((20 * Math.log10(raw) + 50) / 50) : 0;
      applyState(unit, !!state.muted, level);
      if (state.error) {
        unit.title = state.error;
        unit.dataset.error = '1';
      } else {
        unit.title = '';
        delete unit.dataset.error;
      }
    } catch (err) {
      console.warn('get_mic_state lỗi:', err);
    }
  }

  function setup(el) {
    const unit = el.querySelector('.mic-deck-unit');
    if (!unit) return;
    applyWidgetTier(el, unit);
    loadIconSet('lucide').then(() => hydrateVectorIcons(unit));

    unit.addEventListener('pointerdown', (e) => { e.stopPropagation(); playKeySound(); });
    unit.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      unit.click();
    });
    unit.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const nextMuted = await invokeCmd('toggle_mic_mute');
        if (typeof nextMuted !== 'boolean') return;
        applyState(unit, nextMuted, Number(unit.dataset.level || 0) / 100);
        flashKeycap(el, true);
      } catch (err) {
        console.warn('toggle_mic_mute lỗi:', err);
        flashKeycap(el, false);
      }
    });

    if (!el.__micTimer) {
      const poll = () => {
        if (!document.hidden && !document.body.classList.contains('idle')) syncState(el);
      };
      poll();
      el.__micTimer = setInterval(poll, 80);
    }
  }

  function destroy(el) {
    if (el.__micTimer) {
      clearInterval(el.__micTimer);
      el.__micTimer = null;
    }
  }

  return { type: 'mic_widget', markup, setup, syncState, destroy };
}
