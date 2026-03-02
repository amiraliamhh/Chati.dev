/**
 * @fileoverview Extension point registry for chati.dev.
 *
 * Provides a mechanism for registering, retrieving, and
 * executing extension handlers at defined extension points.
 *
 * Constitution Article XIV — Framework Registry Governance.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Available extension points in the pipeline lifecycle. */
export const EXTENSION_POINTS = {
  PRE_AGENT: 'pre_agent',
  POST_AGENT: 'post_agent',
  PRE_BUILD: 'pre_build',
  POST_BUILD: 'post_build',
  HEALTH_CHECK: 'health_check',
  CUSTOM_GATE: 'custom_gate',
};

// ---------------------------------------------------------------------------
// Internal State
// ---------------------------------------------------------------------------

/** @type {Map<string, Array<{ handler: Function, name: string, priority: number }>>} */
const _registry = new Map();

// Initialize registry with empty arrays for each point
for (const point of Object.values(EXTENSION_POINTS)) {
  _registry.set(point, []);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Register an extension handler at a specific point.
 *
 * @param {string} point - Extension point (from EXTENSION_POINTS)
 * @param {Function} handler - Handler function
 * @param {{ name?: string, priority?: number }} [options={}]
 * @returns {{ registered: boolean, error?: string }}
 */
export function registerExtension(point, handler, options = {}) {
  if (!Object.values(EXTENSION_POINTS).includes(point)) {
    return { registered: false, error: `Unknown extension point: ${point}` };
  }

  if (typeof handler !== 'function') {
    return { registered: false, error: 'Handler must be a function' };
  }

  const name = options.name || handler.name || 'anonymous';
  const priority = options.priority || 0;

  const extensions = _registry.get(point);
  extensions.push({ handler, name, priority });

  // Sort by priority (higher first)
  extensions.sort((a, b) => b.priority - a.priority);

  return { registered: true };
}

/**
 * Get all extensions registered at a point.
 *
 * @param {string} point - Extension point
 * @returns {Array<{ handler: Function, name: string, priority: number }>}
 */
export function getExtensions(point) {
  return _registry.get(point) || [];
}

/**
 * Execute all extensions at a point with given context.
 *
 * @param {string} point - Extension point
 * @param {object} context - Context passed to each handler
 * @returns {Promise<{ results: Array<{ name: string, result: any, error?: string }>, executed: number }>}
 */
export async function executeExtensions(point, context = {}) {
  const extensions = getExtensions(point);
  const results = [];

  for (const ext of extensions) {
    try {
      const result = await ext.handler(context);
      results.push({ name: ext.name, result });
    } catch (err) {
      results.push({ name: ext.name, result: null, error: err.message });
    }
  }

  return { results, executed: extensions.length };
}

/**
 * Clear all extensions (or extensions at a specific point).
 *
 * @param {string} [point] - Optional point to clear (clears all if omitted)
 */
export function clearExtensions(point) {
  if (point) {
    if (_registry.has(point)) {
      _registry.set(point, []);
    }
  } else {
    for (const key of _registry.keys()) {
      _registry.set(key, []);
    }
  }
}

/**
 * Get count of registered extensions.
 *
 * @returns {{ total: number, byPoint: Record<string, number> }}
 */
export function getExtensionStats() {
  const byPoint = {};
  let total = 0;

  for (const [point, extensions] of _registry.entries()) {
    byPoint[point] = extensions.length;
    total += extensions.length;
  }

  return { total, byPoint };
}
