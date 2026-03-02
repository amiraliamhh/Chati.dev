/**
 * @fileoverview Public API surface for chati-dev.
 *
 * Re-exports stable functions from core modules, providing
 * a clean entry point for programmatic usage.
 *
 * @example
 * import { createSession, runHealthChecks, classifyIntent } from 'chati-dev/api';
 */

// ---------------------------------------------------------------------------
// Health & Diagnostics
// ---------------------------------------------------------------------------

export { runHealthChecks } from '../health/engine.js';

// ---------------------------------------------------------------------------
// Context Engine (PRISM)
// ---------------------------------------------------------------------------

export { runPrism } from '../context/engine.js';

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export { classifyIntent, INTENT_TYPES } from '../orchestrator/intent-classifier.js';
export {
  initPipeline,
  advancePipeline,
  initQuickFlowPipeline,
  initStandardFlowPipeline,
} from '../orchestrator/pipeline-manager.js';
export { selectAgent } from '../orchestrator/agent-selector.js';

// ---------------------------------------------------------------------------
// Session Management
// ---------------------------------------------------------------------------

import {
  initSession as _initSession,
  loadSession as _loadSession,
  updateSession as _updateSession,
  validateSession as _validateSession,
  getSessionSummary as _getSessionSummary,
  claimSession as _claimSession,
  releaseSession as _releaseSession,
  getSessionOwner as _getSessionOwner,
} from '../orchestrator/session-manager.js';

export {
  _initSession as initSession,
  _loadSession as loadSession,
  _updateSession as updateSession,
  _validateSession as validateSession,
  _getSessionSummary as getSessionSummary,
  _claimSession as claimSession,
  _releaseSession as releaseSession,
  _getSessionOwner as getSessionOwner,
};

// ---------------------------------------------------------------------------
// Autonomy
// ---------------------------------------------------------------------------

export { runBuildLoop } from '../autonomy/build-loop.js';
export { checkSafety, SAFETY_TRIGGERS } from '../autonomy/safety-net.js';

// ---------------------------------------------------------------------------
// Memory
// ---------------------------------------------------------------------------

export { recordError, getGotchas } from '../memory/gotchas.js';

// ---------------------------------------------------------------------------
// Quality
// ---------------------------------------------------------------------------

export { getMetricsHistory, getQualityDashboard, recordMetric } from '../quality/metrics-collector.js';

// ---------------------------------------------------------------------------
// Extensions
// ---------------------------------------------------------------------------

export {
  registerExtension,
  getExtensions,
  executeExtensions,
  clearExtensions,
  EXTENSION_POINTS,
} from '../extensions/registry.js';
export { loadProjectExtensions, validateExtension } from '../extensions/loader.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export { loadCustomization, applyCustomization, validateCustomization } from '../config/agent-customizer.js';
export { IDE_CONFIGS, getIDEChoices } from '../config/ide-configs.js';

// ---------------------------------------------------------------------------
// Convenience Wrapper
// ---------------------------------------------------------------------------

/**
 * Create and initialize a new chati.dev session.
 *
 * Convenience wrapper that initializes session state.
 *
 * @param {string} projectDir - Project root directory
 * @param {object} [options]
 * @param {string} [options.mode='discover'] - Initial pipeline mode
 * @param {boolean} [options.isGreenfield=true] - Project type
 * @param {string} [options.language='en'] - Interaction language
 * @param {string} [options.projectName=''] - Project name
 * @param {string[]} [options.ides=[]] - Selected IDEs
 * @param {string[]} [options.mcps=[]] - Selected MCPs
 * @returns {{ created: boolean, session: object, path: string }}
 */
export function createSession(projectDir, options = {}) {
  return _initSession(projectDir, {
    mode: options.mode || 'discover',
    isGreenfield: options.isGreenfield !== false,
    language: options.language || 'en',
    projectName: options.projectName || '',
    ides: options.ides || [],
    mcps: options.mcps || [],
  });
}
