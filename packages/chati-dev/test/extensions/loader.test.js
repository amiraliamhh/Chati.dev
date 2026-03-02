/**
 * Tests for extension loader.
 */

import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import {
  validateExtension,
  discoverExtensions,
} from '../../src/extensions/loader.js';
import { EXTENSION_POINTS, clearExtensions } from '../../src/extensions/registry.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let tmpDir;

before(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ext-loader-test-'));
});

after(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

afterEach(() => {
  clearExtensions();
});

// ---------------------------------------------------------------------------
// validateExtension
// ---------------------------------------------------------------------------

describe('validateExtension', () => {
  it('should validate a correct extension', () => {
    const result = validateExtension({
      name: 'my-ext',
      point: EXTENSION_POINTS.PRE_AGENT,
      handler: () => 'ok',
    });
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it('should reject null input', () => {
    const result = validateExtension(null);
    assert.equal(result.valid, false);
    assert.ok(result.errors[0].includes('non-null object'));
  });

  it('should flag missing required fields', () => {
    const result = validateExtension({});
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('name')));
    assert.ok(result.errors.some(e => e.includes('point')));
    assert.ok(result.errors.some(e => e.includes('handler')));
  });

  it('should flag invalid extension point', () => {
    const result = validateExtension({
      name: 'test',
      point: 'invalid_point',
      handler: () => {},
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('Invalid extension point')));
  });

  it('should flag non-function handler', () => {
    const result = validateExtension({
      name: 'test',
      point: EXTENSION_POINTS.PRE_AGENT,
      handler: 'not-a-function',
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('handler must be a function')));
  });

  it('should flag non-number priority', () => {
    const result = validateExtension({
      name: 'test',
      point: EXTENSION_POINTS.PRE_AGENT,
      handler: () => {},
      priority: 'high',
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('priority must be a number')));
  });

  it('should accept valid priority', () => {
    const result = validateExtension({
      name: 'test',
      point: EXTENSION_POINTS.PRE_AGENT,
      handler: () => {},
      priority: 10,
    });
    assert.equal(result.valid, true);
  });
});

// ---------------------------------------------------------------------------
// discoverExtensions
// ---------------------------------------------------------------------------

describe('discoverExtensions', () => {
  it('should return empty for null projectDir', () => {
    const result = discoverExtensions(null);
    assert.equal(result.files.length, 0);
  });

  it('should return empty when extensions dir does not exist', () => {
    const result = discoverExtensions(tmpDir);
    assert.equal(result.files.length, 0);
  });

  it('should discover .js files in extensions directory', () => {
    const extDir = join(tmpDir, 'chati.dev', 'extensions');
    mkdirSync(extDir, { recursive: true });
    writeFileSync(join(extDir, 'my-ext.js'), 'export default {};\n', 'utf-8');
    writeFileSync(join(extDir, 'another.js'), 'export default {};\n', 'utf-8');
    writeFileSync(join(extDir, 'readme.md'), '# Docs\n', 'utf-8');

    const result = discoverExtensions(tmpDir);
    assert.equal(result.files.length, 2);
    assert.ok(result.files.every(f => f.endsWith('.js')));
  });

  it('should ignore non-js files', () => {
    const extDir = join(tmpDir, 'chati.dev', 'extensions');
    mkdirSync(extDir, { recursive: true });
    writeFileSync(join(extDir, 'config.yaml'), 'key: value\n', 'utf-8');

    const result = discoverExtensions(tmpDir);
    // Only .js files from the previous test + this one
    const yamlFiles = result.files.filter(f => f.endsWith('.yaml'));
    assert.equal(yamlFiles.length, 0);
  });
});
