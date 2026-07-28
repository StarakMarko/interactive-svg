/**
 * app.js — Main application entry point
 * Manages global state, event bus, and module initialization.
 */

import { initToolbar } from './toolbar.js';
import { initCanvas } from './canvas.js';
import { initLayersPanel } from './layers-panel.js';
import { initPropertiesPanel } from './properties-panel.js';
import { applyTargetBaseState } from './interactions.js';
import { initInteractions } from './interactions.js';
import { initPreview } from './preview.js';
import { initExport } from './export.js';
import { initProject } from './project.js';
import { importSVG } from './svg-importer.js';

/* ===== Global Application State ===== */
export const AppState = {
  svgSource: null,        // Original SVG source string
  svgDocument: null,      // Parsed SVG element in the DOM
  interactions: [],       // Array of { id, triggerId, targetId, event }
  selectedElementId: null,
  mode: 'select',         // 'select' | 'interaction-pick' | 'preview'
  pendingTriggerId: null, // trigger ID while in interaction-pick mode
  pendingTargetId: null,  // target ID while in interaction-pick mode
  zoom: 1,
  panX: 0,
  panY: 0,
  elementVisibility: {},  // { elementId: boolean }
  elementLock: {},        // { elementId: boolean }
  nextInteractionId: 1,
  fileName: 'untitled',
  undoStack: [],        // Array of state snapshots for undo
  redoStack: [],        // Array of state snapshots for redo
};


/* ===== Event Bus ===== */
const listeners = {};

export const EventBus = {
  on(event, callback) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(callback);
  },
  off(event, callback) {
    if (!listeners[event]) return;
    listeners[event] = listeners[event].filter(cb => cb !== callback);
  },
  emit(event, data) {
    if (!listeners[event]) return;
    listeners[event].forEach(cb => cb(data));
  }
};


/* ===== Undo/Redo History ===== */

/**
 * Push current state onto the undo stack.
 * Call this BEFORE making a change.
 */
export function pushUndoState() {
  const snapshot = {
    interactions: JSON.parse(JSON.stringify(AppState.interactions)),
    nextInteractionId: AppState.nextInteractionId,
  };
  AppState.undoStack.push(snapshot);
  // Cap undo stack at 50 entries
  if (AppState.undoStack.length > 50) AppState.undoStack.shift();
  // Clear redo stack on new action
  AppState.redoStack = [];
  updateUndoRedoButtons();
}

export function undo() {
  if (AppState.undoStack.length === 0) return;

  // Save current state to redo stack
  const currentSnapshot = {
    interactions: JSON.parse(JSON.stringify(AppState.interactions)),
    nextInteractionId: AppState.nextInteractionId,
  };
  AppState.redoStack.push(currentSnapshot);

  // Restore previous state
  const snapshot = AppState.undoStack.pop();
  AppState.interactions = snapshot.interactions;
  AppState.nextInteractionId = snapshot.nextInteractionId;

  // Re-apply target opacities
  reapplyTargetOpacities();
  updateUndoRedoButtons();
  EventBus.emit('interactions-changed');
  showToast('Undo', 'info');
}

export function redo() {
  if (AppState.redoStack.length === 0) return;

  // Save current state to undo stack
  const currentSnapshot = {
    interactions: JSON.parse(JSON.stringify(AppState.interactions)),
    nextInteractionId: AppState.nextInteractionId,
  };
  AppState.undoStack.push(currentSnapshot);

  // Restore next state
  const snapshot = AppState.redoStack.pop();
  AppState.interactions = snapshot.interactions;
  AppState.nextInteractionId = snapshot.nextInteractionId;

  // Re-apply target opacities
  reapplyTargetBaseStates();
  updateUndoRedoButtons();
  EventBus.emit('interactions-changed');
  showToast('Redo', 'info');
}

