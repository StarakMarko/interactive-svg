/**
 * properties-panel.js — Right sidebar showing element info and interaction management.
 */

import { AppState, EventBus, getElementLabel } from './app.js';
import { startInteractionPick, getInteractionsForElement } from './interactions.js';

let propsEmpty, propsElement, propsInteractions, propsAllInteractions;
let propTag, propId, propPosition, propSize;
let interactionsList, allInteractionsList, interactionCount;
let btnAddInteraction;

export function initPropertiesPanel() {
  propsEmpty = document.getElementById('props-empty');
  propsElement = document.getElementById('props-element');
  propsInteractions = document.getElementById('props-interactions');
  propsAllInteractions = document.getElementById('props-all-interactions');
  propTag = document.getElementById('prop-tag');
  propId = document.getElementById('prop-id');
  propPosition = document.getElementById('prop-position');
  propSize = document.getElementById('prop-size');
  interactionsList = document.getElementById('interactions-list');
  allInteractionsList = document.getElementById('all-interactions-list');
  interactionCount = document.getElementById('interaction-count');
  btnAddInteraction = document.getElementById('btn-add-interaction');

  // Cancel pick from banner
  document.getElementById('btn-cancel-pick').addEventListener('click', () => {
    EventBus.emit('cancel-pick');
  });

  // Add interaction button
  btnAddInteraction.addEventListener('click', () => {
    if (AppState.selectedElementId) {
      startInteractionPick(AppState.selectedElementId);
    }
  });


  // Listen for selection changes
  EventBus.on('element-selected', (elementId) => {
    showElementProperties(elementId);
  });

  EventBus.on('element-deselected', () => {
    hideElementProperties();
  });

  // Refresh when interactions change
  EventBus.on('interactions-changed', () => {
    if (AppState.selectedElementId) {
      updateInteractionsList(AppState.selectedElementId);
    }
    updateAllInteractionsList();
  });

  // Initial state
  updateAllInteractionsList();
}

function showElementProperties(elementId) {
  const el = AppState.svgDocument?.querySelector(`#${CSS.escape(elementId)}`);
  if (!el) return;

  // Show sections
  propsEmpty.style.display = 'none';
  propsElement.style.display = '';
  propsInteractions.style.display = '';

  // Fill element info
  propTag.textContent = el.tagName.toLowerCase();
  propId.textContent = el.id || '(no id)';

  try {
    const bbox = el.getBBox();
    propPosition.textContent = `${Math.round(bbox.x)}, ${Math.round(bbox.y)}`;
    propSize.textContent = `${Math.round(bbox.width)} × ${Math.round(bbox.height)}`;
  } catch {
    propPosition.textContent = '—';
    propSize.textContent = '—';
  }


  // Update interactions list for this element
  updateInteractionsList(elementId);
}

function hideElementProperties() {
  propsEmpty.style.display = '';
  propsElement.style.display = 'none';
  propsInteractions.style.display = 'none';
}

function updateInteractionsList(elementId) {
  const { asTrigger, asTarget } = getInteractionsForElement(elementId);

  if (asTrigger.length === 0 && asTarget.length === 0) {
    interactionsList.innerHTML = `
      <div class="interactions-list__empty">
        <p>No interactions for this element</p>
      </div>
    `;
    return;
  }

  interactionsList.innerHTML = '';

  // Show interactions where this element is the trigger
  asTrigger.forEach(interaction => {
    interactionsList.appendChild(
      createInteractionCard(interaction, 'trigger')
    );
  });

  // Show interactions where this element is the target
  asTarget.forEach(interaction => {
    interactionsList.appendChild(
      createInteractionCard(interaction, 'target')
    );
  });
}

function updateAllInteractionsList() {
  const count = AppState.interactions.length;
  interactionCount.textContent = count;

  if (count === 0) {
    allInteractionsList.innerHTML = `
      <div class="interactions-list__empty">
        <p>No interactions defined</p>
      </div>
    `;
    return;
  }

  allInteractionsList.innerHTML = '';
  AppState.interactions.forEach(interaction => {
    allInteractionsList.appendChild(
      createInteractionCard(interaction, 'full')
    );
  });
}

