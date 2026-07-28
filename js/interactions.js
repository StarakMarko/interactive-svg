/**
 * interactions.js — Manages interaction pairs (trigger → target).
 * Handles creating, editing, and deleting interaction pairs.
 */

import { AppState, EventBus, generateId, showToast, pushUndoState } from './app.js';

export function initInteractions() {
  // When a target is picked during interaction-pick mode
  EventBus.on('pick-target', (targetId) => {
    if (AppState.mode !== 'interaction-pick') return;
    if (!AppState.pendingTriggerId) return;

    const triggerId = AppState.pendingTriggerId;

    // Validate
    if (triggerId === targetId) {
      showToast('Cannot link an element to itself', 'warning');
      return;
    }

    // Check for duplicates
    const exists = AppState.interactions.some(
      i => i.triggerId === triggerId && i.targetId === targetId
    );
    if (exists) {
      showToast('This interaction already exists', 'warning');
      return;
    }

    // Save state for undo before creating
    pushUndoState();

    // Create the interaction
    const interaction = {
      id: generateId(),
      triggerId,
      targetId,
      event: 'click',
      effect: 'none',
      baseOpacity: 0,
      activeOpacity: 1,
      baseScale: 1,
      activeScale: 1,
    };

    AppState.interactions.push(interaction);

    // Exit pick mode
    AppState.mode = 'select';
    AppState.pendingTriggerId = null;
    AppState.pendingTargetId = null;
    document.getElementById('pick-banner').classList.add('pick-banner--hidden');
    EventBus.emit('pick-completed');

    // Set target base state (visually indicate it's a target)
    applyTargetBaseState(targetId);

    showToast(`Interaction created: #${triggerId} → #${targetId}`, 'success');
    EventBus.emit('interactions-changed');
    EventBus.emit('element-selected', triggerId); // Re-select trigger
  });

  // Cancel pick mode
  EventBus.on('cancel-pick', () => {
    AppState.mode = 'select';
    AppState.pendingTriggerId = null;
    AppState.pendingTargetId = null;
    document.getElementById('pick-banner').classList.add('pick-banner--hidden');
    EventBus.emit('pick-completed');
  });

  // Delete interaction
  EventBus.on('delete-interaction', (interactionId) => {
    deleteInteraction(interactionId);
  });

  // Update interaction property
  EventBus.on('update-interaction', ({ interactionId, updates }) => {
    const interaction = AppState.interactions.find(i => i.id === interactionId);
    if (interaction) {
      pushUndoState();
      Object.assign(interaction, updates);
      EventBus.emit('interactions-changed');
      
      // If it's a base property change, update the SVG display immediately
      if (updates.baseOpacity !== undefined || updates.baseScale !== undefined) {
        applyTargetBaseState(interaction.targetId);
      }
    }
  });
}

/**
 * Start the "Add Interactivity" workflow.
 * @param {string} triggerId - the selected element to use as trigger
 */
export function startInteractionPick(triggerId) {
  if (!triggerId) {
    showToast('Select an element first', 'warning');
    return;
  }

  AppState.mode = 'interaction-pick';
  AppState.pendingTriggerId = triggerId;

  // Show pick banner
  document.getElementById('pick-banner').classList.remove('pick-banner--hidden');
  EventBus.emit('enter-pick-mode');
}

/**
 * Delete an interaction by ID.
 */
export function deleteInteraction(interactionId) {
  const idx = AppState.interactions.findIndex(i => i.id === interactionId);
  if (idx === -1) return;

  const interaction = AppState.interactions[idx];
  const targetId = interaction.targetId;

  // Save state for undo before deleting
  pushUndoState();

  AppState.interactions.splice(idx, 1);

  // Check if this target is still used by other interactions
  const stillTarget = AppState.interactions.some(i => i.targetId === targetId);
  if (!stillTarget) {
    // Restore target to default state
    applyTargetBaseState(targetId, true);
  } else {
    // Reapply base state in case this interaction was the first one
    applyTargetBaseState(targetId);
  }

  showToast('Interaction deleted', 'info');
  EventBus.emit('interactions-changed');

  // Refresh properties panel
  if (AppState.selectedElementId) {
    EventBus.emit('element-selected', AppState.selectedElementId);
  }
}

/**
 * Get the center of an SVG element's bounding box in its local coordinate space.
 */
function getElementCenter(el) {
  try {
    const bbox = el.getBBox();
    return { cx: bbox.x + bbox.width / 2, cy: bbox.y + bbox.height / 2 };
  } catch (e) {
    return null;
  }
}

/**
 * Build an SVG transform string that scales around the element's own center.
 * Uses translate(cx,cy) scale(s) translate(-cx,-cy) pattern.
 */
function buildScaleTransform(el, scale) {
  const center = getElementCenter(el);
  if (!center) return `scale(${scale})`;
  return `translate(${center.cx},${center.cy}) scale(${scale}) translate(${-center.cx},${-center.cy})`;
}

/**
 * Apply base state (opacity, scale) to a target element.
 */
export function applyTargetBaseState(elementId, restoreDefault = false) {
  const el = AppState.svgDocument?.querySelector(`#${CSS.escape(elementId)}`);
  if (!el) return;

  if (restoreDefault) {
    el.style.opacity = '';
    el.removeAttribute('data-editor-transform');
    el.setAttribute('transform', el.getAttribute('data-original-transform') || '');
    if (!el.getAttribute('transform')) el.removeAttribute('transform');
    el.style.transition = '';
    return;
  }

  // Save original transform if not already saved
  if (!el.hasAttribute('data-original-transform')) {
    el.setAttribute('data-original-transform', el.getAttribute('transform') || '');
  }

  // Find the first interaction targeting this element
  const interaction = AppState.interactions.find(i => i.targetId === elementId);
  if (interaction) {
    const baseOpacity = interaction.baseOpacity !== undefined ? interaction.baseOpacity : 0;
    const baseScale = interaction.baseScale !== undefined ? interaction.baseScale : 1;
    
    el.style.opacity = baseOpacity;
    el.style.transition = 'opacity 0.3s ease';

    const origTransform = el.getAttribute('data-original-transform') || '';
    if (baseScale != 1) {
      const scaleTransform = buildScaleTransform(el, baseScale);
      el.setAttribute('transform', origTransform + ' ' + scaleTransform);
      el.setAttribute('data-editor-transform', scaleTransform);
    } else {
      el.setAttribute('transform', origTransform);
      el.removeAttribute('data-editor-transform');
    }
  }
}

/**
 * Apply active state (for preview/export) to a target element.
 */
export function applyScaleToElement(el, scale) {
  if (!el.hasAttribute('data-original-transform')) {
    el.setAttribute('data-original-transform', el.getAttribute('transform') || '');
  }
  const origTransform = el.getAttribute('data-original-transform') || '';
  if (scale != 1) {
    const scaleTransform = buildScaleTransform(el, scale);
    el.setAttribute('transform', origTransform + ' ' + scaleTransform);
  } else {
    el.setAttribute('transform', origTransform);
  }
}

/**
 * Get all interactions involving a specific element.
 */
export function getInteractionsForElement(elementId) {
  return {
    asTrigger: AppState.interactions.filter(i => i.triggerId === elementId),
    asTarget: AppState.interactions.filter(i => i.targetId === elementId),
  };
}
