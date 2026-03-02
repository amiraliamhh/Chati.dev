import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync, existsSync, utimesSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import {
  autoFix,
  MAX_ERROR_LOG_SIZE,
  STALE_LOCK_AGE_MS,
} from '../../src/health/auto-fix.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('auto-fix constants', () => {
  it('should have a max error log size', () => {
    assert.equal(MAX_ERROR_LOG_SIZE, 1_024 * 1_024);
  });

  it('should have a stale lock age threshold', () => {
    assert.equal(STALE_LOCK_AGE_MS, 30_000);
  });
});

// ---------------------------------------------------------------------------
// autoFix
// ---------------------------------------------------------------------------

describe('autoFix', () => {
  let tempDir;

  before(() => {
    tempDir = join(__dirname, 'tmp-autofix');
    mkdirSync(tempDir, { recursive: true });
  });

  after(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should create missing .chati directories', () => {
    const result = autoFix(tempDir);

    assert.ok(result.fixed >= 0);
    assert.ok(existsSync(join(tempDir, '.chati')));
    assert.ok(existsSync(join(tempDir, '.chati', 'memory')));
    assert.ok(existsSync(join(tempDir, '.chati', 'metrics')));
  });

  it('should not recreate existing directories', () => {
    // Run twice — second run should not create again
    autoFix(tempDir);
    const result = autoFix(tempDir);

    // No new directories created
    const dirActions = result.actions.filter(a => a.action.includes('Created'));
    assert.equal(dirActions.length, 0);
  });

  it('should return proper result structure', () => {
    const result = autoFix(tempDir);

    assert.equal(typeof result.fixed, 'number');
    assert.equal(typeof result.failed, 'number');
    assert.ok(Array.isArray(result.actions));
  });

  it('should remove stale lock files', () => {
    // Create a lock file with old modification time
    const lockPath = join(tempDir, '.chati', 'session.yaml.lock');
    writeFileSync(lockPath, JSON.stringify({ pid: 99999, timestamp: Date.now() - 60_000 }));

    // Manually set mtime to be old
    const oldTime = new Date(Date.now() - STALE_LOCK_AGE_MS - 5000);
    utimesSync(lockPath, oldTime, oldTime);

    const result = autoFix(tempDir);
    const lockAction = result.actions.find(a => a.action.includes('stale lock'));
    assert.ok(lockAction);
    assert.equal(lockAction.success, true);
  });

  it('should remove empty worktree directories', () => {
    const worktreeDir = join(tempDir, '.chati', 'worktrees');
    const emptyWorktree = join(worktreeDir, 'orphaned-task');
    mkdirSync(emptyWorktree, { recursive: true });

    const result = autoFix(tempDir);
    const wtAction = result.actions.find(a => a.action.includes('worktree'));
    assert.ok(wtAction);
    assert.equal(wtAction.success, true);
    assert.equal(existsSync(emptyWorktree), false);
  });

  it('should handle non-existent project directory gracefully', () => {
    const result = autoFix('/tmp/does-not-exist-autofix-xyz');
    // Should not throw, just return results
    assert.ok(typeof result.fixed === 'number');
  });
});
