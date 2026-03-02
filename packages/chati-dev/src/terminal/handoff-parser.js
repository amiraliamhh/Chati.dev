/**
 * @fileoverview Parse structured handoff data from spawned agent output.
 *
 * Agents running in separate `claude -p` terminals include a
 * <chati-handoff> block in their output. This module extracts
 * and parses that block so the orchestrator can read the results.
 *
 * Includes integrity validation via schema checking (Item 13).
 */

import { validateSchema, HANDOFF_SCHEMA } from '../utils/schema-validator.js';

/**
 * Valid status values for handoff blocks.
 * @type {string[]}
 */
const VALID_STATUSES = ['APPROVED', 'NEEDS_REVISION', 'BLOCKED', 'unknown'];

/**
 * Parse the <chati-handoff> block from agent stdout.
 *
 * Returns validation info alongside parsed data for integrity checking.
 *
 * @param {string} output - Full stdout from the agent process
 * @returns {{ found: boolean, handoff: object|null, rawOutput: string, valid: boolean, warnings: string[] }}
 */
export function parseAgentOutput(output) {
  if (!output || typeof output !== 'string') {
    return { found: false, handoff: null, rawOutput: '', valid: false, warnings: ['No output provided'] };
  }

  const match = output.match(/<chati-handoff>([\s\S]*?)<\/chati-handoff>/);
  if (!match) {
    return { found: false, handoff: null, rawOutput: output, valid: false, warnings: ['No handoff block found'] };
  }

  const content = match[1].trim();
  const handoff = parseHandoffFields(content);

  // Validate the parsed handoff
  const { valid, warnings } = validateHandoff(handoff);

  return { found: true, handoff, rawOutput: output, valid, warnings };
}

/**
 * Validate a parsed handoff against the schema and business rules.
 *
 * @param {object} handoff
 * @returns {{ valid: boolean, warnings: string[] }}
 */
export function validateHandoff(handoff) {
  const warnings = [];

  if (!handoff) {
    return { valid: false, warnings: ['Handoff is null'] };
  }

  // Schema validation
  const schemaResult = validateSchema(handoff, HANDOFF_SCHEMA);
  warnings.push(...schemaResult.errors, ...schemaResult.warnings);

  // Business rule: status must be a valid value
  if (handoff.status && !VALID_STATUSES.includes(handoff.status)) {
    warnings.push(`Invalid status "${handoff.status}" — expected one of: ${VALID_STATUSES.join(', ')}`);
  }

  // Business rule: score must be 0-100
  if (handoff.score !== null && handoff.score !== undefined) {
    if (typeof handoff.score !== 'number' || handoff.score < 0 || handoff.score > 100) {
      warnings.push(`Score ${handoff.score} is out of range 0-100`);
    }
  }

  // A handoff is valid if there are no errors (warnings are OK)
  const hasErrors = schemaResult.errors.length > 0 ||
    (handoff.status && !VALID_STATUSES.includes(handoff.status));

  return { valid: !hasErrors, warnings };
}

/**
 * Parse YAML-like key-value fields from the handoff block content.
 *
 * Supports:
 *   scalar: value
 *   list:
 *     - item1
 *     - item2
 *   map:
 *     key1: value1
 *     key2: value2
 *
 * @param {string} content - Content inside <chati-handoff> tags
 * @returns {object} Parsed handoff data
 */
function parseHandoffFields(content) {
  const result = {
    status: 'unknown',
    score: null,
    summary: '',
    outputs: [],
    decisions: {},
    blockers: [],
    needs_input_question: null,
    provider: null,
    model: null,
  };

  const lines = content.split('\n');
  let currentKey = null;
  let currentType = null; // 'list' | 'map'

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check if this is a list item (  - value)
    const listMatch = trimmed.match(/^-\s+(.+)/);
    if (listMatch && currentKey && currentType === 'list') {
      if (Array.isArray(result[currentKey])) {
        result[currentKey].push(listMatch[1].trim());
      }
      continue;
    }

    // Check if this is a map item (  key: value) under a map key
    const mapMatch = trimmed.match(/^(\w[\w_-]*):\s+(.+)/);
    if (mapMatch && currentKey && currentType === 'map') {
      if (typeof result[currentKey] === 'object' && !Array.isArray(result[currentKey])) {
        result[currentKey][mapMatch[1]] = mapMatch[2].trim();
      }
      continue;
    }

    // Top-level key: value
    const kvMatch = trimmed.match(/^(\w[\w_-]*):\s*(.*)/);
    if (kvMatch) {
      const key = kvMatch[1];
      const value = kvMatch[2].trim();

      // Known list keys
      if (['outputs', 'blockers'].includes(key)) {
        currentKey = key;
        currentType = 'list';
        // If value is inline (not empty), treat as single item
        if (value && value !== '') {
          result[key] = [value];
          currentKey = null;
          currentType = null;
        }
        continue;
      }

      // Known map keys
      if (['decisions'].includes(key)) {
        currentKey = key;
        currentType = 'map';
        continue;
      }

      // Scalar keys
      currentKey = null;
      currentType = null;

      if (key === 'status') {
        result.status = value || 'unknown';
      } else if (key === 'score') {
        const num = parseInt(value, 10);
        result.score = isNaN(num) ? null : num;
      } else if (key === 'summary') {
        result.summary = value || '';
      } else if (key === 'needs_input_question') {
        result.needs_input_question = value === 'null' || value === '' ? null : value;
      } else if (key === 'provider') {
        result.provider = value || null;
      } else if (key === 'model') {
        result.model = value || null;
      }
    }
  }

  return result;
}
