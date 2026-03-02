/**
 * @fileoverview Auto-fix for common health check issues.
 *
 * Automatically repairs stale locks, oversized error logs,
 * missing directories, and other recoverable problems.
 *
 * Constitution Article XIV — Framework Registry Governance.
 */

import { existsSync, mkdirSync, rmSync, statSync, readdirSync, truncateSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum error log size before truncation (1 MB). */
const MAX_ERROR_LOG_SIZE = 1_024 * 1_024;

/** Stale lock file age threshold (30 seconds). */
const STALE_LOCK_AGE_MS = 30_000;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * @typedef {object} FixAction
 * @property {string} action - Description of what was fixed
 * @property {boolean} success - Whether the fix was applied
 * @property {string} [error] - Error message if fix failed
 */

/**
 * @typedef {object} AutoFixResult
 * @property {number} fixed - Number of issues fixed
 * @property {number} failed - Number of fixes that failed
 * @property {FixAction[]} actions - Detailed action log
 */

/**
 * Run auto-fix on a project directory.
 *
 * @param {string} projectDir
 * @param {object[]} [checkResults=[]] - Results from health checks (for targeted fixes)
 * @returns {AutoFixResult}
 */
export function autoFix(projectDir, checkResults = []) {
  const actions = [];

  // Fix 1: Ensure required directories exist
  actions.push(...fixMissingDirectories(projectDir));

  // Fix 2: Remove stale .lock files
  actions.push(...fixStaleLocks(projectDir));

  // Fix 3: Truncate oversized error logs
  actions.push(...fixOversizedLogs(projectDir));

  // Fix 4: Clean up orphaned worktrees directory entries
  actions.push(...fixOrphanedWorktrees(projectDir));

  const fixed = actions.filter(a => a.success).length;
  const failed = actions.filter(a => !a.success).length;

  return { fixed, failed, actions };
}

// ---------------------------------------------------------------------------
// Individual Fixers
// ---------------------------------------------------------------------------

/**
 * Ensure required .chati/ subdirectories exist.
 *
 * @param {string} projectDir
 * @returns {FixAction[]}
 */
function fixMissingDirectories(projectDir) {
  const actions = [];
  const requiredDirs = [
    '.chati',
    '.chati/memory',
    '.chati/metrics',
  ];

  for (const dir of requiredDirs) {
    const fullPath = join(projectDir, dir);
    if (!existsSync(fullPath)) {
      try {
        mkdirSync(fullPath, { recursive: true });
        actions.push({ action: `Created missing directory: ${dir}`, success: true });
      } catch (err) {
        actions.push({ action: `Failed to create ${dir}`, success: false, error: err.message });
      }
    }
  }

  return actions;
}

/**
 * Remove .lock files that are stale (old + no active PID).
 *
 * @param {string} projectDir
 * @returns {FixAction[]}
 */
function fixStaleLocks(projectDir) {
  const actions = [];
  const chatiDir = join(projectDir, '.chati');

  if (!existsSync(chatiDir)) return actions;

  try {
    const entries = readdirSync(chatiDir);
    const lockFiles = entries.filter(e => e.endsWith('.lock'));

    for (const lockFile of lockFiles) {
      const lockPath = join(chatiDir, lockFile);
      try {
        const stat = statSync(lockPath);
        const age = Date.now() - stat.mtimeMs;

        if (age > STALE_LOCK_AGE_MS) {
          rmSync(lockPath, { force: true });
          actions.push({ action: `Removed stale lock: ${lockFile}`, success: true });
        }
      } catch (err) {
        actions.push({ action: `Failed to check lock ${lockFile}`, success: false, error: err.message });
      }
    }
  } catch {
    // Directory read failed — skip
  }

  return actions;
}

/**
 * Truncate oversized error/gotcha logs.
 *
 * @param {string} projectDir
 * @returns {FixAction[]}
 */
function fixOversizedLogs(projectDir) {
  const actions = [];
  const logFiles = [
    join(projectDir, '.chati', 'memory', 'errors.json'),
    join(projectDir, '.chati', 'memory', 'gotchas.json'),
  ];

  for (const logPath of logFiles) {
    if (!existsSync(logPath)) continue;

    try {
      const stat = statSync(logPath);
      if (stat.size > MAX_ERROR_LOG_SIZE) {
        truncateSync(logPath, 0);
        actions.push({
          action: `Truncated oversized log: ${logPath.split('/').pop()} (${Math.round(stat.size / 1024)}KB)`,
          success: true,
        });
      }
    } catch (err) {
      actions.push({
        action: `Failed to truncate ${logPath.split('/').pop()}`,
        success: false,
        error: err.message,
      });
    }
  }

  return actions;
}

/**
 * Clean up orphaned worktree directory entries (empty dirs).
 *
 * @param {string} projectDir
 * @returns {FixAction[]}
 */
function fixOrphanedWorktrees(projectDir) {
  const actions = [];
  const worktreeDir = join(projectDir, '.chati', 'worktrees');

  if (!existsSync(worktreeDir)) return actions;

  try {
    const entries = readdirSync(worktreeDir);

    for (const entry of entries) {
      const entryPath = join(worktreeDir, entry);
      try {
        const stat = statSync(entryPath);
        if (stat.isDirectory()) {
          const contents = readdirSync(entryPath);
          if (contents.length === 0) {
            rmSync(entryPath, { recursive: true, force: true });
            actions.push({ action: `Removed empty worktree dir: ${entry}`, success: true });
          }
        }
      } catch {
        // Skip entries we can't read
      }
    }
  } catch {
    // Directory read failed
  }

  return actions;
}

/**
 * Exported constants for testing.
 */
export { MAX_ERROR_LOG_SIZE, STALE_LOCK_AGE_MS };
