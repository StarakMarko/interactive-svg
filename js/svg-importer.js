/**
 * svg-importer.js — Import and parse SVG files
 * Reads .svg files, parses them, auto-assigns IDs, and triggers canvas render.
 */

import { AppState, EventBus, showToast } from './app.js';

let idCounter = 0;

/**
 * Import an SVG file into the editor.
 * @param {File} file
 */
export function importSVG(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const svgSource = e.target.result;
    loadSVGSource(svgSource, file.name);
  };
  reader.onerror = () => {
    showToast('Failed to read SVG file', 'error');
  };
  reader.readAsText(file);
}

/**
 * Load SVG from a source string.
 * @param {string} svgSource - raw SVG markup
 * @param {string} [fileName]
 */
export function loadSVGSource(svgSource, fileName) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgSource, 'image/svg+xml');

  // Check for parse errors
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    showToast('Invalid SVG file', 'error');
    return;
  }

  const svgEl = doc.querySelector('svg');
  if (!svgEl) {
    showToast('No <svg> element found', 'error');
    return;
  }

  // Auto-assign IDs to elements that lack them
  idCounter = 0;
  assignIds(svgEl);

  // Store in state
  AppState.svgSource = svgSource;
  AppState.svgDocument = svgEl;
  AppState.interactions = [];
  AppState.selectedElementId = null;
  AppState.mode = 'select';
  AppState.pendingTriggerId = null;
  AppState.zoom = 1;
  AppState.panX = 0;
  AppState.panY = 0;
  AppState.elementVisibility = {};
  AppState.elementLock = {};
  AppState.nextInteractionId = 1;
  if (fileName) {
    AppState.fileName = fileName.replace(/\.svg$/i, '');
  }

  showToast(`Imported "${AppState.fileName}.svg"`, 'success');
  EventBus.emit('svg-loaded', svgEl);
}

/**
 * Recursively assign IDs to SVG elements that don't have one.
 */
function assignIds(element) {
  const tagsToId = [
    'svg', 'g', 'rect', 'circle', 'ellipse', 'line', 'polyline',
    'polygon', 'path', 'text', 'tspan', 'image', 'use', 'symbol',
    'defs', 'clipPath', 'mask', 'pattern', 'linearGradient',
    'radialGradient', 'stop', 'foreignObject', 'a'
  ];

  if (element.nodeType !== 1) return; // Not an element node

  const tag = element.tagName.toLowerCase();
  if (tagsToId.includes(tag) && !element.id) {
    element.id = `el-${String(++idCounter).padStart(3, '0')}`;
  }

  for (const child of element.children) {
    assignIds(child);
  }
}

/**
 * Get a flat list of all meaningful SVG elements.
 */
export function getAllElements(svgEl) {
  const result = [];
  const skipTags = ['defs', 'clippath', 'mask', 'pattern', 'lineargradient',
    'radialgradient', 'stop', 'symbol', 'metadata', 'title', 'desc'];

  function walk(el, depth) {
    if (el.nodeType !== 1) return;
    const tag = el.tagName.toLowerCase();
    if (skipTags.includes(tag)) return;
    if (tag === 'svg' && depth > 0) return; // Skip nested SVGs

    result.push({ element: el, depth });

    for (const child of el.children) {
      walk(child, depth + 1);
    }
  }

  walk(svgEl, 0);
  return result;
}

/**
 * Build a tree structure from SVG DOM for the layers panel.
 */
export function buildElementTree(svgEl) {
  const skipTags = ['defs', 'clippath', 'mask', 'pattern', 'lineargradient',
    'radialgradient', 'stop', 'symbol', 'metadata', 'title', 'desc', 'style', 'script'];

  function buildNode(el) {
    if (el.nodeType !== 1) return null;
    const tag = el.tagName.toLowerCase();
    if (skipTags.includes(tag)) return null;

    const children = [];
    for (const child of el.children) {
      const node = buildNode(child);
      if (node) children.unshift(node);
    }

    return {
      id: el.id || '',
      tag: tag,
      element: el,
      children,
      hasChildren: children.length > 0
    };
  }

  return buildNode(svgEl);
}
