/**
 * @fileoverview Agent customization via per-project override files.
 *
 * Loads `.customize.yaml` files from `chati.dev/customize/<agent>.yaml`
 * and applies overrides to agent prompts.
 *
 * Constitution Article XVI — Model Governance.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Directory relative to project root where customization files are stored. */
const CUSTOMIZE_DIR = 'chati.dev/customize';

/** Valid override fields that customizations can set. */
export const VALID_OVERRIDE_FIELDS = [
  'model',
  'extra_context',
  'skip_sections',
  'add_sections',
  'provider',
  'timeout',
  'max_iterations',
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * @typedef {object} Customization
 * @property {boolean} found - Whether a customization file was found
 * @property {string} [model] - Override model name
 * @property {string} [extra_context] - Additional context to inject
 * @property {string[]} [skip_sections] - Sections to omit from prompt
 * @property {{ name: string, content: string }[]} [add_sections] - Sections to append
 * @property {string} [provider] - Override provider name
 * @property {number} [timeout] - Override timeout in ms
 * @property {number} [max_iterations] - Override max iterations
 */

/**
 * Load customization for a specific agent.
 *
 * @param {string} projectDir - Project root directory
 * @param {string} agentName - Agent name (e.g., 'brief', 'dev')
 * @returns {{ found: boolean, overrides: Customization }}
 */
export function loadCustomization(projectDir, agentName) {
  if (!projectDir || !agentName) {
    return { found: false, overrides: {} };
  }

  const customizePath = join(projectDir, CUSTOMIZE_DIR, `${agentName}.yaml`);

  if (!existsSync(customizePath)) {
    return { found: false, overrides: {} };
  }

  try {
    const raw = readFileSync(customizePath, 'utf-8');
    const parsed = yaml.load(raw);

    if (!parsed || typeof parsed !== 'object') {
      return { found: true, overrides: {} };
    }

    // Filter to valid override fields only
    const overrides = {};
    for (const field of VALID_OVERRIDE_FIELDS) {
      if (parsed[field] !== undefined) {
        overrides[field] = parsed[field];
      }
    }

    return { found: true, overrides };
  } catch {
    return { found: false, overrides: {} };
  }
}

/**
 * Apply customization overrides to an agent prompt.
 *
 * @param {string} agentPrompt - Original agent prompt
 * @param {Customization} customization - Customization overrides
 * @returns {string} Modified prompt
 */
export function applyCustomization(agentPrompt, customization) {
  if (!agentPrompt || !customization) {
    return agentPrompt || '';
  }

  let prompt = agentPrompt;

  // Skip sections
  if (customization.skip_sections && Array.isArray(customization.skip_sections)) {
    for (const sectionName of customization.skip_sections) {
      // Match section heading + all content until the next heading of same or higher level, or end of text
      const pattern = new RegExp(
        `^#{1,3}\\s+${escapeRegex(sectionName)}\\s*\\n[\\s\\S]*?(?=\\n#{1,3}\\s|\\Z)`,
        'gm'
      );
      // \\Z is not JS — use two-pass: try lookahead for next heading, then fallback to end
      const headingPattern = new RegExp(
        `^(#{1,3})\\s+${escapeRegex(sectionName)}[^\\n]*\\n([\\s\\S]*?)(?=^#{1,3}\\s)`,
        'gm'
      );
      let replaced = prompt.replace(headingPattern, '');
      if (replaced === prompt) {
        // Section is at the end — no next heading follows
        const endPattern = new RegExp(
          `^(#{1,3})\\s+${escapeRegex(sectionName)}[^\\n]*\\n[\\s\\S]*$`,
          'gm'
        );
        replaced = prompt.replace(endPattern, '');
      }
      prompt = replaced;
    }
  }

  // Add extra context at the end
  if (customization.extra_context && typeof customization.extra_context === 'string') {
    prompt += `\n\n---\n\n## Additional Context\n\n${customization.extra_context}\n`;
  }

  // Add new sections
  if (customization.add_sections && Array.isArray(customization.add_sections)) {
    for (const section of customization.add_sections) {
      if (section.name && section.content) {
        prompt += `\n\n## ${section.name}\n\n${section.content}\n`;
      }
    }
  }

  return prompt;
}

/**
 * Validate a customization object.
 *
 * @param {object} customization
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateCustomization(customization) {
  const errors = [];

  if (!customization || typeof customization !== 'object') {
    errors.push('Customization must be a non-null object');
    return { valid: false, errors };
  }

  // Check for unknown fields
  for (const key of Object.keys(customization)) {
    if (!VALID_OVERRIDE_FIELDS.includes(key)) {
      errors.push(`Unknown override field: "${key}"`);
    }
  }

  // Validate model
  if (customization.model !== undefined && typeof customization.model !== 'string') {
    errors.push('model must be a string');
  }

  // Validate extra_context
  if (customization.extra_context !== undefined && typeof customization.extra_context !== 'string') {
    errors.push('extra_context must be a string');
  }

  // Validate skip_sections
  if (customization.skip_sections !== undefined) {
    if (!Array.isArray(customization.skip_sections)) {
      errors.push('skip_sections must be an array');
    } else if (customization.skip_sections.some(s => typeof s !== 'string')) {
      errors.push('skip_sections must contain only strings');
    }
  }

  // Validate add_sections
  if (customization.add_sections !== undefined) {
    if (!Array.isArray(customization.add_sections)) {
      errors.push('add_sections must be an array');
    } else {
      for (const section of customization.add_sections) {
        if (!section.name || !section.content) {
          errors.push('Each add_section must have name and content');
        }
      }
    }
  }

  // Validate timeout
  if (customization.timeout !== undefined) {
    if (typeof customization.timeout !== 'number' || customization.timeout <= 0) {
      errors.push('timeout must be a positive number');
    }
  }

  // Validate max_iterations
  if (customization.max_iterations !== undefined) {
    if (typeof customization.max_iterations !== 'number' || customization.max_iterations <= 0) {
      errors.push('max_iterations must be a positive number');
    }
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Escape special regex characters in a string.
 *
 * @param {string} str
 * @returns {string}
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