function createInteractionCard(interaction, perspective) {
  const card = document.createElement('div');
  card.className = 'interaction-card fade-in';
  card.setAttribute('data-interaction-id', interaction.id);

  const triggerLabel = `#${interaction.triggerId}`;
  const targetLabel = `#${interaction.targetId}`;

  // ── Header row: pair + delete ──
  const header = document.createElement('div');
  header.className = 'interaction-card__header';

  const triggerEl = document.createElement('span');
  triggerEl.className = 'interaction-card__element interaction-card__element--trigger';
  triggerEl.textContent = triggerLabel;
  triggerEl.title = 'Click to select trigger';
  triggerEl.addEventListener('click', () => {
    EventBus.emit('select-element', interaction.triggerId);
  });

  const arrow = document.createElement('span');
  arrow.className = 'interaction-card__arrow material-icons-round';
  arrow.textContent = 'arrow_forward';

  const targetEl = document.createElement('span');
  targetEl.className = 'interaction-card__element interaction-card__element--target';
  targetEl.textContent = targetLabel;
  targetEl.title = 'Click to select target';
  targetEl.addEventListener('click', () => {
    EventBus.emit('select-element', interaction.targetId);
  });

  // Delete button (trash icon)
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'interaction-card__delete';
  deleteBtn.title = 'Delete interaction';
  deleteBtn.innerHTML = '<span class="material-icons-round">delete</span>';
  deleteBtn.style.marginLeft = 'auto';
  deleteBtn.addEventListener('click', () => {
    EventBus.emit('delete-interaction', interaction.id);
  });

  header.appendChild(triggerEl);
  header.appendChild(arrow);
  header.appendChild(targetEl);
  header.appendChild(deleteBtn);

  // ── Collapsible body ──
  const body = document.createElement('div');
  body.className = 'interaction-card__settings';

  // Toggle arrow
  const toggle = document.createElement('span');
  toggle.className = 'interaction-card__toggle material-icons-round';
  toggle.textContent = 'expand_more';
  toggle.title = 'Collapse';
  header.insertBefore(toggle, header.firstChild);

  let collapsed = false;
  toggle.addEventListener('click', () => {
    collapsed = !collapsed;
    body.classList.toggle('interaction-card__settings--collapsed', collapsed);
    toggle.classList.toggle('interaction-card__toggle--collapsed', collapsed);
    toggle.title = collapsed ? 'Expand' : 'Collapse';
  });

  // ── TRIGGER row ──
  const triggerRow = document.createElement('div');
  triggerRow.className = 'interaction-card__field-row';
  const triggerRowLabel = document.createElement('span');
  triggerRowLabel.className = 'interaction-card__field-label';
  triggerRowLabel.textContent = 'TRIGGER';
  const triggerSelect = document.createElement('select');
  triggerSelect.className = 'interaction-card__field-select';
  triggerSelect.innerHTML = `
    <option value="hover" ${interaction.event === 'hover' ? 'selected' : ''}>Hover</option>
    <option value="click" ${interaction.event === 'click' ? 'selected' : ''}>Click</option>
  `;
  triggerSelect.addEventListener('change', () => {
    EventBus.emit('update-interaction', {
      interactionId: interaction.id,
      updates: { event: triggerSelect.value },
    });
  });
  triggerRow.appendChild(triggerRowLabel);
  triggerRow.appendChild(triggerSelect);

  // ── EFFECT row ──
  const effectRow = document.createElement('div');
  effectRow.className = 'interaction-card__field-row';
  const effectRowLabel = document.createElement('span');
  effectRowLabel.className = 'interaction-card__field-label';
  effectRowLabel.textContent = 'EFFECT';
  const effectSelect = document.createElement('select');
  effectSelect.className = 'interaction-card__field-select';
  effectSelect.innerHTML = `
    <option value="none" ${interaction.effect === 'none' ? 'selected' : ''}>None</option>
    <option value="zoom-on-hover" ${interaction.effect === 'zoom-on-hover' ? 'selected' : ''}>Zoom on Hover</option>
    <option value="always-blink" ${interaction.effect === 'always-blink' ? 'selected' : ''}>Always Blink</option>
  `;
  effectSelect.addEventListener('change', () => {
    EventBus.emit('update-interaction', {
      interactionId: interaction.id,
      updates: { effect: effectSelect.value },
    });
  });
  effectRow.appendChild(effectRowLabel);
  effectRow.appendChild(effectSelect);

  // ── OPACITY row: Base + Active ──
  const opacityRow = document.createElement('div');
  opacityRow.className = 'setting-row';
  opacityRow.innerHTML = `
    <span class="setting-row__label">OPACITY</span>
    <div class="setting-row__fields">
      <span class="setting-row__field-label">Base</span>
      <input type="number" class="prop-input prop-input--base-opacity" value="${interaction.baseOpacity ?? 0}" min="0" max="1" step="0.1">
      <span class="setting-row__field-label">Active</span>
      <input type="number" class="prop-input prop-input--active-opacity" value="${interaction.activeOpacity ?? 1}" min="0" max="1" step="0.1">
    </div>
  `;

  // ── SCALE row: Base + Active ──
  const scaleRow = document.createElement('div');
  scaleRow.className = 'setting-row';
  scaleRow.innerHTML = `
    <span class="setting-row__label">SCALE</span>
    <div class="setting-row__fields">
      <span class="setting-row__field-label">Base</span>
      <input type="number" class="prop-input prop-input--base-scale" value="${interaction.baseScale ?? 1}" min="0" step="0.1">
      <span class="setting-row__field-label">Active</span>
      <input type="number" class="prop-input prop-input--active-scale" value="${interaction.activeScale ?? 1}" min="0" step="0.1">
    </div>
  `;

  // Bind inputs
  const bindInput = (container, className, key) => {
    const input = container.querySelector(className);
    input.addEventListener('change', () => {
      let val = parseFloat(input.value);
      if (isNaN(val)) val = key.includes('Opacity') ? (key === 'baseOpacity' ? 0 : 1) : 1;
      EventBus.emit('update-interaction', {
        interactionId: interaction.id,
        updates: { [key]: val }
      });
    });
  };
  bindInput(opacityRow, '.prop-input--base-opacity', 'baseOpacity');
  bindInput(opacityRow, '.prop-input--active-opacity', 'activeOpacity');
  bindInput(scaleRow, '.prop-input--base-scale', 'baseScale');
  bindInput(scaleRow, '.prop-input--active-scale', 'activeScale');

  // Assemble body
  body.appendChild(triggerRow);
  body.appendChild(effectRow);
  body.appendChild(opacityRow);
  body.appendChild(scaleRow);

  // Assemble card
  card.appendChild(header);
  card.appendChild(body);

  return card;
}