function reapplyTargetBaseStates() {
  if (!AppState.svgDocument) return;

  // First reset everything that has editor transforms
  AppState.svgDocument.querySelectorAll('[data-editor-transform]').forEach(el => {
    const orig = el.getAttribute('data-original-transform') || '';
    el.setAttribute('transform', orig);
    if (!orig) el.removeAttribute('transform');
    el.removeAttribute('data-editor-transform');
    el.removeAttribute('data-original-transform');
    el.style.opacity = '';
    el.style.transition = '';
  });

  // Also reset any lingering opacity transitions
  AppState.svgDocument.querySelectorAll('[style*="transition"]').forEach(el => {
    el.style.opacity = '';
    el.style.transition = '';
  });

  // Then apply base states for all current targets
  const uniqueTargets = [...new Set(AppState.interactions.map(i => i.targetId))];
  uniqueTargets.forEach(targetId => {
    applyTargetBaseState(targetId);
  });
}

export function updateUndoRedoButtons() {
  const btnUndo = document.getElementById('btn-undo');
  const btnRedo = document.getElementById('btn-redo');
  if (btnUndo) btnUndo.disabled = AppState.undoStack.length === 0;
  if (btnRedo) btnRedo.disabled = AppState.redoStack.length === 0;
}


/* ===== Toast Notifications ===== */
let toastContainer = null;

export function showToast(message, type = 'info') {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }
  const icons = {
    info: 'info',
    success: 'check_circle',
    warning: 'warning',
    error: 'error'
  };
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.innerHTML = `
    <span class="material-icons-round">${icons[type] || 'info'}</span>
    <span>${message}</span>
  `;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}


/* ===== Utilities ===== */
export function generateId() {
  return 'int-' + (AppState.nextInteractionId++);
}

export function getElementLabel(el) {
  if (!el) return '(unknown)';
  const tag = el.tagName.toLowerCase();
  const id = el.id || '';
  return id ? `#${id}` : `<${tag}>`;
}


/* ===== Initialization ===== */
function init() {
  initToolbar();
  initCanvas();
  initLayersPanel();
  initPropertiesPanel();
  initInteractions();
  initPreview();
  initExport();
  initProject();
  setupDragDrop();
  setupKeyboardShortcuts();
}

function setupDragDrop() {
  const canvasArea = document.getElementById('canvas-area');

  canvasArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    canvasArea.classList.add('drag-over');
  });

  canvasArea.addEventListener('dragleave', () => {
    canvasArea.classList.remove('drag-over');
  });

  canvasArea.addEventListener('drop', (e) => {
    e.preventDefault();
    canvasArea.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.svg')) {
      importSVG(file);
    } else if (file && file.name.endsWith('.isvg')) {
      EventBus.emit('open-project-file', file);
    } else {
      showToast('Please drop an SVG or ISVG file', 'warning');
    }
  });
}

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Ignore shortcuts when typing in inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    const ctrl = e.ctrlKey || e.metaKey;

    if (e.key === 'Escape') {
      if (AppState.mode === 'interaction-pick') {
        EventBus.emit('cancel-pick');
      } else if (AppState.mode === 'preview') {
        EventBus.emit('toggle-preview');
      } else {
        EventBus.emit('deselect');
      }
      e.preventDefault();
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      EventBus.emit('delete-selected-interaction');
      e.preventDefault();
    }

    if (ctrl && e.key === 'z' && !e.shiftKey) {
      undo();
      e.preventDefault();
    }

    if (ctrl && e.key === 'z' && e.shiftKey) {
      redo();
      e.preventDefault();
    }

    if (ctrl && e.key === 'y') {
      redo();
      e.preventDefault();
    }

    if (ctrl && e.key === 's') {
      EventBus.emit('save-project');
      e.preventDefault();
    }

    if (ctrl && e.key === 'o') {
      EventBus.emit('open-project');
      e.preventDefault();
    }

    if (ctrl && e.key === 'e') {
      EventBus.emit('export-svg');
      e.preventDefault();
    }

    if (ctrl && e.key === 'i') {
      EventBus.emit('import-svg');
      e.preventDefault();
    }

    if (e.key === 'p' && !ctrl) {
      EventBus.emit('toggle-preview');
      e.preventDefault();
    }

    if (e.key === '=' || e.key === '+') {
      EventBus.emit('zoom-in');
      e.preventDefault();
    }
    if (e.key === '-') {
      EventBus.emit('zoom-out');
      e.preventDefault();
    }
    if (e.key === '0' && !ctrl) {
      EventBus.emit('zoom-reset');
      e.preventDefault();
    }
  });
}


/* ===== Start ===== */
document.addEventListener('DOMContentLoaded', init);
