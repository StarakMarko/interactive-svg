/**
 * layers-panel.js — Layers tree, visibility, lock, search, and selection sync.
 */

import { AppState, EventBus } from './app.js';
import { buildElementTree } from './svg-importer.js';

let treeContainer;
let searchInput;

export function initLayersPanel() {
  treeContainer = document.getElementById('layers-tree');
  searchInput = document.getElementById('layers-search');

  const btnCollapseAll = document.getElementById('btn-collapse-all');
  const btnExpandAll = document.getElementById('btn-expand-all');

  btnCollapseAll.addEventListener('click', () => toggleAllNodes(false));
  btnExpandAll.addEventListener('click', () => toggleAllNodes(true));

  searchInput.addEventListener('input', () => filterTree());

  // Rebuild tree when SVG is loaded
  EventBus.on('svg-rendered', (svgEl) => {
    buildTree(svgEl);
  });

  // Sync selection from canvas
  EventBus.on('element-selected', (elementId) => {
    highlightNode(elementId);
  });

  EventBus.on('element-deselected', () => {
    clearHighlight();
  });

  EventBus.on('pending-target-selected', (elementId) => {
    highlightTargetNode(elementId);
  });

  EventBus.on('pending-target-deselected', () => {
    clearTargetHighlight();
  });

  EventBus.on('pick-completed', () => {
    clearTargetHighlight();
  });

  // Update badges when interactions change
  EventBus.on('interactions-changed', () => {
    updateBadges();
  });
}

function buildTree(svgEl) {
  const tree = buildElementTree(svgEl);
  if (!tree) {
    treeContainer.innerHTML = `
      <div class="layers-tree__empty">
        <span class="material-icons-round">warning</span>
        <p>Could not parse SVG structure</p>
      </div>
    `;
    return;
  }

  treeContainer.innerHTML = '';
  // Skip the root <svg> and render its children at top level
  if (tree.children && tree.children.length > 0) {
    // But first render the SVG root node itself
    const rootNode = createNode(tree, 0);
    treeContainer.appendChild(rootNode);
  } else {
    const rootNode = createNode(tree, 0);
    treeContainer.appendChild(rootNode);
  }
}

function createNode(nodeData, depth) {
  const container = document.createElement('div');
  container.className = 'layer-node';
  container.setAttribute('data-node-id', nodeData.id);

  const row = document.createElement('div');
  row.className = 'layer-node__row';
  row.style.paddingLeft = `${8 + depth * 16}px`;

  // Collapse toggle
  const toggle = document.createElement('span');
  toggle.className = 'layer-node__toggle';
  if (nodeData.hasChildren) {
    toggle.innerHTML = '<span class="material-icons-round">chevron_right</span>';
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleNode(container);
    });
  } else {
    toggle.classList.add('layer-node__toggle--hidden');
  }
  row.appendChild(toggle);

  // Element icon
  const icon = document.createElement('span');
  icon.className = 'layer-node__icon material-icons-round';
  icon.textContent = getElementIcon(nodeData.tag);
  row.appendChild(icon);

  // Label (ID or tag)
  const label = document.createElement('span');
  label.className = 'layer-node__label';
  label.textContent = nodeData.id || `<${nodeData.tag}>`;
  row.appendChild(label);

  // Tag badge
  if (nodeData.id) {
    const tag = document.createElement('span');
    tag.className = 'layer-node__tag';
    tag.textContent = nodeData.tag;
    row.appendChild(tag);
  }

  // Interaction badges
  const badges = document.createElement('span');
  badges.className = 'layer-node__badges';
  badges.setAttribute('data-badges-for', nodeData.id);
  row.appendChild(badges);

  // Action buttons
  const actions = document.createElement('span');
  actions.className = 'layer-node__actions';

  // Visibility toggle
  const visBtn = document.createElement('button');
  visBtn.className = 'layer-node__action-btn';
  visBtn.title = 'Toggle visibility';
  visBtn.innerHTML = '<span class="material-icons-round">visibility</span>';
  visBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleVisibility(nodeData.id, visBtn);
  });
  actions.appendChild(visBtn);

  // Lock toggle
  const lockBtn = document.createElement('button');
  lockBtn.className = 'layer-node__action-btn';
  lockBtn.title = 'Toggle lock';
  lockBtn.innerHTML = '<span class="material-icons-round">lock_open</span>';
  lockBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleLock(nodeData.id, lockBtn);
  });
  actions.appendChild(lockBtn);

  row.appendChild(actions);

  // Row click → select
  row.addEventListener('click', () => {
    if (AppState.mode === 'preview') return;

    if (AppState.mode === 'interaction-pick') {
      EventBus.emit('pending-target-selected', nodeData.id);
    } else {
      EventBus.emit('select-element', nodeData.id);
    }
  });

  container.appendChild(row);

  // Children
  if (nodeData.hasChildren) {
    const childrenContainer = document.createElement('div');
    childrenContainer.className = 'layer-node__children layer-node__children--collapsed';

    nodeData.children.forEach(child => {
      childrenContainer.appendChild(createNode(child, depth + 1));
    });

    container.appendChild(childrenContainer);
  }

  return container;
}

function getElementIcon(tag) {
  const icons = {
    svg: 'filter_frames',
    g: 'folder',
    rect: 'crop_square',
    circle: 'circle',
    ellipse: 'circle',
    line: 'horizontal_rule',
    polyline: 'timeline',
    polygon: 'hexagon',
    path: 'gesture',
    text: 'text_fields',
    tspan: 'text_fields',
    image: 'image',
    use: 'content_copy',
    a: 'link',
  };
  return icons[tag] || 'layers';
}

