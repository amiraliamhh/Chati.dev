/**
 * @fileoverview Advisory file locking using .lock files + PID.
 *
 * Prevents concurrent writes to shared state files (session.yaml,
 * build-state.json) during multi-terminal execution.
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { dirname } from 'path';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default lock acquisition timeout in ms */
export const DEFAULT_TIMEOUT = 5000;

/** Default retry interval in ms */
export const DEFAULT_RETRY_INTERVAL = 100;

/** Default stale threshold in ms (30 seconds) */
export const STALE_THRESHOLD_MS = 30_000;

// ---------------------------------------------------------------------------
// Lock Management
// ---------------------------------------------------------------------------

/**
 * Build the lock file path for a given file.
 *
 * @param {string} filePath
 * @returns {string}
 */
function getLockPath(filePath) {
  return `${filePath}.lock`;
}

/**
 * Check if a process is still running.
 *
 * @param {number} pid
 * @returns {boolean}
 */
function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read lock file contents.
 *
 * @param {string} lockPath
 * @returns {{ pid: number, timestamp: number, hostname: string }|null}
 */
function readLockFile(lockPath) {
  try {
    const content = readFileSync(lockPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Write lock file with current process info.
 *
 * @param {string} lockPath
 */
function writeLockFile(lockPath) {
  const dir = dirname(lockPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const lockData = {
    pid: process.pid,
    timestamp: Date.now(),
    hostname: typeof globalThis !== 'undefined' ? (globalThis.process?.env?.HOSTNAME || 'localhost') : 'localhost',
  };
  writeFileSync(lockPath, JSON.stringify(lockData), 'utf-8');
}

/**
 * Check if a lock is stale (owner process dead or lock too old).
 *
 * @param {string} lockPath
 * @param {object} [options]
 * @param {boolean} [options.stalePidCheck=true]
 * @returns {boolean}
 */
function isLockStale(lockPath, options = {}) {
  const { stalePidCheck = true } = options;
  const lockData = readLockFile(lockPath);

  if (!lockData) return true;

  // Check if lock is too old
  if (Date.now() - lockData.timestamp > STALE_THRESHOLD_MS) {
    return true;
  }

  // Check if owner process is still alive
  if (stalePidCheck && lockData.pid && !isProcessAlive(lockData.pid)) {
    return true;
  }

  return false;
}

/**
 * Acquire an advisory lock on a file.
 *
 * @param {string} filePath - Path to the file to lock
 * @param {object} [options]
 * @param {number} [options.timeout=5000] - Max time to wait for lock
 * @param {number} [options.retryInterval=100] - Time between retries
 * @param {boolean} [options.stalePidCheck=true] - Check if lock owner PID is alive
 * @returns {{ acquired: boolean, lockPath: string, release: () => void }}
 */
export function acquireLock(filePath, options = {}) {
  const {
    timeout = DEFAULT_TIMEOUT,
    retryInterval = DEFAULT_RETRY_INTERVAL,
    stalePidCheck = true,
  } = options;

  const lockPath = getLockPath(filePath);
  const startTime = Date.now();

  while (true) {
    // If lock file doesn't exist, acquire it
    if (!existsSync(lockPath)) {
      writeLockFile(lockPath);
      return {
        acquired: true,
        lockPath,
        release: () => releaseLock(lockPath),
      };
    }

    // If lock is stale, remove and acquire
    if (isLockStale(lockPath, { stalePidCheck })) {
      try { unlinkSync(lockPath); } catch { /* ignore */ }
      writeLockFile(lockPath);
      return {
        acquired: true,
        lockPath,
        release: () => releaseLock(lockPath),
      };
    }

    // Check timeout
    if (Date.now() - startTime >= timeout) {
      return {
        acquired: false,
        lockPath,
        release: () => {},
      };
    }

    // Busy wait (synchronous - acceptable for short lock durations)
    const waitUntil = Date.now() + retryInterval;
    while (Date.now() < waitUntil) { /* spin */ }
  }
}

/**
 * Release an advisory lock.
 *
 * @param {string} lockPath - Path to the lock file
 */
export function releaseLock(lockPath) {
  try {
    if (existsSync(lockPath)) {
      const lockData = readLockFile(lockPath);
      // Only release if we own it
      if (!lockData || lockData.pid === process.pid) {
        unlinkSync(lockPath);
      }
    }
  } catch {
    // Lock may already be released — ignore
  }
}

/**
 * Check if a file is currently locked.
 *
 * @param {string} filePath
 * @returns {boolean}
 */
export function isLocked(filePath) {
  const lockPath = getLockPath(filePath);
  if (!existsSync(lockPath)) return false;
  return !isLockStale(lockPath);
}

/**
 * Execute a function while holding a lock on a file.
 *
 * @param {string} filePath - File to lock
 * @param {function(): T|Promise<T>} fn - Function to execute while holding lock
 * @param {object} [options] - Lock options
 * @returns {Promise<T>}
 * @template T
 */
export async function withLock(filePath, fn, options = {}) {
  const lock = acquireLock(filePath, options);

  if (!lock.acquired) {
    throw new Error(`Failed to acquire lock on ${filePath}`);
  }

  try {
    return await fn();
  } finally {
    lock.release();
  }
}

/**
 * Acquire a user-aware lock on a file.
 * Only the same userId can re-acquire an existing lock.
 *
 * @param {string} filePath - File to lock
 * @param {string} userId - User identifier
 * @param {object} [options] - Lock options
 * @param {number} [options.timeout=5000] - Max time to wait
 * @param {number} [options.retryInterval=100] - Time between retries
 * @returns {{ acquired: boolean, lockPath: string, owner: string|null, release: () => void }}
 */
export function acquireUserLock(filePath, userId, options = {}) {
  if (!userId) {
    return {
      acquired: false,
      lockPath: `${filePath}.lock`,
      owner: null,
      release: () => {},
    };
  }

  const lockPath = `${filePath}.lock`;

  // Check if another user holds the lock
  if (existsSync(lockPath)) {
    const lockData = readLockFile(lockPath);

    if (lockData && lockData.userId && lockData.userId !== userId) {
      // Check if the lock is stale
      if (!isLockStale(lockPath, options)) {
        return {
          acquired: false,
          lockPath,
          owner: lockData.userId,
          release: () => {},
        };
      }
      // Stale lock — remove and continue
      try { unlinkSync(lockPath); } catch { /* ignore */ }
    }
  }

  // Use standard lock acquisition
  const lock = acquireLock(filePath, options);

  if (lock.acquired) {
    // Overwrite lock file with user info
    const dir = dirname(lockPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const lockData = {
      pid: process.pid,
      timestamp: Date.now(),
      userId,
      hostname: typeof globalThis !== 'undefined' ? (globalThis.process?.env?.HOSTNAME || 'localhost') : 'localhost',
    };
    writeFileSync(lockPath, JSON.stringify(lockData), 'utf-8');
  }

  return {
    acquired: lock.acquired,
    lockPath: lock.lockPath,
    owner: userId,
    release: lock.release,
  };
}
