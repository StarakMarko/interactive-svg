/**
 * export.js — Export interactive SVG with embedded script and styles.
 * The exported SVG is a standalone file that works in any browser.
 */

import { AppState, EventBus, showToast } from './app.js';

export function initExport() {
  EventBus.on('export-svg', () => {
    exportSVG();
  });
}

function exportSVG() {
  if (!AppState.svgDocument) {
    showToast('No SVG loaded', 'warning');
    return;
  }

  if (AppState.interactions.length === 0) {
    showToast('No interactions to export', 'warning');
    return;
  }

  // Clone the SVG
  const clone = AppState.svgDocument.cloneNode(true);

  // Remove editor-specific attributes
  clone.querySelectorAll('[data-editor-hoverable]').forEach(el => {
    el.removeAttribute('data-editor-hoverable');
  });
  clone.querySelectorAll('.editor-locked').forEach(el => {
    el.classList.remove('editor-locked');
  });

  // Remove inline styles we added (opacity, transition, cursor, display)
  clone.querySelectorAll('*').forEach(el => {
    el.style.removeProperty('opacity');
    el.style.removeProperty('transition');
    el.style.removeProperty('cursor');
    el.style.removeProperty('display');
  });

  // Remove any leftover empty style attributes
  clone.querySelectorAll('[style=""]').forEach(el => {
    el.removeAttribute('style');
  });

  // Serialize the clean SVG (without script/style) using XMLSerializer
  const serializer = new XMLSerializer();
  let svgString = serializer.serializeToString(clone);

  // Build CSS string for targets
  let cssRules = '';
  let hasBlinkEffect = AppState.interactions.some(i => i.effect === 'always-blink');
  AppState.interactions.forEach(i => {
    const baseOpacity = i.baseOpacity !== undefined ? i.baseOpacity : 0;
    cssRules += `    #${CSS.escape(i.targetId)} {\n      opacity: ${baseOpacity};\n      transition: opacity 0.3s ease;\n    }\n`;
  });

  // Add keyframes for always-blink effect
  if (hasBlinkEffect) {
    cssRules += `    @keyframes isvg-blink {\n      0%, 66.7% { opacity: 1; }\n      66.7%, 100% { opacity: 0.7; }\n    }\n`;
  }

  const styleBlock = `<style>\n    /* Interactive SVG — Generated Styles */\n${cssRules}  </style>`;

  // Build the JS string with interactions data
  const interactionsJSON = JSON.stringify(AppState.interactions.map(i => ({
    triggerId: i.triggerId,
    targetId: i.targetId,
    event: i.event,
    effect: i.effect || 'none',
    baseOpacity: i.baseOpacity !== undefined ? i.baseOpacity : 0,
    activeOpacity: i.activeOpacity !== undefined ? i.activeOpacity : 1,
    baseScale: i.baseScale !== undefined ? i.baseScale : 1,
    activeScale: i.activeScale !== undefined ? i.activeScale : 1,
  })));



  const scriptBlock = `<script type="text/javascript">
// <![CDATA[
(function() {
  var interactions = ${interactionsJSON};

  function applyScale(el, scale) {
    if (!el._origTransform && el._origTransform !== "") {
      el._origTransform = el.getAttribute("transform") || "";
    }
    var orig = el._origTransform;
    if (scale === 1) {
      el.setAttribute("transform", orig);
      return;
    }
    try {
      var bbox = el.getBBox();
      var cx = bbox.x + bbox.width / 2;
      var cy = bbox.y + bbox.height / 2;
      var scaleT = "translate(" + cx + "," + cy + ") scale(" + scale + ") translate(" + (-cx) + "," + (-cy) + ")";
      el.setAttribute("transform", orig + " " + scaleT);
    } catch(e) {
      el.setAttribute("transform", orig);
    }
  }

  function init() {
    interactions.forEach(function(interaction) {
      var trigger = document.getElementById(interaction.triggerId);
      var target = document.getElementById(interaction.targetId);
      if (!trigger || !target) return;

      trigger.style.cursor = "pointer";

      var baseOpacity = interaction.baseOpacity;
      var activeOpacity = interaction.activeOpacity;
      var baseScale = interaction.baseScale;
      var activeScale = interaction.activeScale;

      // Apply initial base scale
      if (baseScale !== 1) {
        applyScale(target, baseScale);
      }

      function showTarget() {
        target.style.opacity = activeOpacity;
        if (activeScale !== 1 || baseScale !== 1) {
          applyScale(target, activeScale);
        }
      }

      function hideTarget() {
        target.style.opacity = baseOpacity;
        if (activeScale !== 1 || baseScale !== 1) {
          applyScale(target, baseScale);
        }
      }

      if (interaction.event === "hover") {
        trigger.addEventListener("mouseenter", showTarget);
        trigger.addEventListener("mouseleave", hideTarget);
      }

      if (interaction.event === "click") {
        trigger.addEventListener("click", function(e) {
          e.stopPropagation();
          var current = parseFloat(target.style.opacity);
          if (isNaN(current)) current = parseFloat(window.getComputedStyle(target).opacity);
          if (isNaN(current) || Math.abs(current - activeOpacity) > 0.01) {
            showTarget();
          } else {
            hideTarget();
          }
        });
    });

    // Apply interaction effects to Triggers
    var processedTriggers = {};
    interactions.forEach(function(interaction) {
      var trgId = interaction.triggerId;
      var effect = interaction.effect || "none";
      if (effect === "none") return;

      var effectKey = trgId + "-" + effect;
      if (processedTriggers[effectKey]) return;
      processedTriggers[effectKey] = true;

      var trg = document.getElementById(trgId);
      if (!trg) return;

      if (effect === "zoom-on-hover") {
        trg.addEventListener("mouseenter", function() {
          trg.style.transition = "transform 0.2s ease, opacity 0.3s ease";
          applyScale(trg, 1.1);
        });
        trg.addEventListener("mouseleave", function() {
          trg.style.transition = "transform 0.2s ease, opacity 0.3s ease";
          applyScale(trg, 1);
        });
      }

      if (effect === "always-blink") {
        trg.style.opacity = 1;
        trg.style.transition = "opacity 0.3s ease";
        var blinkRef = { timer: null };
        function doBlink(toOpacity, nextDelay) {
          trg.style.opacity = toOpacity;
          blinkRef.timer = setTimeout(function() {
            if (toOpacity === 1) {
              doBlink(0.7, 500);
            } else {
              doBlink(1, 1000);
            }
          }, nextDelay);
        }
        doBlink(1, 1000);
      }
    });
  }

  // Run after DOM is ready — handles both inline SVG and standalone SVG file
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
// ]]>
</script>`;

  // Inject style and script right before the closing </svg> tag
  // This ensures all elements are already in the DOM when the script runs
  svgString = svgString.replace(/<\/svg>\s*$/, `\n  ${styleBlock}\n  ${scriptBlock}\n</svg>`);

  // Add XML declaration
  svgString = '<?xml version="1.0" encoding="UTF-8"?>\n' + svgString;

  // Download
  const blob = new Blob([svgString], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${AppState.fileName}-interactive.svg`;
  link.click();
  URL.revokeObjectURL(url);

  showToast('Interactive SVG exported!', 'success');
}
