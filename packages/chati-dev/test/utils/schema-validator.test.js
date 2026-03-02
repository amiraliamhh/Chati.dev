import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateSchema,
  validateAndCoerce,
  SESSION_SCHEMA,
  BUILD_STATE_SCHEMA,
  CONFIG_SCHEMA,
  HANDOFF_SCHEMA,
} from '../../src/utils/schema-validator.js';

// ---------------------------------------------------------------------------
// validateSchema — basic
// ---------------------------------------------------------------------------

describe('validateSchema — basic', () => {
  it('should pass valid data', () => {
    const schema = {
      required: ['name'],
      properties: {
        name: { type: 'string', required: true },
        age: { type: 'number' },
      },
    };
    const result = validateSchema({ name: 'Alice', age: 30 }, schema);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it('should fail on missing required field', () => {
    const schema = {
      required: ['name'],
      properties: {
        name: { type: 'string', required: true },
      },
    };
    const result = validateSchema({}, schema);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('name')));
  });

  it('should fail on type mismatch', () => {
    const schema = {
      properties: {
        count: { type: 'number' },
      },
    };
    const result = validateSchema({ count: 'not a number' }, schema);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('count')));
  });

  it('should fail on enum violation', () => {
    const schema = {
      properties: {
        status: { type: 'string', enum: ['active', 'inactive'] },
      },
    };
    const result = validateSchema({ status: 'deleted' }, schema);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('deleted')));
  });

  it('should fail on number below min', () => {
    const schema = {
      properties: {
        score: { type: 'number', min: 0, max: 100 },
      },
    };
    const result = validateSchema({ score: -5 }, schema);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('below minimum')));
  });

  it('should fail on number above max', () => {
    const schema = {
      properties: {
        score: { type: 'number', min: 0, max: 100 },
      },
    };
    const result = validateSchema({ score: 150 }, schema);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('above maximum')));
  });

  it('should warn on string below minLength', () => {
    const schema = {
      properties: {
        name: { type: 'string', minLength: 3 },
      },
    };
    const result = validateSchema({ name: 'ab' }, schema);
    assert.equal(result.valid, true); // warnings don't fail validation
    assert.ok(result.warnings.length > 0);
  });

  it('should handle null data gracefully', () => {
    const schema = { properties: { x: { type: 'string' } } };
    const result = validateSchema(null, schema);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('non-null object')));
  });

  it('should handle null schema gracefully', () => {
    const result = validateSchema({ x: 1 }, null);
    assert.equal(result.valid, true);
  });

  it('should skip undefined non-required fields', () => {
    const schema = {
      properties: {
        optional: { type: 'string' },
      },
    };
    const result = validateSchema({}, schema);
    assert.equal(result.valid, true);
  });

  it('should validate array type', () => {
    const schema = {
      properties: {
        items: { type: 'array' },
      },
    };
    assert.equal(validateSchema({ items: [1, 2] }, schema).valid, true);
    assert.equal(validateSchema({ items: 'not array' }, schema).valid, false);
  });
});

// ---------------------------------------------------------------------------
// validateAndCoerce
// ---------------------------------------------------------------------------

describe('validateAndCoerce', () => {
  it('should apply defaults for missing fields', () => {
    const schema = {
      properties: {
        name: { type: 'string' },
        language: { type: 'string', default: 'en' },
      },
    };
    const result = validateAndCoerce({ name: 'test' }, schema);
    assert.equal(result.data.language, 'en');
    assert.equal(result.data.name, 'test');
  });

  it('should not overwrite existing values with defaults', () => {
    const schema = {
      properties: {
        language: { type: 'string', default: 'en' },
      },
    };
    const result = validateAndCoerce({ language: 'pt' }, schema);
    assert.equal(result.data.language, 'pt');
  });

  it('should not mutate original data', () => {
    const schema = {
      properties: {
        language: { type: 'string', default: 'en' },
      },
    };
    const data = { name: 'test' };
    validateAndCoerce(data, schema);
    assert.equal(data.language, undefined);
  });
});

// ---------------------------------------------------------------------------
// Built-in Schemas
// ---------------------------------------------------------------------------

describe('SESSION_SCHEMA', () => {
  it('should validate a correct session', () => {
    const session = {
      project: 'my-app',
      language: 'en',
      pipeline_phase: 'build',
      governance_mode: 'build',
    };
    const result = validateSchema(session, SESSION_SCHEMA);
    assert.equal(result.valid, true);
  });

  it('should fail on missing project', () => {
    const result = validateSchema({ language: 'en' }, SESSION_SCHEMA);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('project')));
  });
});

describe('BUILD_STATE_SCHEMA', () => {
  it('should validate a correct build state', () => {
    const state = {
      sessionId: 'abc-123',
      status: 'running',
      checkpoints: [],
    };
    const result = validateSchema(state, BUILD_STATE_SCHEMA);
    assert.equal(result.valid, true);
  });

  it('should fail on invalid status', () => {
    const result = validateSchema(
      { sessionId: 'x', status: 'invalid', checkpoints: [] },
      BUILD_STATE_SCHEMA
    );
    assert.equal(result.valid, false);
  });
});

describe('CONFIG_SCHEMA', () => {
  it('should validate a correct config', () => {
    const result = validateSchema({ version: '3.0.0' }, CONFIG_SCHEMA);
    assert.equal(result.valid, true);
  });

  it('should fail on missing version', () => {
    const result = validateSchema({}, CONFIG_SCHEMA);
    assert.equal(result.valid, false);
  });

  it('should reject invalid project_type', () => {
    const result = validateSchema(
      { version: '3.0.0', project_type: 'invalid' },
      CONFIG_SCHEMA
    );
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('project_type')));
  });

  it('should accept full config with all fields', () => {
    const fullConfig = {
      version: '3.0.0',
      installed_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      installer_version: '3.0.0',
      project_type: 'greenfield',
      language: 'en',
      ides: ['claude-code', 'vscode'],
      providers: { claude: { enabled: true } },
      agent_overrides: {},
    };
    const result = validateSchema(fullConfig, CONFIG_SCHEMA);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it('should validate round-trip from generateConfigYaml', async () => {
    const { generateConfigYaml } = await import('../../src/installer/templates.js');
    const yamlStr = generateConfigYaml({
      version: '3.0.0',
      projectType: 'greenfield',
      language: 'en',
      selectedIDEs: ['claude-code'],
      llmProvider: 'claude',
      allProviders: ['claude'],
    });
    const { default: yamlLib } = await import('js-yaml');
    const parsed = yamlLib.load(yamlStr);
    const result = validateSchema(parsed, CONFIG_SCHEMA);
    assert.equal(result.valid, true, `Errors: ${result.errors.join(', ')}`);
  });
});

describe('HANDOFF_SCHEMA', () => {
  it('should validate a correct handoff', () => {
    const handoff = {
      status: 'APPROVED',
      score: 95,
      summary: 'All checks passed',
      outputs: [],
      blockers: [],
    };
    const result = validateSchema(handoff, HANDOFF_SCHEMA);
    assert.equal(result.valid, true);
  });

  it('should fail on score out of range', () => {
    const result = validateSchema(
      { status: 'APPROVED', score: 150 },
      HANDOFF_SCHEMA
    );
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('above maximum')));
  });

  it('should fail on invalid status', () => {
    const result = validateSchema(
      { status: 'INVALID_STATUS' },
      HANDOFF_SCHEMA
    );
    assert.equal(result.valid, false);
  });
});
