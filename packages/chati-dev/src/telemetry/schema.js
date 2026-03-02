/**
 * @fileoverview Telemetry event schema and validation.
 *
 * Defines the 6 event types collected by opt-in telemetry.
 * Zero PII — only anonymous usage metrics.
 */

// ---------------------------------------------------------------------------
// Event Types
// ---------------------------------------------------------------------------

export const TELEMETRY_EVENTS = [
  'installation_completed',
  'agent_completed',
  'gate_evaluated',
  'pipeline_completed',
  'circuit_breaker_triggered',
  'error_occurred',
];

// ---------------------------------------------------------------------------
// Property Schemas (allowed fields per event type)
// ---------------------------------------------------------------------------

const EVENT_PROPERTIES = {
  installation_completed: [
    'providers', 'editors', 'projectType', 'language',
    'primaryProvider', 'installDuration',
  ],
  agent_completed: [
    'agent', 'provider', 'model', 'duration', 'score',
    'retryCount', 'pipelineType',
  ],
  gate_evaluated: [
    'gate', 'result', 'score', 'blockers',
  ],
  pipeline_completed: [
    'pipelineType', 'totalDuration', 'agentsRun', 'finalStatus',
    'abandonedAt', 'totalCost', 'deviationCount',
  ],
  circuit_breaker_triggered: [
    'trigger', 'agent', 'provider',
  ],
  error_occurred: [
    'errorType', 'agent', 'provider', 'phase',
  ],
};

// ---------------------------------------------------------------------------
// PII blocklist — fields that MUST NEVER appear in telemetry
// ---------------------------------------------------------------------------

const PII_BLOCKLIST = [
  'path', 'filePath', 'fileName', 'directory', 'cwd',
  'apiKey', 'token', 'secret', 'password', 'credential',
  'email', 'username', 'name', 'ip', 'hostname',
  'content', 'code', 'source', 'prompt', 'message',
  'stackTrace', 'stack',
];

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate a telemetry event.
 *
 * @param {{ type: string, properties?: object }} event
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateEvent(event) {
  const errors = [];

  if (!event || typeof event !== 'object') {
    return { valid: false, errors: ['Event must be an object'] };
  }

  if (!event.type || !TELEMETRY_EVENTS.includes(event.type)) {
    errors.push(`Unknown event type: "${event.type}". Valid: ${TELEMETRY_EVENTS.join(', ')}`);
  }

  const props = event.properties || {};

  // Check for PII fields
  for (const key of Object.keys(props)) {
    if (PII_BLOCKLIST.includes(key)) {
      errors.push(`PII field detected: "${key}" — must not be included in telemetry`);
    }
  }

  // Check for PII in values (paths, emails)
  for (const [key, value] of Object.entries(props)) {
    if (typeof value === 'string') {
      if (value.includes('/Users/') || value.includes('/home/') || value.includes('C:\\Users\\')) {
        errors.push(`PII detected in "${key}": value contains filesystem path`);
      }
      if (value.includes('@') && value.includes('.')) {
        errors.push(`PII detected in "${key}": value looks like an email`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
