/**
 * @fileoverview Lightweight schema validation for runtime data.
 *
 * Validates session.yaml, build-state.json, config.yaml, and handoff
 * blocks against defined schemas. No external dependencies.
 *
 * Constitution Article XIV — Framework Registry Governance.
 */

// ---------------------------------------------------------------------------
// Validation Engine
// ---------------------------------------------------------------------------

/**
 * @typedef {object} SchemaProperty
 * @property {string} type - Expected type (string|number|boolean|array|object)
 * @property {boolean} [required] - Whether field is required
 * @property {*} [default] - Default value if missing
 * @property {*[]} [enum] - Allowed values
 * @property {number} [min] - Minimum value (for numbers)
 * @property {number} [max] - Maximum value (for numbers)
 * @property {number} [minLength] - Minimum length (for strings/arrays)
 * @property {number} [maxLength] - Maximum length (for strings/arrays)
 */

/**
 * @typedef {object} Schema
 * @property {string[]} [required] - Required field names
 * @property {Record<string, SchemaProperty>} properties - Property definitions
 */

/**
 * @typedef {object} ValidationResult
 * @property {boolean} valid - Whether data passes validation
 * @property {string[]} errors - List of validation errors
 * @property {string[]} warnings - List of validation warnings
 */

/**
 * Validate data against a schema.
 *
 * @param {object} data - Data to validate
 * @param {Schema} schema - Schema definition
 * @returns {ValidationResult}
 */
export function validateSchema(data, schema) {
  const errors = [];
  const warnings = [];

  if (!data || typeof data !== 'object') {
    errors.push('Data must be a non-null object');
    return { valid: false, errors, warnings };
  }

  if (!schema || !schema.properties) {
    return { valid: true, errors, warnings };
  }

  // Check required fields
  const requiredFields = schema.required || [];
  for (const field of requiredFields) {
    if (data[field] === undefined || data[field] === null) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Validate each defined property
  for (const [key, prop] of Object.entries(schema.properties)) {
    const value = data[key];

    // Skip undefined/null non-required fields
    if (value === undefined || (value === null && !requiredFields.includes(key))) {
      continue;
    }

    // Type check
    if (prop.type) {
      const actual = getType(value);
      if (actual !== prop.type) {
        errors.push(`Field "${key}": expected ${prop.type}, got ${actual}`);
        continue;
      }
    }

    // Enum check
    if (prop.enum && !prop.enum.includes(value)) {
      errors.push(`Field "${key}": value "${value}" not in allowed values [${prop.enum.join(', ')}]`);
    }

    // Number range
    if (prop.type === 'number') {
      if (prop.min !== undefined && value < prop.min) {
        errors.push(`Field "${key}": value ${value} below minimum ${prop.min}`);
      }
      if (prop.max !== undefined && value > prop.max) {
        errors.push(`Field "${key}": value ${value} above maximum ${prop.max}`);
      }
    }

    // String/Array length
    if (prop.type === 'string' || prop.type === 'array') {
      const len = value.length;
      if (prop.minLength !== undefined && len < prop.minLength) {
        warnings.push(`Field "${key}": length ${len} below recommended minimum ${prop.minLength}`);
      }
      if (prop.maxLength !== undefined && len > prop.maxLength) {
        warnings.push(`Field "${key}": length ${len} above recommended maximum ${prop.maxLength}`);
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate data and apply default values for missing fields.
 *
 * @param {object} data - Data to validate (will NOT be mutated)
 * @param {Schema} schema - Schema definition
 * @returns {{ valid: boolean, data: object, errors: string[], warnings: string[] }}
 */
export function validateAndCoerce(data, schema) {
  const result = validateSchema(data, schema);

  // Create a copy with defaults applied
  const coerced = { ...data };

  if (schema.properties) {
    for (const [key, prop] of Object.entries(schema.properties)) {
      if (coerced[key] === undefined && prop.default !== undefined) {
        coerced[key] = prop.default;
      }
    }
  }

  return {
    valid: result.valid,
    data: coerced,
    errors: result.errors,
    warnings: result.warnings,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get the type of a value (matching schema type names).
 *
 * @param {*} value
 * @returns {string}
 */
function getType(value) {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

// ---------------------------------------------------------------------------
// Built-in Schemas
// ---------------------------------------------------------------------------

/**
 * Session schema (session.yaml).
 */
export const SESSION_SCHEMA = {
  required: ['project', 'language'],
  properties: {
    project: { type: 'string', required: true, minLength: 1 },
    language: { type: 'string', required: true, default: 'en' },
    pipeline_phase: { type: 'string', enum: ['discover', 'plan', 'build', 'deploy', 'completed'] },
    current_agent: { type: 'string' },
    governance_mode: { type: 'string', enum: ['planning', 'build', 'deploy'] },
    execution_profile: { type: 'string', enum: ['explore', 'guided', 'autonomous'] },
    context_bracket: { type: 'string', enum: ['FRESH', 'MODERATE', 'DEPLETED', 'CRITICAL'] },
  },
};

/**
 * Build state schema (build-state.json).
 */
export const BUILD_STATE_SCHEMA = {
  required: ['sessionId', 'status', 'checkpoints'],
  properties: {
    sessionId: { type: 'string', required: true },
    status: { type: 'string', required: true, enum: ['idle', 'running', 'completed', 'failed', 'abandoned'] },
    checkpoints: { type: 'array', required: true },
    startedAt: { type: 'string' },
    totalAttempts: { type: 'number', min: 0 },
  },
};

/**
 * Config schema (config.yaml).
 */
export const CONFIG_SCHEMA = {
  required: ['version'],
  properties: {
    version: { type: 'string', required: true },
    installed_at: { type: 'string' },
    updated_at: { type: 'string' },
    installer_version: { type: 'string' },
    project_type: { type: 'string', enum: ['greenfield', 'brownfield'] },
    language: { type: 'string', default: 'en' },
    ides: { type: 'array' },
    providers: { type: 'object' },
    agent_overrides: { type: 'object' },
  },
};

/**
 * Handoff schema (parsed handoff block).
 */
export const HANDOFF_SCHEMA = {
  required: ['status'],
  properties: {
    status: { type: 'string', required: true, enum: ['APPROVED', 'NEEDS_REVISION', 'BLOCKED', 'unknown'] },
    score: { type: 'number', min: 0, max: 100 },
    summary: { type: 'string', maxLength: 2000 },
    outputs: { type: 'array' },
    decisions: { type: 'object' },
    blockers: { type: 'array' },
    needs_input_question: { type: 'string' },
  },
};
