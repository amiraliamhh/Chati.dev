/**
 * @fileoverview Singleton event bus for the chati.dev framework.
 *
 * Provides a centralized EventEmitter for observing state changes
 * across subsystems (build-loop, spawner, pipeline, safety-net).
 */

/**
 * @deprecated Not currently imported by any production module.
 * Retained for potential future integration. Remove if still unused by v4.0.
 */

import { EventEmitter } from 'node:events';

// ---------------------------------------------------------------------------
// Event Names
// ---------------------------------------------------------------------------

/**
 * All framework event names, organized by subsystem.
 */
export const EVENTS = {
  // Build loop
  BUILD_STARTED: 'build:started',
  BUILD_COMPLETED: 'build:completed',
  BUILD_FAILED: 'build:failed',
  TASK_STARTED: 'build:task:started',
  TASK_COMPLETED: 'build:task:completed',
  TASK_FAILED: 'build:task:failed',
  TASK_EXHAUSTED: 'build:task:exhausted',

  // Spawner
  TERMINAL_SPAWNED: 'terminal:spawned',
  TERMINAL_EXITED: 'terminal:exited',
  TERMINAL_KILLED: 'terminal:killed',

  // Pipeline
  PHASE_ADVANCED: 'pipeline:phase:advanced',
  AGENT_COMPLETED: 'pipeline:agent:completed',
  QA_GATE_PASSED: 'pipeline:qa:passed',
  QA_GATE_FAILED: 'pipeline:qa:failed',

  // Safety
  SAFETY_TRIGGERED: 'safety:triggered',

  // Health
  HEALTH_CHECK_COMPLETED: 'health:completed',

  // Escalation
  ESCALATION_TRIGGERED: 'escalation:triggered',
  ESCALATION_PAUSED: 'escalation:paused',
};

// ---------------------------------------------------------------------------
// Bus Instance
// ---------------------------------------------------------------------------

const bus = new EventEmitter();
bus.setMaxListeners(50);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Emit an event with data. Automatically adds a timestamp.
 *
 * @param {string} event - Event name from EVENTS
 * @param {object} [data={}] - Event payload
 */
export function emit(event, data = {}) {
  bus.emit(event, { ...data, timestamp: Date.now() });
}

/**
 * Subscribe to an event.
 *
 * @param {string} event - Event name
 * @param {function} handler - Event handler
 */
export function on(event, handler) {
  bus.on(event, handler);
}

/**
 * Subscribe to an event once.
 *
 * @param {string} event - Event name
 * @param {function} handler - Event handler
 */
export function once(event, handler) {
  bus.once(event, handler);
}

/**
 * Unsubscribe from an event.
 *
 * @param {string} event - Event name
 * @param {function} handler - Event handler to remove
 */
export function off(event, handler) {
  bus.off(event, handler);
}

/**
 * Remove all listeners for an event, or all events if no event specified.
 *
 * @param {string} [event] - Event name (optional)
 */
export function removeAllListeners(event) {
  if (event) {
    bus.removeAllListeners(event);
  } else {
    bus.removeAllListeners();
  }
}

/**
 * Get the count of listeners for an event.
 *
 * @param {string} event - Event name
 * @returns {number}
 */
export function listenerCount(event) {
  return bus.listenerCount(event);
}
