/**
 * Tests for user-aware file locking (Item 25 — acquireUserLock).
 */

import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import { acquireUserLock, releaseLock } from '../../src/utils/file-lock.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let tmpDir;
let testFile;

before(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'user-lock-test-'));
  testFile = join(tmpDir, 'state.json');
  writeFileSync(testFile, '{}', 'utf-8');
});

after(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

afterEach(() => {
  // Clean up lock files
  const lockPath = `${testFile}.lock`;
  if (existsSync(lockPath)) {
    try { rmSync(lockPath); } catch { /* ignore */ }
  }
});

// ---------------------------------------------------------------------------
// acquireUserLock
// ---------------------------------------------------------------------------

describe('acquireUserLock', () => {
  it('should acquire lock for a user', () => {
    const result = acquireUserLock(testFile, 'alice');
    assert.equal(result.acquired, true);
    assert.equal(result.owner, 'alice');
    assert.ok(result.lockPath.endsWith('.lock'));
    result.release();
  });

  it('should reject null userId', () => {
    const result = acquireUserLock(testFile, null);
    assert.equal(result.acquired, false);
    assert.equal(result.owner, null);
  });

  it('should allow same user to re-acquire', () => {
    const lock1 = acquireUserLock(testFile, 'alice');
    assert.equal(lock1.acquired, true);

    // Release and re-acquire
    lock1.release();
    const lock2 = acquireUserLock(testFile, 'alice');
    assert.equal(lock2.acquired, true);
    lock2.release();
  });

  it('should block different user from acquiring', () => {
    const lock1 = acquireUserLock(testFile, 'alice');
    assert.equal(lock1.acquired, true);

    const lock2 = acquireUserLock(testFile, 'bob', { timeout: 200 });
    assert.equal(lock2.acquired, false);
    assert.equal(lock2.owner, 'alice');

    lock1.release();
  });

  it('should allow different user after release', () => {
    const lock1 = acquireUserLock(testFile, 'alice');
    assert.equal(lock1.acquired, true);
    lock1.release();

    const lock2 = acquireUserLock(testFile, 'bob');
    assert.equal(lock2.acquired, true);
    assert.equal(lock2.owner, 'bob');
    lock2.release();
  });

  it('should provide release function', () => {
    const lock = acquireUserLock(testFile, 'alice');
    assert.equal(typeof lock.release, 'function');
    lock.release();
    assert.ok(!existsSync(lock.lockPath));
  });
});
