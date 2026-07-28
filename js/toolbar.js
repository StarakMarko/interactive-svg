/**
 * toolbar.js — Top toolbar button handlers.
 */

import { AppState, EventBus, showToast, undo, redo } from './app.js';
import { importSVG } from './svg-importer.js';

export function initToolbar() {
  const btnImport = document.getElementById('btn-import');
  const btnImportEmpty = document.getElementById('btn-import-empty');
  const btnOpen = document.getElementById('btn-open');
  const btnSave = document.getElementById('btn-save');
  const btnPreview = document.getElementById('btn-preview');
  const btnExport = document.getElementById('btn-export');
  const btnZoomIn = document.getElementById('btn-zoom-in');
  const btnZoomOut = document.getElementById('btn-zoom-out');
  const btnZoomReset = document.getElementById('btn-zoom-reset');
  const btnUndo = document.getElementById('btn-undo');
  const btnRedo = document.getElementById('btn-redo');

  const fileInputSVG = document.getElementById('file-input-svg');
  const fileInputProject = document.getElementById('file-input-project');

  // Import SVG
  const triggerImport = () => fileInputSVG.click();
  btnImport.addEventListener('click', triggerImport);
  btnImportEmpty.addEventListener('click', triggerImport);

  fileInputSVG.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      importSVG(file);
      fileInputSVG.value = ''; // Reset so same file can be re-imported
    }
  });

  // Open Project
  btnOpen.addEventListener('click', () => fileInputProject.click());

  fileInputProject.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      EventBus.emit('open-project-file', file);
      fileInputProject.value = '';
    }
  });

  // Save Project
  btnSave.addEventListener('click', () => EventBus.emit('save-project'));

  // Preview
  btnPreview.addEventListener('click', () => EventBus.emit('toggle-preview'));

  // Export
  btnExport.addEventListener('click', () => EventBus.emit('export-svg'));

  // Zoom buttons
  btnZoomIn.addEventListener('click', () => EventBus.emit('zoom-in'));
  btnZoomOut.addEventListener('click', () => EventBus.emit('zoom-out'));
  btnZoomReset.addEventListener('click', () => EventBus.emit('zoom-reset'));

  // Undo/Redo buttons
  btnUndo.addEventListener('click', () => undo());
  btnRedo.addEventListener('click', () => redo());

  // Event bus shortcuts
  EventBus.on('import-svg', triggerImport);
  EventBus.on('open-project', () => fileInputProject.click());
  EventBus.on('save-project', () => { /* handled by project.js */ });

  // Preview toggle visual
  EventBus.on('preview-enter', () => {
    btnPreview.classList.add('active');
  });
  EventBus.on('preview-exit', () => {
    btnPreview.classList.remove('active');
  });
}
