/**
 * Tests for Windsurf IDE support (Item 24).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { IDE_CONFIGS, getIDEChoices } from '../../src/config/ide-configs.js';

// ---------------------------------------------------------------------------
// Windsurf config
// ---------------------------------------------------------------------------

describe('IDE_CONFIGS — Windsurf', () => {
  it('should include windsurf in IDE_CONFIGS', () => {
    assert.ok(IDE_CONFIGS['windsurf']);
  });

  it('should have correct name', () => {
    assert.equal(IDE_CONFIGS['windsurf'].name, 'Windsurf');
  });

  it('should have correct description', () => {
    assert.ok(IDE_CONFIGS['windsurf'].description.includes('Codeium'));
  });

  it('should not be recommended', () => {
    assert.equal(IDE_CONFIGS['windsurf'].recommended, false);
  });

  it('should use .windsurfrules as rulesFile', () => {
    assert.equal(IDE_CONFIGS['windsurf'].rulesFile, '.windsurfrules');
  });

  it('should have configPath set', () => {
    assert.equal(IDE_CONFIGS['windsurf'].configPath, '.windsurf/rules/');
  });

  it('should have no MCP config', () => {
    assert.equal(IDE_CONFIGS['windsurf'].mcpConfigFile, null);
  });
});

// ---------------------------------------------------------------------------
// IDE count
// ---------------------------------------------------------------------------

describe('IDE_CONFIGS — total count', () => {
  it('should have 7 IDEs configured', () => {
    assert.equal(Object.keys(IDE_CONFIGS).length, 7);
  });

  it('should include all expected IDEs', () => {
    const keys = Object.keys(IDE_CONFIGS);
    assert.ok(keys.includes('claude-code'));
    assert.ok(keys.includes('vscode'));
    assert.ok(keys.includes('antigravity'));
    assert.ok(keys.includes('cursor'));
    assert.ok(keys.includes('codex-cli'));
    assert.ok(keys.includes('gemini-cli'));
    assert.ok(keys.includes('windsurf'));
  });
});

// ---------------------------------------------------------------------------
// getIDEChoices
// ---------------------------------------------------------------------------

describe('getIDEChoices — with Windsurf', () => {
  it('should include windsurf in choices', () => {
    const choices = getIDEChoices();
    const windsurf = choices.find(c => c.value === 'windsurf');
    assert.ok(windsurf);
    assert.equal(windsurf.label, 'Windsurf');
    assert.ok(windsurf.hint.includes('Codeium'));
  });

  it('should return 7 choices total', () => {
    const choices = getIDEChoices();
    assert.equal(choices.length, 7);
  });
});
