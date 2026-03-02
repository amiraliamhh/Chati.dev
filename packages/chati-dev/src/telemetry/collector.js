/**
 * @fileoverview Telemetry event collector.
 *
 * Buffers events in memory during pipeline execution.
 * Events are flushed (sent) at pipeline completion or on demand.
 */

import { validateEvent } from './schema.js';

// ---------------------------------------------------------------------------
// Collector
// ---------------------------------------------------------------------------

/** @type {Array<{ type: string, properties: object, timestamp: string }>} */
let buffer = [];

/** @type {boolean} */
let enabled = false;

/**
 * Initialize the collector with enabled state.
 *
 * @param {boolean} isEnabled
 */
export function initCollector(isEnabled) {
  enabled = isEnabled;
  buffer = [];
}

/**
 * Track a telemetry event.
 * Events are buffered until flush() is called.
 * Invalid events are silently dropped.
 *
 * @param {string} type - Event type (from TELEMETRY_EVENTS)
 * @param {object} [properties={}] - Event properties
 */
export function track(type, properties = {}) {
  if (!enabled) return;

  const event = { type, properties };
  const validation = validateEvent(event);

  if (!validation.valid) return; // Silently drop invalid events

  buffer.push({
    type,
    properties,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Flush all buffered events and clear the buffer.
 * Returns empty array if telemetry is disabled.
 *
 * @returns {Array<{ type: string, properties: object, timestamp: string }>}
 */
export function flush() {
  if (!enabled) return [];

  const events = [...buffer];
  buffer = [];
  return events;
}

/**
 * Get current buffer size (for diagnostics).
 *
 * @returns {number}
 */
export function getBufferSize() {
  return buffer.length;
}

/**
 * Get status of the collector.
 *
 * @returns {{ enabled: boolean, buffered: number }}
 */
export function getStatus() {
  return { enabled, buffered: buffer.length };
}
