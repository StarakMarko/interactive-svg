/**
 * canvas.js — Canvas rendering, zoom/pan, selection, and hover highlights.
 */

import { AppState, EventBus, showToast } from './app.js';

let svgViewport, canvasContainer, selectionOverlay, canvasEmpty;
let isPanning = false;
let panStartX = 0, panStartY = 0;
let spaceHeld = false;

export function initCanvas() {
  svgViewport = document.getElementById('svg-viewport');
  canvasContainer = document.getElementById('canvas-container');
  selectionOverlay = document.getElementById('selection-overlay');
  canvasEmpty = document.getElementById('canvas-empty');
  const btnConfirmTarget = document.getElementById('btn-confirm-target');

  btnConfirmTarget.addEventListener('click', (e) => {
    e.stopPropagation();
    if (AppState.mode === 'interaction-pick' && AppState.pendingTargetId) {
      EventBus.emit('pick-target', AppState.pendingTargetId);
    }
  });

  // Listen for SVG load
  EventBus.on('svg-loaded', (svgEl) => {
    renderSVG(svgEl);
  });

  // Listen for selection events
  EventBus.on('select-element', (elementId) => {
    selectElement(elementId);
  });

  EventBus.on('deselect', () => {
    clearSelection();
  });

  // Zoom events
  EventBus.on('zoom-in', () => setZoom(AppState.zoom * 1.2));
  EventBus.on('zoom-out', () => setZoom(AppState.zoom / 1.2));
  EventBus.on('zoom-reset', () => {
    AppState.panX = 0;
    AppState.panY = 0;
    setZoom(1);
  });

  // Interaction pick mode
  EventBus.on('enter-pick-mode', () => {
    svgViewport.classList.add('interaction-pick-mode');
  });
  EventBus.on('cancel-pick', () => {
    svgViewport.classList.remove('interaction-pick-mode');
    AppState.mode = 'select';
    AppState.pendingTriggerId = null;
    AppState.pendingTargetId = null;
    document.getElementById('pick-banner').classList.add('pick-banner--hidden');
    clearTargetSelectionVisual();
  });
  EventBus.on('pick-completed', () => {
    svgViewport.classList.remove('interaction-pick-mode');
    AppState.pendingTargetId = null;
    clearTargetSelectionVisual();
  });

  EventBus.on('pending-target-selected', (id) => {
    AppState.pendingTargetId = id;
    drawTargetSelectionOutline(id);
  });
  EventBus.on('pending-target-deselected', () => {
    AppState.pendingTargetId = null;
    clearTargetSelectionVisual();
  });

  // Preview mode
  EventBus.on('preview-enter', () => {
    svgViewport.classList.add('preview-mode');
    clearSelectionVisual();
  });
  EventBus.on('preview-exit', () => {
    svgViewport.classList.remove('preview-mode');
  });

  // Canvas interaction events
  setupMouseEvents();
  setupWheelZoom();

  // Space key for panning
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.target.tagName !== 'INPUT') {
      spaceHeld = true;
      canvasContainer.style.cursor = 'grab';
    }
  });
  document.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      spaceHeld = false;
      canvasContainer.style.cursor = '';
    }
  });

  // Refresh selection outline when zoom changes
  EventBus.on('zoom-changed', () => {
    if (AppState.selectedElementId) {
      drawSelectionOutline(AppState.selectedElementId);
    }
  });
}

function renderSVG(svgEl) {
  // Clear viewport
  svgViewport.innerHTML = '';
  selectionOverlay.innerHTML = '';

  // Clone and insert SVG
  const clone = svgEl.cloneNode(true);

  // Make all meaningful elements hoverable
  makeElementsHoverable(clone);

  svgViewport.appendChild(clone);
  AppState.svgDocument = clone;

  // Reset transform
  AppState.zoom = 1;
  AppState.panX = 0;
  AppState.panY = 0;
  applyTransform();

  // Hide empty state
  canvasEmpty.classList.add('canvas-empty--hidden');

  // Center SVG
  requestAnimationFrame(() => centerSVG());

  EventBus.emit('svg-rendered', clone);
}

