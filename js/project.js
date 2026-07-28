/**
 * project.js — Save and load .isvg project files.
 * Project file = JSON containing original SVG source + interactions + metadata.
 */

import { AppState, EventBus, showToast } from './app.js';
import { loadSVGSource } from './svg-importer.js';

export function initProject() {
  // Save project
  EventBus.on('save-project', () => {
    saveProject();
  });

  // Open project file (from file input or drag-drop)
  EventBus.on('open-project-file', (file) => {
    openProjectFile(file);
  });

  // Open project (keyboard shortcut)
  EventBus.on('open-project', () => {
    document.getElementById('file-input-project').click();
  });
}

function saveProject() {
  if (!AppState.svgDocument) {
    showToast('No SVG loaded to save', 'warning');
    return;
  }

  // Serialize the current SVG (clean version without editor attributes)
  const clone = AppState.svgDocument.cloneNode(true);
  clone.querySelectorAll('[data-editor-hoverable]').forEach(el => {
    el.removeAttribute('data-editor-hoverable');
  });
  clone.querySelectorAll('.editor-locked').forEach(el => {
    el.classList.remove('editor-locked');
  });
  // Reset opacities and transitions for clean save
  clone.querySelectorAll('*').forEach(el => {
    el.style.removeProperty('opacity');
    el.style.removeProperty('transition');
    el.style.removeProperty('cursor');
    el.style.removeProperty('display');
  });

  const serializer = new XMLSerializer();
  const svgSource = serializer.serializeToString(clone);

  const project = {
    version: 1,
    fileName: AppState.fileName,
    svgSource: svgSource,
    interactions: AppState.interactions.map(i => ({
      id: i.id,
      triggerId: i.triggerId,
      targetId: i.targetId,
      event: i.event,
      baseOpacity: i.baseOpacity,
      activeOpacity: i.activeOpacity,
      baseScale: i.baseScale,
      activeScale: i.activeScale,
    })),
    elementEffects: { ...AppState.elementEffects },
    metadata: {
      created: new Date().toISOString(),
      interactionCount: AppState.interactions.length,
    },
  };

  const json = JSON.stringify(project, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${AppState.fileName}.isvg`;
  link.click();
  URL.revokeObjectURL(url);

  showToast('Project saved!', 'success');
}

function openProjectFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const project = JSON.parse(e.target.result);
      loadProject(project);
    } catch (err) {
      showToast('Invalid project file', 'error');
      console.error('Project parse error:', err);
    }
  };
  reader.onerror = () => {
    showToast('Failed to read project file', 'error');
  };
  reader.readAsText(file);
}

function loadProject(project) {
  if (!project.svgSource) {
    showToast('Project file has no SVG data', 'error');
    return;
  }

  // Load the SVG
  loadSVGSource(project.svgSource, project.fileName || 'untitled');

  // Wait for SVG to render then apply interactions
  // Use a short delay to ensure SVG is in the DOM
  setTimeout(() => {
    // Restore interactions
    if (project.interactions && Array.isArray(project.interactions)) {
      AppState.interactions = project.interactions.map(i => ({
        id: i.id,
        triggerId: i.triggerId,
        targetId: i.targetId,
        event: i.event || 'both',
        baseOpacity: i.baseOpacity !== undefined ? i.baseOpacity : 0,
        activeOpacity: i.activeOpacity !== undefined ? i.activeOpacity : 1,
        baseScale: i.baseScale !== undefined ? i.baseScale : 1,
        activeScale: i.activeScale !== undefined ? i.activeScale : 1,
      }));

      // Update next ID counter
      const maxId = AppState.interactions.reduce((max, i) => {
        const num = parseInt(i.id.replace('int-', ''));
        return num > max ? num : max;
      }, 0);
      AppState.nextInteractionId = maxId + 1;

      // Apply target opacities
      const targetIds = new Set(AppState.interactions.map(i => i.targetId));
      targetIds.forEach(targetId => {
        const el = AppState.svgDocument?.querySelector(`#${CSS.escape(targetId)}`);
        if (el) {
          el.style.opacity = '0';
          el.style.transition = 'opacity 0.3s ease';
        }
      });

      EventBus.emit('interactions-changed');
    }

    // Restore element effects
    if (project.elementEffects && typeof project.elementEffects === 'object') {
      AppState.elementEffects = { ...project.elementEffects };
    }

    showToast(`Project "${project.fileName}" loaded!`, 'success');
  }, 100);
}
