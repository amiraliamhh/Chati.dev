/**
 * Tests for agent customization via .customize.yaml files.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import {
  loadCustomization,
  applyCustomization,
  validateCustomization,
  VALID_OVERRIDE_FIELDS,
} from '../../src/config/agent-customizer.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let tmpDir;

before(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'customizer-test-'));
});

after(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// VALID_OVERRIDE_FIELDS
// ---------------------------------------------------------------------------

describe('VALID_OVERRIDE_FIELDS', () => {
  it('should contain expected fields', () => {
    assert.ok(VALID_OVERRIDE_FIELDS.includes('model'));
    assert.ok(VALID_OVERRIDE_FIELDS.includes('extra_context'));
    assert.ok(VALID_OVERRIDE_FIELDS.includes('skip_sections'));
    assert.ok(VALID_OVERRIDE_FIELDS.includes('add_sections'));
    assert.ok(VALID_OVERRIDE_FIELDS.includes('provider'));
    assert.ok(VALID_OVERRIDE_FIELDS.includes('timeout'));
    assert.ok(VALID_OVERRIDE_FIELDS.includes('max_iterations'));
  });

  it('should have exactly 7 fields', () => {
    assert.equal(VALID_OVERRIDE_FIELDS.length, 7);
  });
});

// ---------------------------------------------------------------------------
// loadCustomization
// ---------------------------------------------------------------------------

describe('loadCustomization', () => {
  it('should return found=false when no file exists', () => {
    const result = loadCustomization(tmpDir, 'nonexistent');
    assert.equal(result.found, false);
    assert.deepEqual(result.overrides, {});
  });

  it('should return found=false with null projectDir', () => {
    const result = loadCustomization(null, 'brief');
    assert.equal(result.found, false);
  });

  it('should return found=false with null agentName', () => {
    const result = loadCustomization(tmpDir, null);
    assert.equal(result.found, false);
  });

  it('should load valid customization file', () => {
    const customizeDir = join(tmpDir, 'chati.dev', 'customize');
    mkdirSync(customizeDir, { recursive: true });
    writeFileSync(join(customizeDir, 'brief.yaml'), 'model: opus\nextra_context: "Use formal tone"\n', 'utf-8');

    const result = loadCustomization(tmpDir, 'brief');
    assert.equal(result.found, true);
    assert.equal(result.overrides.model, 'opus');
    assert.equal(result.overrides.extra_context, 'Use formal tone');
  });

  it('should filter out unknown fields', () => {
    const customizeDir = join(tmpDir, 'chati.dev', 'customize');
    mkdirSync(customizeDir, { recursive: true });
    writeFileSync(join(customizeDir, 'dev.yaml'), 'model: opus\nunknown_field: bad\ntimeout: 30000\n', 'utf-8');

    const result = loadCustomization(tmpDir, 'dev');
    assert.equal(result.found, true);
    assert.equal(result.overrides.model, 'opus');
    assert.equal(result.overrides.timeout, 30000);
    assert.equal(result.overrides.unknown_field, undefined);
  });

  it('should handle empty YAML file', () => {
    const customizeDir = join(tmpDir, 'chati.dev', 'customize');
    mkdirSync(customizeDir, { recursive: true });
    writeFileSync(join(customizeDir, 'empty.yaml'), '', 'utf-8');

    const result = loadCustomization(tmpDir, 'empty');
    assert.equal(result.found, true);
    assert.deepEqual(result.overrides, {});
  });

  it('should handle malformed YAML gracefully', () => {
    const customizeDir = join(tmpDir, 'chati.dev', 'customize');
    mkdirSync(customizeDir, { recursive: true });
    // Use content that js-yaml parses as object but with no valid override fields
    writeFileSync(join(customizeDir, 'broken.yaml'), '{{invalid yaml content}}', 'utf-8');

    const result = loadCustomization(tmpDir, 'broken');
    // js-yaml parses this as an object — found=true but no valid override fields
    assert.equal(result.found, true);
    assert.deepEqual(result.overrides, {});
  });
});

// ---------------------------------------------------------------------------
// applyCustomization
// ---------------------------------------------------------------------------

describe('applyCustomization', () => {
  it('should return original prompt with null customization', () => {
    const result = applyCustomization('Hello world', null);
    assert.equal(result, 'Hello world');
  });

  it('should return empty string with null prompt', () => {
    const result = applyCustomization(null, { model: 'opus' });
    assert.equal(result, '');
  });

  it('should append extra_context', () => {
    const result = applyCustomization('Base prompt', { extra_context: 'Be formal' });
    assert.ok(result.includes('Base prompt'));
    assert.ok(result.includes('Be formal'));
    assert.ok(result.includes('Additional Context'));
  });

  it('should append add_sections', () => {
    const result = applyCustomization('Base prompt', {
      add_sections: [
        { name: 'Custom Rules', content: 'Always use TypeScript' },
      ],
    });
    assert.ok(result.includes('## Custom Rules'));
    assert.ok(result.includes('Always use TypeScript'));
  });

  it('should skip specified sections', () => {
    const prompt = '# Agent\n\n## Recovery Protocol\n\nRecovery content here.\n\n## Output\n\nOutput content.';
    const result = applyCustomization(prompt, {
      skip_sections: ['Recovery Protocol'],
    });
    assert.ok(!result.includes('Recovery content here'));
    assert.ok(result.includes('Output content'));
  });

  it('should handle add_sections with missing name or content', () => {
    const result = applyCustomization('Base', {
      add_sections: [
        { name: 'Valid', content: 'Content' },
        { name: '', content: 'No name' },
        { content: 'Missing name' },
      ],
    });
    assert.ok(result.includes('## Valid'));
    // Invalid sections should not be appended
    assert.ok(!result.includes('No name'));
    assert.ok(!result.includes('Missing name'));
  });
});

// ---------------------------------------------------------------------------
// validateCustomization
// ---------------------------------------------------------------------------

describe('validateCustomization', () => {
  it('should validate a correct customization', () => {
    const result = validateCustomization({
      model: 'opus',
      extra_context: 'Extra info',
      timeout: 30000,
    });
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it('should reject null input', () => {
    const result = validateCustomization(null);
    assert.equal(result.valid, false);
    assert.ok(result.errors[0].includes('non-null object'));
  });

  it('should flag unknown fields', () => {
    const result = validateCustomization({ model: 'opus', foo: 'bar' });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('Unknown override field: "foo"')));
  });

  it('should flag non-string model', () => {
    const result = validateCustomization({ model: 123 });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('model must be a string')));
  });

  it('should flag non-array skip_sections', () => {
    const result = validateCustomization({ skip_sections: 'not-array' });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('skip_sections must be an array')));
  });

  it('should flag skip_sections with non-string elements', () => {
    const result = validateCustomization({ skip_sections: ['valid', 123] });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('only strings')));
  });

  it('should flag add_sections without name/content', () => {
    const result = validateCustomization({
      add_sections: [{ name: 'OK' }],
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('name and content')));
  });

  it('should flag negative timeout', () => {
    const result = validateCustomization({ timeout: -1 });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('timeout must be a positive')));
  });

  it('should flag non-number max_iterations', () => {
    const result = validateCustomization({ max_iterations: 'ten' });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('max_iterations must be a positive')));
  });
});