function makeElementsHoverable(svgEl) {
  const interactiveTags = [
    'g', 'rect', 'circle', 'ellipse', 'line', 'polyline',
    'polygon', 'path', 'text', 'image', 'use'
  ];

  function walk(el) {
    if (el.nodeType !== 1) return;
    const tag = el.tagName.toLowerCase();

    if (interactiveTags.includes(tag) && tag !== 'svg') {
      el.setAttribute('data-editor-hoverable', 'true');
    }

    for (const child of el.children) {
      walk(child);
    }
  }

  walk(svgEl);
}

function centerSVG() {
  const svg = svgViewport.querySelector('svg');
  if (!svg) return;

  const canvasRect = canvasContainer.getBoundingClientRect();
  const svgRect = svg.getBoundingClientRect();

  // Fit SVG with padding
  const padding = 60;
  const scaleX = (canvasRect.width - padding * 2) / (svgRect.width / AppState.zoom);
  const scaleY = (canvasRect.height - padding * 2) / (svgRect.height / AppState.zoom);
  const scale = Math.min(scaleX, scaleY, 1.5); // Don't scale above 150%

  AppState.zoom = scale;

  const svgW = (svgRect.width / 1) * scale; // recalc after zoom
  const svgH = (svgRect.height / 1) * scale;

  // We need to get the natural size of the SVG
  const naturalW = svg.viewBox?.baseVal?.width || svg.width?.baseVal?.value || svgRect.width;
  const naturalH = svg.viewBox?.baseVal?.height || svg.height?.baseVal?.value || svgRect.height;

  AppState.panX = (canvasRect.width - naturalW * scale) / 2;
  AppState.panY = (canvasRect.height - naturalH * scale) / 2;

  applyTransform();
}

function setupMouseEvents() {
  canvasContainer.addEventListener('mousedown', (e) => {
    if (AppState.mode === 'preview') return;

    // Middle click or Space + click: start panning
    if (e.button === 1 || (e.button === 0 && spaceHeld)) {
      isPanning = true;
      panStartX = e.clientX - AppState.panX;
      panStartY = e.clientY - AppState.panY;
      canvasContainer.style.cursor = 'grabbing';
      e.preventDefault();
      return;
    }

    // Left click: selection
    if (e.button === 0 && !spaceHeld) {
      const target = getNextClickTarget(e.target);

      if (target) {
        const id = target.id;
        if (AppState.mode === 'interaction-pick') {
          EventBus.emit('pending-target-selected', id);
        } else {
          EventBus.emit('select-element', id);
        }
      } else {
        // Clicked on empty canvas
        if (AppState.mode === 'interaction-pick') {
          EventBus.emit('pending-target-deselected');
        } else {
          EventBus.emit('deselect');
        }
      }
    }
  });

  document.addEventListener('mousemove', (e) => {
    if (isPanning) {
      AppState.panX = e.clientX - panStartX;
      AppState.panY = e.clientY - panStartY;
      applyTransform();
    }
  });

  document.addEventListener('mouseup', (e) => {
    if (isPanning) {
      isPanning = false;
      canvasContainer.style.cursor = spaceHeld ? 'grab' : '';
    }
  });

  // Hover highlighting
  canvasContainer.addEventListener('mouseover', (e) => {
    if (AppState.mode === 'preview') return;
    const target = getNextClickTarget(e.target);
    const activeId = AppState.mode === 'interaction-pick' ? AppState.pendingTargetId : AppState.selectedElementId;
    if (target && target.id !== activeId) {
      drawHoverOutline(target.id);
    } else if (!target) {
      clearHoverOutline();
    }
  });

  canvasContainer.addEventListener('mouseout', (e) => {
    if (AppState.mode === 'preview') return;
    // Only clear if we are leaving the canvas or moving to something non-hoverable
    const nextTarget = getNextClickTarget(e.relatedTarget);
    if (!nextTarget) {
      clearHoverOutline();
    }
  });
}

function setupWheelZoom() {
  canvasContainer.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.1, Math.min(5, AppState.zoom * delta));

    // Zoom toward mouse position
    const rect = canvasContainer.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const ratio = newZoom / AppState.zoom;
    AppState.panX = mx - ratio * (mx - AppState.panX);
    AppState.panY = my - ratio * (my - AppState.panY);

    setZoom(newZoom);
  }, { passive: false });
}

function getClickTargetsPath(target) {
  const path = [];
  let el = target;
  while (el && el !== svgViewport) {
    if (el.hasAttribute && el.hasAttribute('data-editor-hoverable')) {
      if (!AppState.elementLock[el.id] && AppState.elementVisibility[el.id] !== false) {
        path.push(el);
      }
    }
    el = el.parentElement;
  }
  return path.reverse(); // Top-most group first, leaf element last
}

