/**
 * @fileoverview Extension loader for chati.dev.
 *
 * Discovers and loads project-level extensions from
 * `chati.dev/extensions/*.js`, validates them, and registers
 * them in the extension registry.
 *
 * Constitution Article XIV — Framework Registry Governance.
 */

import { existsSync, readdirSync } from 'fs';
import { join, extname, basename } from 'path';
import { registerExtension, EXTENSION_POINTS } from './registry.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Directory relative to project root where extensions are stored. */
const EXTENSIONS_DIR = 'chati.dev/extensions';

/** Required fields in an extension module's default export. */
const REQUIRED_FIELDS = ['name', 'point', 'handler'];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate an extension object has the required shape.
 *
 * @param {object} ext - Extension object to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateExtension(ext) {
  const errors = [];

  if (!ext || typeof ext !== 'object') {
    errors.push('Extension must be a non-null object');
    return { valid: false, errors };
  }

  for (const field of REQUIRED_FIELDS) {
    if (ext[field] === undefined || ext[field] === null) {
      errors.push(`Missing required field: "${field}"`);
    }
  }

  if (ext.name !== undefined && typeof ext.name !== 'string') {
    errors.push('name must be a string');
  }

  if (ext.point !== undefined) {
    const validPoints = Object.values(EXTENSION_POINTS);
    if (!validPoints.includes(ext.point)) {
      errors.push(`Invalid extension point: "${ext.point}". Valid: ${validPoints.join(', ')}`);
    }
  }

  if (ext.handler !== undefined && typeof ext.handler !== 'function') {
    errors.push('handler must be a function');
  }

  if (ext.priority !== undefined && typeof ext.priority !== 'number') {
    errors.push('priority must be a number');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Discover extension files in the project extensions directory.
 *
 * @param {string} projectDir - Project root directory
 * @returns {{ files: string[], dir: string }}
 */
export function discoverExtensions(projectDir) {
  if (!projectDir) {
    return { files: [], dir: '' };
  }

  const extDir = join(projectDir, EXTENSIONS_DIR);

  if (!existsSync(extDir)) {
    return { files: [], dir: extDir };
  }

  try {
    const entries = readdirSync(extDir);
    const jsFiles = entries
      .filter(f => extname(f) === '.js')
      .map(f => join(extDir, f));

    return { files: jsFiles, dir: extDir };
  } catch {
    return { files: [], dir: extDir };
  }
}

/**
 * Load and register all extensions from a project directory.
 *
 * @param {string} projectDir - Project root directory
 * @returns {Promise<{ loaded: number, failed: number, errors: Array<{ file: string, error: string }> }>}
 */
export async function loadProjectExtensions(projectDir) {
  const { files } = discoverExtensions(projectDir);
  let loaded = 0;
  let failed = 0;
  const errors = [];

  for (const filePath of files) {
    try {
      const mod = await import(filePath);
      const ext = mod.default || mod;

      const validation = validateExtension(ext);
      if (!validation.valid) {
        failed++;
        errors.push({
          file: basename(filePath),
          error: validation.errors.join('; '),
        });
        continue;
      }

      const result = registerExtension(ext.point, ext.handler, {
        name: ext.name,
        priority: ext.priority || 0,
      });

      if (result.registered) {
        loaded++;
      } else {
        failed++;
        errors.push({
          file: basename(filePath),
          error: result.error || 'Registration failed',
        });
      }
    } catch (err) {
      failed++;
      errors.push({
        file: basename(filePath),
        error: err.message,
      });
    }
  }

  return { loaded, failed, errors };
}
