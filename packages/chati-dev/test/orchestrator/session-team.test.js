/**
 * Tests for team/concurrent session support (Item 25).
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import {
  initSession,
  claimSession,
  releaseSession,
  getSessionOwner,
} from '../../src/orchestrator/session-manager.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let tmpDir;

before(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'session-team-test-'));
  initSession(tmpDir);
});

after(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// claimSession
// ---------------------------------------------------------------------------

describe('claimSession', () => {
  it('should claim an unowned session', () => {
    const result = claimSession(tmpDir, 'user-alice');
    assert.equal(result.claimed, true);
    assert.equal(result.owner, 'user-alice');
    assert.ok(result.since);
  });

  it('should allow same user to re-claim', () => {
    const result = claimSession(tmpDir, 'user-alice');
    assert.equal(result.claimed, true);
    assert.equal(result.owner, 'user-alice');
  });

  it('should reject claim from different user', () => {
    const result = claimSession(tmpDir, 'user-bob');
    assert.equal(result.claimed, false);
    assert.equal(result.owner, 'user-alice');
    assert.ok(result.error.includes('already claimed'));
  });

  it('should reject null projectDir', () => {
    const result = claimSession(null, 'user-alice');
    assert.equal(result.claimed, false);
    assert.ok(result.error.includes('required'));
  });

  it('should reject null userId', () => {
    const result = claimSession(tmpDir, null);
    assert.equal(result.claimed, false);
    assert.ok(result.error.includes('required'));
  });
});

// ---------------------------------------------------------------------------
// getSessionOwner
// ---------------------------------------------------------------------------

describe('getSessionOwner', () => {
  it('should return current owner', () => {
    const result = getSessionOwner(tmpDir);
    assert.equal(result.owner, 'user-alice');
    assert.ok(result.since);
    assert.ok(result.hostname);
  });

  it('should return null for null projectDir', () => {
    const result = getSessionOwner(null);
    assert.equal(result.owner, null);
    assert.equal(result.since, null);
  });
});

// ---------------------------------------------------------------------------
// releaseSession
// ---------------------------------------------------------------------------

describe('releaseSession', () => {
  it('should reject release from non-owner', () => {
    const result = releaseSession(tmpDir, 'user-bob');
    assert.equal(result.released, false);
    assert.ok(result.error.includes('Cannot release'));
  });

  it('should allow owner to release', () => {
    const result = releaseSession(tmpDir, 'user-alice');
    assert.equal(result.released, true);
  });

  it('should show no owner after release', () => {
    const result = getSessionOwner(tmpDir);
    assert.equal(result.owner, null);
  });

  it('should allow new user to claim after release', () => {
    const result = claimSession(tmpDir, 'user-bob');
    assert.equal(result.claimed, true);
    assert.equal(result.owner, 'user-bob');
  });

  it('should reject null parameters', () => {
    const result = releaseSession(null, 'user');
    assert.equal(result.released, false);
  });

  // Cleanup — release bob so other tests are clean
  it('should release bob for cleanup', () => {
    const result = releaseSession(tmpDir, 'user-bob');
    assert.equal(result.released, true);
  });
});