function getNextClickTarget(target) {
  const path = getClickTargetsPath(target);
  if (path.length === 0) return null;

  const currentId = AppState.mode === 'interaction-pick' ? AppState.pendingTargetId : AppState.selectedElementId;
  const currentIndex = path.findIndex(el => el.id === currentId);

  if (currentIndex === -1) {
    return path[0]; // Nothing in path is selected, select top-most
  } else if (currentIndex < path.length - 1) {
    return path[currentIndex + 1]; // Drill down to next child
  } else {
    return path[path.length - 1]; // Stop at leaf, no cycle
  }
}

function selectElement(elementId) {
  AppState.selectedElementId = elementId;
  drawSelectionOutline(elementId);
  EventBus.emit('element-selected', elementId);
}

function clearSelection() {
  AppState.selectedElementId = null;
  clearSelectionVisual();
  EventBus.emit('element-deselected');
}

function clearSelectionVisual() {
  selectionOverlay.innerHTML = '';
}

export function drawSelectionOutline(elementId) {
  selectionOverlay.innerHTML = '';

  const el = AppState.svgDocument?.querySelector(`#${CSS.escape(elementId)}`);
  if (!el) return;

  const bbox = getElementBBox(el);
  if (!bbox) return;

  const padding = 3 / AppState.zoom;

  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', bbox.x - padding + AppState.panX);
  rect.setAttribute('y', bbox.y - padding + AppState.panY);
  rect.setAttribute('width', bbox.width + padding * 2);
  rect.setAttribute('height', bbox.height + padding * 2);
  rect.setAttribute('fill', 'none');
  rect.setAttribute('stroke', '#4f6ef7');
  rect.setAttribute('stroke-width', 2 / AppState.zoom);
  rect.setAttribute('stroke-dasharray', `${4 / AppState.zoom}`);
  rect.setAttribute('rx', 2 / AppState.zoom);

  // Corner handles
  const handleSize = 6 / AppState.zoom;
  const corners = [
    [bbox.x - padding, bbox.y - padding],
    [bbox.x + bbox.width + padding, bbox.y - padding],
    [bbox.x - padding, bbox.y + bbox.height + padding],
    [bbox.x + bbox.width + padding, bbox.y + bbox.height + padding],
  ];

  selectionOverlay.appendChild(rect);

  corners.forEach(([cx, cy]) => {
    const handle = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    handle.setAttribute('x', cx - handleSize / 2 + AppState.panX);
    handle.setAttribute('y', cy - handleSize / 2 + AppState.panY);
    handle.setAttribute('width', handleSize);
    handle.setAttribute('height', handleSize);
    handle.setAttribute('fill', '#ffffff');
    handle.setAttribute('stroke', '#4f6ef7');
    handle.setAttribute('stroke-width', 1.5 / AppState.zoom);
    handle.setAttribute('rx', 1 / AppState.zoom);
    selectionOverlay.appendChild(handle);
  });
}

let hoverRect = null;

function drawHoverOutline(elementId) {
  clearHoverOutline();

  const el = AppState.svgDocument?.querySelector(`#${CSS.escape(elementId)}`);
  if (!el) return;

  const bbox = getElementBBox(el);
  if (!bbox) return;

  const padding = 2 / AppState.zoom;

  hoverRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  hoverRect.setAttribute('x', bbox.x - padding + AppState.panX);
  hoverRect.setAttribute('y', bbox.y - padding + AppState.panY);
  hoverRect.setAttribute('width', bbox.width + padding * 2);
  hoverRect.setAttribute('height', bbox.height + padding * 2);
  hoverRect.setAttribute('fill', 'rgba(79, 110, 247, 0.04)');
  hoverRect.setAttribute('stroke', 'rgba(79, 110, 247, 0.4)');
  hoverRect.setAttribute('stroke-width', 1.5 / AppState.zoom);
  hoverRect.setAttribute('rx', 2 / AppState.zoom);
  hoverRect.setAttribute('data-hover', 'true');

  selectionOverlay.appendChild(hoverRect);
}

function clearHoverOutline() {
  if (hoverRect && hoverRect.parentNode) {
    hoverRect.remove();
  }
  hoverRect = null;
  // Also remove any leftover hover rects
  selectionOverlay.querySelectorAll('[data-hover]').forEach(el => el.remove());
}

