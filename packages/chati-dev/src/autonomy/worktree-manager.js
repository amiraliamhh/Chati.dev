/**
 * @fileoverview Git worktree isolation for build loop retries.
 *
 * Each retry attempt can optionally run in an isolated git worktree,
 * preventing failed attempts from corrupting the main working directory.
 *
 * Constitution Article XVII — Execution Mode Governance.
 */

/**
 * @deprecated Not currently imported by any production module.
 * Retained for potential future integration. Remove if still unused by v4.0.
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, readdirSync, statSync, rmSync } from 'fs';
import { join, resolve } from 'path';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Directory for worktrees inside .chati/ */
const WORKTREE_DIR = '.chati/worktrees';

/** Maximum age (ms) before a worktree is considered stale (24h). */
const MAX_WORKTREE_AGE_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Execute a git command in a given directory and return trimmed stdout.
 *
 * @param {string} cmd - Git command (without the `git` prefix)
 * @param {string} cwd - Working directory
 * @returns {string} Trimmed stdout
 */
function git(cmd, cwd) {
  return execSync(`git ${cmd}`, {
    cwd,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check if a directory is inside a git repository.
 *
 * @param {string} dir - Directory path
 * @returns {boolean}
 */
export function isGitRepo(dir) {
  try {
    git('rev-parse --is-inside-work-tree', dir);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create an isolated git worktree for a retry attempt.
 *
 * The worktree is placed at `.chati/worktrees/<taskId>-attempt-<N>`.
 * A new branch is created from the current HEAD.
 *
 * @param {string} projectDir - Root project directory
 * @param {string} taskId - Task identifier
 * @param {number} attempt - Attempt number
 * @returns {{ path: string, branch: string, cleanup: () => void }}
 * @throws {Error} If not a git repo or worktree creation fails
 */
export function createWorktree(projectDir, taskId, attempt) {
  const absProject = resolve(projectDir);

  if (!isGitRepo(absProject)) {
    throw new Error(`Not a git repository: ${absProject}`);
  }

  const safeName = `${taskId}-attempt-${attempt}`.replace(/[^a-zA-Z0-9._-]/g, '_');
  const worktreeBase = join(absProject, WORKTREE_DIR);
  const worktreePath = join(worktreeBase, safeName);
  const branch = `chati/${safeName}`;

  // Ensure worktree base directory exists
  mkdirSync(worktreeBase, { recursive: true });

  // Clean up if a worktree already exists at this path
  if (existsSync(worktreePath)) {
    try {
      git(`worktree remove "${worktreePath}" --force`, absProject);
    } catch {
      rmSync(worktreePath, { recursive: true, force: true });
    }
  }

  // Delete branch if it exists from a previous run
  try {
    git(`branch -D "${branch}"`, absProject);
  } catch {
    // Branch doesn't exist — fine
  }

  // Create worktree with new branch from HEAD
  git(`worktree add -b "${branch}" "${worktreePath}"`, absProject);

  const cleanup = () => {
    try {
      git(`worktree remove "${worktreePath}" --force`, absProject);
    } catch {
      // Worktree already removed — ignore
    }
    try {
      git(`branch -D "${branch}"`, absProject);
    } catch {
      // Branch already deleted — ignore
    }
  };

  return { path: worktreePath, branch, cleanup };
}

/**
 * Merge changes from a worktree branch back to the main branch.
 *
 * @param {string} projectDir - Root project directory
 * @param {string} worktreeBranch - Worktree branch name
 * @param {string} [mainBranch] - Target branch (auto-detected if omitted)
 * @returns {{ success: boolean, conflicts: string[] }}
 */
export function mergeWorktree(projectDir, worktreeBranch, mainBranch) {
  const absProject = resolve(projectDir);

  // Auto-detect main branch if not specified
  if (!mainBranch) {
    try {
      mainBranch = git('rev-parse --abbrev-ref HEAD', absProject);
    } catch {
      mainBranch = 'main';
    }
  }

  // Ensure we're on the main branch
  try {
    git(`checkout "${mainBranch}"`, absProject);
  } catch {
    return { success: false, conflicts: [`Failed to checkout ${mainBranch}`] };
  }

  // Attempt merge
  try {
    git(`merge "${worktreeBranch}" --no-edit`, absProject);
    return { success: true, conflicts: [] };
  } catch (err) {
    // Parse conflicts from error output
    const conflicts = [];
    try {
      const status = git('diff --name-only --diff-filter=U', absProject);
      if (status) {
        conflicts.push(...status.split('\n').filter(Boolean));
      }
    } catch {
      conflicts.push('Unknown conflict — check git status');
    }

    // Abort the failed merge
    try {
      git('merge --abort', absProject);
    } catch {
      // Already aborted or not in merging state
    }

    return { success: false, conflicts };
  }
}

/**
 * Clean up stale worktrees that exceed the maximum age.
 *
 * @param {string} projectDir - Root project directory
 * @param {{ maxAge?: number }} [options={}]
 * @returns {{ cleaned: string[], errors: string[] }}
 */
export function cleanupWorktrees(projectDir, options = {}) {
  const absProject = resolve(projectDir);
  const maxAge = options.maxAge || MAX_WORKTREE_AGE_MS;
  const worktreeBase = join(absProject, WORKTREE_DIR);
  const cleaned = [];
  const errors = [];

  if (!existsSync(worktreeBase)) {
    return { cleaned, errors };
  }

  const now = Date.now();
  let entries;
  try {
    entries = readdirSync(worktreeBase);
  } catch {
    return { cleaned, errors: ['Failed to read worktree directory'] };
  }

  for (const entry of entries) {
    const entryPath = join(worktreeBase, entry);

    try {
      const stat = statSync(entryPath);
      if (!stat.isDirectory()) continue;

      const age = now - stat.mtimeMs;
      if (age > maxAge) {
        try {
          git(`worktree remove "${entryPath}" --force`, absProject);
        } catch {
          rmSync(entryPath, { recursive: true, force: true });
        }

        // Also remove the branch
        const branch = `chati/${entry}`;
        try {
          git(`branch -D "${branch}"`, absProject);
        } catch {
          // Branch already deleted
        }

        cleaned.push(entry);
      }
    } catch (err) {
      errors.push(`${entry}: ${err.message}`);
    }
  }

  return { cleaned, errors };
}

/**
 * Exported constants for testing.
 */
export { WORKTREE_DIR, MAX_WORKTREE_AGE_MS };
