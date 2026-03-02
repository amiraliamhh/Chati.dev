import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { writeFileSync } from 'fs';
import yaml from 'js-yaml';
import {
  initSession,
  loadSession,
  updateSession,
  recordModeTransition,
  recordAgentCompletion,
  getSessionSummary,
  validateSession,
  migrateSession,
} from '../../src/orchestrator/session-manager.js';

describe('session-manager', () => {
  let tempDir;

  before(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'session-test-'));
  });

  after(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('initSession', () => {
    it('should create a new session with default values', () => {
      const testDir = mkdtempSync(join(tmpdir(), 'init-default-'));

      const result = initSession(testDir);

      assert.equal(result.created, true);
      assert.ok(result.session);
      assert.equal(result.session.mode, 'discover');
      assert.equal(result.session.language, 'en');
      assert.equal(result.session.project_type, 'greenfield');
      assert.ok(result.session.started_at);

      rmSync(testDir, { recursive: true, force: true });
    });

    it('should create a session with custom options', () => {
      const testDir = mkdtempSync(join(tmpdir(), 'init-custom-'));

      const result = initSession(testDir, {
        mode: 'build',
        language: 'pt',
        isGreenfield: false,
        ides: ['claude-code', 'cursor'],
        mcps: ['gdrive'],
      });

      assert.equal(result.created, true);
      assert.equal(result.session.mode, 'build');
      assert.equal(result.session.language, 'pt');
      assert.equal(result.session.project_type, 'brownfield');
      assert.ok(result.session.ides.includes('claude-code'));
      assert.ok(result.session.mcps.includes('gdrive'));

      rmSync(testDir, { recursive: true, force: true });
    });

    it('should create session file in .chati directory', () => {
      const testDir = mkdtempSync(join(tmpdir(), 'init-file-'));

      const result = initSession(testDir);

      assert.equal(result.created, true);
      assert.ok(result.path.includes('.chati'));
      assert.ok(result.path.endsWith('session.yaml'));

      rmSync(testDir, { recursive: true, force: true });
    });
  });

  describe('loadSession', () => {
    it('should load existing session', () => {
      const testDir = mkdtempSync(join(tmpdir(), 'load-test-'));

      initSession(testDir, { mode: 'discover', language: 'en' });

      const result = loadSession(testDir);

      assert.equal(result.loaded, true);
      assert.ok(result.session);
      assert.equal(result.session.mode, 'discover');
      assert.equal(result.error, null);

      rmSync(testDir, { recursive: true, force: true });
    });

    it('should fail when session does not exist', () => {
      const testDir = mkdtempSync(join(tmpdir(), 'no-session-'));

      const result = loadSession(testDir);

      assert.equal(result.loaded, false);
      assert.equal(result.session, null);
      assert.ok(result.error);

      rmSync(testDir, { recursive: true, force: true });
    });
  });

  describe('updateSession', () => {
    it('should update session fields', () => {
      const testDir = mkdtempSync(join(tmpdir(), 'update-test-'));

      initSession(testDir, { mode: 'discover' });

      const result = updateSession(testDir, {
        current_agent: 'brief',
        pipeline_position: 2,
      });

      assert.equal(result.saved, true);
      assert.equal(result.session.current_agent, 'brief');
      assert.equal(result.session.pipeline_position, 2);

      rmSync(testDir, { recursive: true, force: true });
    });

    it('should deep merge agent data', () => {
      const testDir = mkdtempSync(join(tmpdir(), 'merge-test-'));

      initSession(testDir);

      const result = updateSession(testDir, {
        agents: {
          'brief': { status: 'in_progress', score: 50 },
        },
      });

      assert.equal(result.saved, true);
      assert.equal(result.session.agents.brief.status, 'in_progress');
      assert.equal(result.session.agents.brief.score, 50);
      assert.ok(result.session.agents.detail); // Other agents still exist

      rmSync(testDir, { recursive: true, force: true });
    });
  });

  describe('recordModeTransition', () => {
    it('should record mode transition in history', () => {
      const testDir = mkdtempSync(join(tmpdir(), 'transition-test-'));

      initSession(testDir, { mode: 'discover' });

      const result = recordModeTransition(testDir, {
        from: 'discover',
        to: 'build',
        trigger: 'qa-planning-score',
        reason: 'QA-Planning score >= 95%',
      });

      assert.equal(result.saved, true);

      const session = loadSession(testDir);
      assert.equal(session.session.mode, 'build');
      assert.ok(session.session.mode_transitions.length > 0);
      assert.equal(session.session.mode_transitions[0].from, 'discover');
      assert.equal(session.session.mode_transitions[0].to, 'build');

      rmSync(testDir, { recursive: true, force: true });
    });
  });

  describe('recordAgentCompletion', () => {
    it('should record agent completion', () => {
      const testDir = mkdtempSync(join(tmpdir(), 'completion-test-'));

      initSession(testDir);

      const result = recordAgentCompletion(testDir, {
        agent: 'brief',
        status: 'completed',
        score: 95,
        outputs: ['brief.md'],
      });

      assert.equal(result.saved, true);

      const session = loadSession(testDir);
      assert.equal(session.session.agents.brief.status, 'completed');
      assert.equal(session.session.agents.brief.score, 95);
      assert.ok(session.session.completed_agents.includes('brief'));
      assert.equal(session.session.last_handoff, 'brief');

      rmSync(testDir, { recursive: true, force: true });
    });

    it('should store detailed results', () => {
      const testDir = mkdtempSync(join(tmpdir(), 'results-test-'));

      initSession(testDir);

      recordAgentCompletion(testDir, {
        agent: 'detail',
        status: 'completed',
        score: 92,
        outputs: ['detail.md', 'schema.sql'],
      });

      const session = loadSession(testDir);
      assert.ok(session.session.agent_results.detail);
      assert.equal(session.session.agent_results.detail.score, 92);
      assert.ok(session.session.agent_results.detail.outputs.includes('schema.sql'));

      rmSync(testDir, { recursive: true, force: true });
    });
  });

  describe('getSessionSummary', () => {
    it('should calculate progress correctly', () => {
      const testDir = mkdtempSync(join(tmpdir(), 'summary-test-'));

      initSession(testDir);

      // Complete 3 agents
      recordAgentCompletion(testDir, { agent: 'greenfield-wu', status: 'completed', score: 95 });
      recordAgentCompletion(testDir, { agent: 'brief', status: 'completed', score: 90 });
      recordAgentCompletion(testDir, { agent: 'detail', status: 'completed', score: 92 });

      const summary = getSessionSummary(testDir);

      assert.equal(summary.progress.completed, 3);
      assert.ok(summary.progress.percent > 0);
      assert.equal(summary.completed_agents.length, 3);

      rmSync(testDir, { recursive: true, force: true });
    });

    it('should include session metadata', () => {
      const testDir = mkdtempSync(join(tmpdir(), 'metadata-test-'));

      initSession(testDir, { mode: 'discover', language: 'pt' });

      const summary = getSessionSummary(testDir);

      assert.equal(summary.mode, 'discover');
      assert.equal(summary.language, 'pt');
      assert.equal(summary.project_type, 'greenfield');
      assert.ok(summary.duration);
      assert.ok(summary.started_at);

      rmSync(testDir, { recursive: true, force: true });
    });
  });

  describe('validateSession', () => {
    it('should validate a valid session', () => {
      const testDir = mkdtempSync(join(tmpdir(), 'valid-test-'));

      initSession(testDir);

      const result = validateSession(testDir);

      assert.equal(result.exists, true);
      assert.equal(result.valid, true);
      assert.ok(result.reason.includes('valid'));

      rmSync(testDir, { recursive: true, force: true });
    });

    it('should fail when session does not exist', () => {
      const testDir = mkdtempSync(join(tmpdir(), 'no-exist-test-'));

      const result = validateSession(testDir);

      assert.equal(result.exists, false);
      assert.equal(result.valid, false);

      rmSync(testDir, { recursive: true, force: true });
    });

    it('should validate required fields', () => {
      const testDir = mkdtempSync(join(tmpdir(), 'fields-test-'));

      initSession(testDir);

      // Manually corrupt the session
      updateSession(testDir, { version: null });

      const result = validateSession(testDir);

      assert.equal(result.valid, false);
      assert.ok(result.reason.includes('version'));

      rmSync(testDir, { recursive: true, force: true });
    });

    it('should validate mode values', () => {
      const testDir = mkdtempSync(join(tmpdir(), 'mode-test-'));

      initSession(testDir);

      // Set invalid mode
      updateSession(testDir, { mode: 'invalid_mode' });

      const result = validateSession(testDir);

      assert.equal(result.valid, false);
      assert.ok(result.reason.includes('Invalid mode'));

      rmSync(testDir, { recursive: true, force: true });
    });
  });

  describe('migrateSession', () => {
    it('should migrate legacy session (no schema_version) to 1.0', () => {
      const result = migrateSession({ version: '1.0', mode: 'discover', language: 'en' });
      assert.equal(result.migrated, true);
      assert.equal(result.fromVersion, null);
      assert.equal(result.toVersion, '1.0');
    });

    it('should NOT migrate session that already has schema_version 1.0', () => {
      const result = migrateSession({ schema_version: '1.0', version: '1.0', mode: 'discover' });
      assert.equal(result.migrated, false);
      assert.equal(result.fromVersion, '1.0');
    });

    it('should ensure completed_agents and agent_results exist after migration', () => {
      const session = { version: '1.0', mode: 'build' };
      migrateSession(session);
      assert.ok(Array.isArray(session.completed_agents));
      assert.ok(typeof session.agent_results === 'object');
      assert.ok(Array.isArray(session.deviations));
      assert.ok(Array.isArray(session.mode_transitions));
    });

    it('should handle null input gracefully', () => {
      const result = migrateSession(null);
      assert.equal(result.migrated, false);
    });
  });

  describe('loadSession with migration', () => {
    it('should migrate legacy file on load', () => {
      const testDir = mkdtempSync(join(tmpdir(), 'migrate-load-'));
      mkdirSync(join(testDir, '.chati'), { recursive: true });

      // Write a legacy session without schema_version
      const legacy = { version: '1.0', mode: 'discover', language: 'en', project_type: 'greenfield', agents: {} };
      writeFileSync(join(testDir, '.chati', 'session.yaml'), yaml.dump(legacy), 'utf-8');

      const result = loadSession(testDir);
      assert.equal(result.loaded, true);
      assert.equal(result.migrated, true);
      assert.equal(result.session.schema_version, '1.0');

      rmSync(testDir, { recursive: true, force: true });
    });

    it('should NOT re-migrate current version file', () => {
      const testDir = mkdtempSync(join(tmpdir(), 'migrate-no-'));
      initSession(testDir);

      const result = loadSession(testDir);
      assert.equal(result.loaded, true);
      assert.equal(result.migrated, false);
      assert.equal(result.session.schema_version, '1.0');

      rmSync(testDir, { recursive: true, force: true });
    });
  });

  describe('initSession with schema_version', () => {
    it('should create session with schema_version field', () => {
      const testDir = mkdtempSync(join(tmpdir(), 'init-schema-'));
      const result = initSession(testDir);
      assert.equal(result.session.schema_version, '1.0');
      rmSync(testDir, { recursive: true, force: true });
    });
  });
});