function getElementBBox(el) {
  try {
    // Use getBBox which gives us the coordinates in SVG space
    const bbox = el.getBBox();
    // Get the CTM (current transformation matrix) to handle nested transforms
    const ctm = el.getCTM();
    const svg = AppState.svgDocument;
    const svgCTM = svg.getCTM() || svg.getScreenCTM();

    if (ctm && svgCTM) {
      // Get the relative transform from the element to the SVG root
      const point1 = svg.createSVGPoint();
      point1.x = bbox.x;
      point1.y = bbox.y;
      const point2 = svg.createSVGPoint();
      point2.x = bbox.x + bbox.width;
      point2.y = bbox.y + bbox.height;

      const relMatrix = svgCTM.inverse().multiply(ctm);
      const transformedP1 = point1.matrixTransform(relMatrix);
      const transformedP2 = point2.matrixTransform(relMatrix);

      const minX = Math.min(transformedP1.x, transformedP2.x);
      const minY = Math.min(transformedP1.y, transformedP2.y);
      const maxX = Math.max(transformedP1.x, transformedP2.x);
      const maxY = Math.max(transformedP1.y, transformedP2.y);

      return {
        x: minX * AppState.zoom,
        y: minY * AppState.zoom,
        width: (maxX - minX) * AppState.zoom,
        height: (maxY - minY) * AppState.zoom,
      };
    }

    // Fallback: direct bbox in zoom space
    return {
      x: bbox.x * AppState.zoom,
      y: bbox.y * AppState.zoom,
      width: bbox.width * AppState.zoom,
      height: bbox.height * AppState.zoom,
    };
  } catch (e) {
    return null;
  }
}

let targetRect = null;

export function drawTargetSelectionOutline(elementId) {
  clearTargetSelectionVisual();

  const el = AppState.svgDocument?.querySelector(`#${CSS.escape(elementId)}`);
  if (!el) return;

  const bbox = getElementBBox(el);
  if (!bbox) return;

  const padding = 3 / AppState.zoom;

  targetRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  targetRect.setAttribute('x', bbox.x - padding + AppState.panX);
  targetRect.setAttribute('y', bbox.y - padding + AppState.panY);
  targetRect.setAttribute('width', bbox.width + padding * 2);
  targetRect.setAttribute('height', bbox.height + padding * 2);
  targetRect.setAttribute('fill', 'rgba(51, 153, 204, 0.1)'); // blue tint
  targetRect.setAttribute('stroke', '#3399cc');
  targetRect.setAttribute('stroke-width', 2 / AppState.zoom);
  targetRect.setAttribute('stroke-dasharray', `${4 / AppState.zoom}`);
  targetRect.setAttribute('rx', 2 / AppState.zoom);
  
  selectionOverlay.appendChild(targetRect);

  // Position the confirm button on the right edge of the bbox
  const btn = document.getElementById('btn-confirm-target');
  if (btn) {
    btn.classList.remove('target-confirm-btn--hidden');
    // We position it relative to the canvas-container, so we need to add pan/zoom
    const btnX = bbox.x + bbox.width + AppState.panX + 16;
    const btnY = bbox.y + bbox.height / 2 + AppState.panY;
    btn.style.left = `${btnX}px`;
    btn.style.top = `${btnY}px`;
  }
}

function clearTargetSelectionVisual() {
  if (targetRect && targetRect.parentNode) {
    targetRect.remove();
  }
  targetRect = null;
  const btn = document.getElementById('btn-confirm-target');
  if (btn) btn.classList.add('target-confirm-btn--hidden');
}

export function setZoom(newZoom) {
  AppState.zoom = Math.max(0.1, Math.min(5, newZoom));
  applyTransform();
  EventBus.emit('zoom-changed', AppState.zoom);
  document.getElementById('zoom-display').textContent = `${Math.round(AppState.zoom * 100)}%`;
}

function applyTransform() {
  svgViewport.style.transform = `translate(${AppState.panX}px, ${AppState.panY}px) scale(${AppState.zoom})`;

  // Update selection overlay if active
  if (AppState.selectedElementId) {
    drawSelectionOutline(AppState.selectedElementId);
  }
  if (AppState.pendingTargetId) {
    drawTargetSelectionOutline(AppState.pendingTargetId);
  }
}