function toggleNode(nodeContainer) {
  const children = nodeContainer.querySelector('.layer-node__children');
  const toggle = nodeContainer.querySelector('.layer-node__toggle');

  if (children) {
    const isCollapsed = children.classList.contains('layer-node__children--collapsed');
    children.classList.toggle('layer-node__children--collapsed');
    toggle.classList.toggle('layer-node__toggle--expanded', isCollapsed);
  }
}

function toggleAllNodes(expand) {
  const allChildren = treeContainer.querySelectorAll('.layer-node__children');
  const allToggles = treeContainer.querySelectorAll('.layer-node__toggle:not(.layer-node__toggle--hidden)');

  allChildren.forEach(el => {
    el.classList.toggle('layer-node__children--collapsed', !expand);
  });
  allToggles.forEach(el => {
    el.classList.toggle('layer-node__toggle--expanded', expand);
  });
}

function toggleVisibility(elementId, btn) {
  const isHidden = AppState.elementVisibility[elementId] === false;
  AppState.elementVisibility[elementId] = isHidden ? true : false;

  const newHidden = !isHidden;
  const icon = btn.querySelector('.material-icons-round');
  icon.textContent = newHidden ? 'visibility_off' : 'visibility';
  btn.classList.toggle('hidden-state', newHidden);

  // Apply to SVG element
  const el = AppState.svgDocument?.querySelector(`#${CSS.escape(elementId)}`);
  if (el) {
    el.style.display = newHidden ? 'none' : '';
  }
}

function toggleLock(elementId, btn) {
  const isLocked = AppState.elementLock[elementId] === true;
  AppState.elementLock[elementId] = !isLocked;

  const newLocked = !isLocked;
  const icon = btn.querySelector('.material-icons-round');
  icon.textContent = newLocked ? 'lock' : 'lock_open';
  btn.classList.toggle('locked-state', newLocked);

  // Apply to SVG element
  const el = AppState.svgDocument?.querySelector(`#${CSS.escape(elementId)}`);
  if (el) {
    if (newLocked) {
      el.classList.add('editor-locked');
    } else {
      el.classList.remove('editor-locked');
    }
  }
}

function highlightNode(elementId) {
  clearHighlight();

  const node = treeContainer.querySelector(`[data-node-id="${elementId}"]`);
  if (!node) return;

  const row = node.querySelector('.layer-node__row');
  if (row) {
    row.classList.add('selected');
    // Scroll into view
    row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    // Expand parent nodes
    expandParents(node);
  }
}

function clearHighlight() {
  treeContainer.querySelectorAll('.layer-node__row.selected').forEach(el => {
    el.classList.remove('selected');
  });
}

function highlightTargetNode(elementId) {
  clearTargetHighlight();

  const node = treeContainer.querySelector(`[data-node-id="${elementId}"]`);
  if (!node) return;

  const row = node.querySelector('.layer-node__row');
  if (row) {
    row.classList.add('target-selected');
    // Scroll into view
    row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    // Expand parent nodes
    expandParents(node);
  }
}

function clearTargetHighlight() {
  treeContainer.querySelectorAll('.layer-node__row.target-selected').forEach(el => {
    el.classList.remove('target-selected');
  });
}

function expandParents(node) {
  let parent = node.parentElement;
  while (parent && parent !== treeContainer) {
    if (parent.classList.contains('layer-node__children')) {
      parent.classList.remove('layer-node__children--collapsed');
      const parentNode = parent.parentElement;
      const toggle = parentNode?.querySelector(':scope > .layer-node__row .layer-node__toggle');
      if (toggle) toggle.classList.add('layer-node__toggle--expanded');
    }
    parent = parent.parentElement;
  }
}

function filterTree() {
  const query = searchInput.value.toLowerCase().trim();
  const allNodes = treeContainer.querySelectorAll('.layer-node');

  if (!query) {
    allNodes.forEach(node => node.style.display = '');
    return;
  }

  allNodes.forEach(node => {
    const nodeId = node.getAttribute('data-node-id') || '';
    const label = node.querySelector('.layer-node__label')?.textContent || '';
    const tag = node.querySelector('.layer-node__tag')?.textContent || '';
    const text = `${nodeId} ${label} ${tag}`.toLowerCase();

    if (text.includes(query)) {
      node.style.display = '';
      expandParents(node);
    } else {
      // Check if any children match
      const childMatches = node.querySelectorAll('.layer-node');
      let hasChildMatch = false;
      childMatches.forEach(child => {
        const childLabel = child.querySelector('.layer-node__label')?.textContent || '';
        if (childLabel.toLowerCase().includes(query)) {
          hasChildMatch = true;
        }
      });
      node.style.display = hasChildMatch ? '' : 'none';
    }
  });
}

function updateBadges() {
  // Clear all badges
  treeContainer.querySelectorAll('.layer-node__badges').forEach(el => {
    el.innerHTML = '';
  });

  // Add badges for elements that have interactions
  AppState.interactions.forEach(interaction => {
    // Trigger badge
    const triggerBadges = treeContainer.querySelector(`[data-badges-for="${interaction.triggerId}"]`);
    if (triggerBadges && !triggerBadges.querySelector('.layer-node__badge--trigger')) {
      const badge = document.createElement('span');
      badge.className = 'layer-node__badge layer-node__badge--trigger';
      badge.title = 'Has trigger';
      triggerBadges.appendChild(badge);
    }

    // Target badge
    const targetBadges = treeContainer.querySelector(`[data-badges-for="${interaction.targetId}"]`);
    if (targetBadges && !targetBadges.querySelector('.layer-node__badge--target')) {
      const badge = document.createElement('span');
      badge.className = 'layer-node__badge layer-node__badge--target';
      badge.title = 'Is target';
      targetBadges.appendChild(badge);
    }
  });
}
