/**
 * @fileoverview Tests for file-lock module
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  acquireLock,
  releaseLock,
  isLocked,
  withLock,
  DEFAULT_TIMEOUT,
  DEFAULT_RETRY_INTERVAL,
  STALE_THRESHOLD_MS,
} from '../../src/utils/file-lock.js';

describe('file-lock', () => {
  const tmpDir = join(tmpdir(), `chati-test-lock-${Date.now()}`);
  const testFile = join(tmpDir, 'test-file.json');

  afterEach(() => {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  describe('constants', () => {
    it('should export DEFAULT_TIMEOUT as 5000', () => {
      assert.equal(DEFAULT_TIMEOUT, 5000);
    });

    it('should export DEFAULT_RETRY_INTERVAL as 100', () => {
      assert.equal(DEFAULT_RETRY_INTERVAL, 100);
    });

    it('should export STALE_THRESHOLD_MS as 30 seconds', () => {
      assert.equal(STALE_THRESHOLD_MS, 30_000);
    });
  });

  describe('acquireLock', () => {
    it('should acquire lock when no lock exists', () => {
      mkdirSync(tmpDir, { recursive: true });
      writeFileSync(testFile, '{}');
      const lock = acquireLock(testFile);
      assert.equal(lock.acquired, true);
      assert.ok(lock.lockPath.endsWith('.lock'));
      assert.ok(existsSync(lock.lockPath));
      lock.release();
    });

    it('should release lock via release function', () => {
      mkdirSync(tmpDir, { recursive: true });
      writeFileSync(testFile, '{}');
      const lock = acquireLock(testFile);
      assert.equal(lock.acquired, true);
      lock.release();
      assert.equal(existsSync(lock.lockPath), false);
    });

    it('should fail to acquire when locked by current process', () => {
      mkdirSync(tmpDir, { recursive: true });
      writeFileSync(testFile, '{}');
      const lock1 = acquireLock(testFile);
      assert.equal(lock1.acquired, true);

      // Try to acquire again with very short timeout
      const lock2 = acquireLock(testFile, { timeout: 200, retryInterval: 50 });
      assert.equal(lock2.acquired, false);

      lock1.release();
    });

    it('should acquire stale lock (dead PID)', () => {
      mkdirSync(tmpDir, { recursive: true });
      writeFileSync(testFile, '{}');
      const lockPath = `${testFile}.lock`;
      // Write a fake lock with a PID that does not exist
      writeFileSync(lockPath, JSON.stringify({ pid: 999999999, timestamp: Date.now(), hostname: 'test' }));

      const lock = acquireLock(testFile);
      assert.equal(lock.acquired, true);
      lock.release();
    });

    it('should acquire stale lock (old timestamp)', () => {
      mkdirSync(tmpDir, { recursive: true });
      writeFileSync(testFile, '{}');
      const lockPath = `${testFile}.lock`;
      // Write a lock with old timestamp (well past STALE_THRESHOLD_MS)
      writeFileSync(lockPath, JSON.stringify({ pid: process.pid, timestamp: Date.now() - STALE_THRESHOLD_MS - 10000, hostname: 'test' }));

      const lock = acquireLock(testFile, { stalePidCheck: false });
      assert.equal(lock.acquired, true);
      lock.release();
    });

    it('should create parent directory if needed', () => {
      const nestedFile = join(tmpDir, 'deep', 'nested', 'file.json');
      const lock = acquireLock(nestedFile);
      assert.equal(lock.acquired, true);
      lock.release();
    });
  });

  describe('releaseLock', () => {
    it('should remove lock file', () => {
      mkdirSync(tmpDir, { recursive: true });
      writeFileSync(testFile, '{}');
      const lock = acquireLock(testFile);
      assert.ok(existsSync(lock.lockPath));
      releaseLock(lock.lockPath);
      assert.equal(existsSync(lock.lockPath), false);
    });

    it('should not throw when lock does not exist', () => {
      assert.doesNotThrow(() => releaseLock('/nonexistent/path.lock'));
    });
  });

  describe('isLocked', () => {
    it('should return false when no lock', () => {
      mkdirSync(tmpDir, { recursive: true });
      writeFileSync(testFile, '{}');
      assert.equal(isLocked(testFile), false);
    });

    it('should return true when locked', () => {
      mkdirSync(tmpDir, { recursive: true });
      writeFileSync(testFile, '{}');
      const lock = acquireLock(testFile);
      assert.equal(isLocked(testFile), true);
      lock.release();
    });

    it('should return false for stale lock', () => {
      mkdirSync(tmpDir, { recursive: true });
      writeFileSync(testFile, '{}');
      const lockPath = `${testFile}.lock`;
      writeFileSync(lockPath, JSON.stringify({ pid: 999999999, timestamp: Date.now() - STALE_THRESHOLD_MS - 10000, hostname: 'test' }));
      assert.equal(isLocked(testFile), false);
    });
  });

  describe('withLock', () => {
    it('should execute function while holding lock', async () => {
      mkdirSync(tmpDir, { recursive: true });
      writeFileSync(testFile, '{}');
      let executed = false;
      await withLock(testFile, () => {
        executed = true;
        assert.equal(isLocked(testFile), true);
      });
      assert.equal(executed, true);
      assert.equal(isLocked(testFile), false);
    });

    it('should release lock even if function throws', async () => {
      mkdirSync(tmpDir, { recursive: true });
      writeFileSync(testFile, '{}');
      await assert.rejects(
        () => withLock(testFile, () => { throw new Error('test error'); }),
        /test error/
      );
      assert.equal(isLocked(testFile), false);
    });

    it('should return function result', async () => {
      mkdirSync(tmpDir, { recursive: true });
      writeFileSync(testFile, '{}');
      const result = await withLock(testFile, () => 42);
      assert.equal(result, 42);
    });

    it('should work with async functions', async () => {
      mkdirSync(tmpDir, { recursive: true });
      writeFileSync(testFile, '{}');
      const result = await withLock(testFile, async () => {
        return new Promise((resolve) => setTimeout(() => resolve('async-result'), 10));
      });
      assert.equal(result, 'async-result');
    });

    it('should throw when lock cannot be acquired', async () => {
      mkdirSync(tmpDir, { recursive: true });
      writeFileSync(testFile, '{}');
      const lock = acquireLock(testFile);
      await assert.rejects(
        () => withLock(testFile, () => {}, { timeout: 200, retryInterval: 50 }),
        /Failed to acquire lock/
      );
      lock.release();
    });
  });
});
