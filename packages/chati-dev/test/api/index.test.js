/**
 * Tests for the public API surface (Item 26).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Import verification — ensure all exports resolve
// ---------------------------------------------------------------------------

describe('API — exports', () => {
  it('should export health functions', async () => {
    const api = await import('../../src/api/index.js');
    assert.equal(typeof api.runHealthChecks, 'function');
  });

  it('should export PRISM context engine', async () => {
    const api = await import('../../src/api/index.js');
    assert.equal(typeof api.runPrism, 'function');
  });

  it('should export orchestrator functions', async () => {
    const api = await import('../../src/api/index.js');
    assert.equal(typeof api.classifyIntent, 'function');
    assert.ok(api.INTENT_TYPES);
    assert.equal(typeof api.initPipeline, 'function');
    assert.equal(typeof api.advancePipeline, 'function');
    assert.equal(typeof api.initQuickFlowPipeline, 'function');
    assert.equal(typeof api.initStandardFlowPipeline, 'function');
    assert.equal(typeof api.selectAgent, 'function');
  });

  it('should export session management functions', async () => {
    const api = await import('../../src/api/index.js');
    assert.equal(typeof api.initSession, 'function');
    assert.equal(typeof api.loadSession, 'function');
    assert.equal(typeof api.updateSession, 'function');
    assert.equal(typeof api.validateSession, 'function');
    assert.equal(typeof api.getSessionSummary, 'function');
    assert.equal(typeof api.claimSession, 'function');
    assert.equal(typeof api.releaseSession, 'function');
    assert.equal(typeof api.getSessionOwner, 'function');
  });

  it('should export autonomy functions', async () => {
    const api = await import('../../src/api/index.js');
    assert.equal(typeof api.runBuildLoop, 'function');
    assert.equal(typeof api.checkSafety, 'function');
    assert.ok(api.SAFETY_TRIGGERS);
  });

  it('should export memory functions', async () => {
    const api = await import('../../src/api/index.js');
    assert.equal(typeof api.recordError, 'function');
    assert.equal(typeof api.getGotchas, 'function');
  });

  it('should export quality functions', async () => {
    const api = await import('../../src/api/index.js');
    assert.equal(typeof api.getMetricsHistory, 'function');
    assert.equal(typeof api.getQualityDashboard, 'function');
    assert.equal(typeof api.recordMetric, 'function');
  });

  it('should export extension functions', async () => {
    const api = await import('../../src/api/index.js');
    assert.equal(typeof api.registerExtension, 'function');
    assert.equal(typeof api.getExtensions, 'function');
    assert.equal(typeof api.executeExtensions, 'function');
    assert.equal(typeof api.clearExtensions, 'function');
    assert.ok(api.EXTENSION_POINTS);
    assert.equal(typeof api.loadProjectExtensions, 'function');
    assert.equal(typeof api.validateExtension, 'function');
  });

  it('should export configuration functions', async () => {
    const api = await import('../../src/api/index.js');
    assert.equal(typeof api.loadCustomization, 'function');
    assert.equal(typeof api.applyCustomization, 'function');
    assert.equal(typeof api.validateCustomization, 'function');
    assert.ok(api.IDE_CONFIGS);
    assert.equal(typeof api.getIDEChoices, 'function');
  });

  it('should export createSession convenience wrapper', async () => {
    const api = await import('../../src/api/index.js');
    assert.equal(typeof api.createSession, 'function');
  });
});

// ---------------------------------------------------------------------------
// createSession wrapper
// ---------------------------------------------------------------------------

describe('API — createSession', () => {
  it('should create a session with defaults', async () => {
    const { mkdtempSync, rmSync } = await import('fs');
    const { join } = await import('path');
    const { tmpdir } = await import('os');
    const api = await import('../../src/api/index.js');

    const tmpDir = mkdtempSync(join(tmpdir(), 'api-test-'));
    try {
      const result = api.createSession(tmpDir);
      assert.equal(result.created, true);
      assert.ok(result.session);
      assert.equal(result.session.mode, 'discover');
      assert.equal(result.session.language, 'en');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should create a session with custom options', async () => {
    const { mkdtempSync, rmSync } = await import('fs');
    const { join } = await import('path');
    const { tmpdir } = await import('os');
    const api = await import('../../src/api/index.js');

    const tmpDir = mkdtempSync(join(tmpdir(), 'api-test-'));
    try {
      const result = api.createSession(tmpDir, {
        mode: 'plan',
        language: 'pt',
        isGreenfield: false,
        projectName: 'test-project',
      });
      assert.equal(result.created, true);
      assert.equal(result.session.mode, 'plan');
      assert.equal(result.session.language, 'pt');
      assert.equal(result.session.project_type, 'brownfield');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
