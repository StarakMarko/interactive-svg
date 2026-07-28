/**
 * preview.js — Preview mode: simulates final interactive SVG behavior.
 * Disables editing, wires up hover/click interactions on triggers.
 */

import { AppState, EventBus, showToast } from './app.js';
import { applyTargetBaseState, applyScaleToElement } from './interactions.js';

let previewListeners = []; // Store listener refs for cleanup
let blinkIntervals = [];   // Store blink intervals for cleanup

export function initPreview() {
  EventBus.on('toggle-preview', () => {
    if (AppState.mode === 'preview') {
      exitPreview();
    } else {
      enterPreview();
    }
  });

  document.getElementById('btn-exit-preview').addEventListener('click', () => {
    exitPreview();
  });
}

function enterPreview() {
  if (!AppState.svgDocument) {
    showToast('Import an SVG first', 'warning');
    return;
  }

  if (AppState.interactions.length === 0) {
    showToast('No interactions to preview', 'warning');
    return;
  }

  // Cancel any ongoing pick mode
  if (AppState.mode === 'interaction-pick') {
    EventBus.emit('cancel-pick');
  }

  AppState.mode = 'preview';

  // Deselect
  EventBus.emit('deselect');

  // Show preview badge
  document.getElementById('preview-badge').classList.remove('preview-badge--hidden');
  document.body.classList.add('preview-active');

  // Apply all target base states
  const targetIds = new Set(AppState.interactions.map(i => i.targetId));
  targetIds.forEach(targetId => {
    applyTargetBaseState(targetId);
  });

  // Wire up interaction listeners
  AppState.interactions.forEach(interaction => {
    const triggerEl = AppState.svgDocument.querySelector(`#${CSS.escape(interaction.triggerId)}`);
    const targetEl = AppState.svgDocument.querySelector(`#${CSS.escape(interaction.targetId)}`);
    if (!triggerEl || !targetEl) return;

    const activeOpacity = interaction.activeOpacity !== undefined ? interaction.activeOpacity : 1;
    const activeScale = interaction.activeScale !== undefined ? interaction.activeScale : 1;
    const baseOpacity = interaction.baseOpacity !== undefined ? interaction.baseOpacity : 0;
    const baseScale = interaction.baseScale !== undefined ? interaction.baseScale : 1;

    const showTarget = () => {
      targetEl.style.opacity = activeOpacity;
      if (activeScale !== 1 || baseScale !== 1) {
        applyScaleToElement(targetEl, activeScale);
      }
    };
    const hideTarget = () => {
      // Only hide if no other active trigger is showing this target
      targetEl.style.opacity = baseOpacity;
      if (activeScale !== 1 || baseScale !== 1) {
        applyScaleToElement(targetEl, baseScale);
      }
    };

    if (interaction.event === 'hover') {
      triggerEl.addEventListener('mouseenter', showTarget);
      triggerEl.addEventListener('mouseleave', hideTarget);
      previewListeners.push({ el: triggerEl, event: 'mouseenter', fn: showTarget });
      previewListeners.push({ el: triggerEl, event: 'mouseleave', fn: hideTarget });
    }

    if (interaction.event === 'click') {
      const toggleTarget = (e) => {
        e.stopPropagation();
        const currentOpacity = parseFloat(targetEl.style.opacity);
        // Toggle based on whether it's closer to active or base
        if (isNaN(currentOpacity) || Math.abs(currentOpacity - activeOpacity) > 0.01) {
          showTarget();
        } else {
          hideTarget();
        }
      };
      triggerEl.addEventListener('click', toggleTarget);
      previewListeners.push({ el: triggerEl, event: 'click', fn: toggleTarget });
    }

    // Make trigger cursor pointer in preview
    triggerEl.style.cursor = 'pointer';
    previewListeners.push({
      el: triggerEl,
      cleanup: () => { triggerEl.style.cursor = ''; }
    });
  });

  // ── Apply interaction effects to Triggers (first object) ──
  const processedEffectTriggers = new Set();
  AppState.interactions.forEach(interaction => {
    const triggerId = interaction.triggerId;
    const effect = interaction.effect || 'none';
    if (effect === 'none') return;
    
    // Only apply effect once per trigger element to prevent duplicate listeners
    const effectKey = `${triggerId}-${effect}`;
    if (processedEffectTriggers.has(effectKey)) return;
    processedEffectTriggers.add(effectKey);

    const triggerEl = AppState.svgDocument.querySelector(`#${CSS.escape(triggerId)}`);
    if (!triggerEl) return;

    if (effect === 'zoom-on-hover') {
      const zoomIn = () => {
        triggerEl.style.transition = 'transform 0.2s ease';
        applyScaleToElement(triggerEl, 1.1);
      };
      const zoomOut = () => {
        triggerEl.style.transition = 'transform 0.2s ease';
        applyScaleToElement(triggerEl, 1); // Reset to base scale
      };
      triggerEl.addEventListener('mouseenter', zoomIn);
      triggerEl.addEventListener('mouseleave', zoomOut);
      previewListeners.push({ el: triggerEl, event: 'mouseenter', fn: zoomIn });
      previewListeners.push({ el: triggerEl, event: 'mouseleave', fn: zoomOut });
    }

    if (effect === 'always-blink') {
      const blinkRef = { timer: null, stopped: false };
      triggerEl.style.transition = 'opacity 0.3s ease';
      triggerEl.style.opacity = 1;

      const doBlink = (toOpacity, nextDelay) => {
        if (blinkRef.stopped) return;
        triggerEl.style.opacity = toOpacity;
        blinkRef.timer = setTimeout(() => {
          if (toOpacity === 1) {
            doBlink(0.7, 500);
          } else {
            doBlink(1, 1000);
          }
        }, nextDelay);
      };
      doBlink(1, 1000);

      blinkIntervals.push({
        targetEl: triggerEl,
        stop: () => {
          blinkRef.stopped = true;
          clearTimeout(blinkRef.timer);
        }
      });
      previewListeners.push({
        el: triggerEl,
        cleanup: () => {
          blinkRef.stopped = true;
          clearTimeout(blinkRef.timer);
          triggerEl.style.transition = '';
        }
      });
    }
  });

  EventBus.emit('preview-enter');
    showToast('Preview mode — hover or click trigger elements', 'success');
  }

function exitPreview() {
      AppState.mode = 'select';

      // Hide preview badge
      document.getElementById('preview-badge').classList.add('preview-badge--hidden');
      document.body.classList.remove('preview-active');

      // Remove all preview listeners
      previewListeners.forEach(({ el, event, fn, cleanup }) => {
        if (event && fn) {
          el.removeEventListener(event, fn);
        }
        if (cleanup) cleanup();
      });
      previewListeners = [];

      // Stop all blink intervals
      blinkIntervals.forEach(b => b.stop());
      blinkIntervals = [];

      // Restore target base states
      const targetIds = new Set(AppState.interactions.map(i => i.targetId));
      targetIds.forEach(targetId => {
        applyTargetBaseState(targetId);
      });

      EventBus.emit('preview-exit');
      showToast('Exited preview mode', 'info');
    }
