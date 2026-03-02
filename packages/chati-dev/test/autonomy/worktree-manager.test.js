import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import {
  isGitRepo,
  createWorktree,
  mergeWorktree,
  cleanupWorktrees,
  WORKTREE_DIR,
  MAX_WORKTREE_AGE_MS,
} from '../../src/autonomy/worktree-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('worktree-manager constants', () => {
  it('should have a worktree directory path', () => {
    assert.equal(WORKTREE_DIR, '.chati/worktrees');
  });

  it('should have a 24h max age', () => {
    assert.equal(MAX_WORKTREE_AGE_MS, 24 * 60 * 60 * 1000);
  });
});

// ---------------------------------------------------------------------------
// isGitRepo
// ---------------------------------------------------------------------------

describe('isGitRepo', () => {
  it('should return true for a git repository', () => {
    // The project root is a git repo
    const projectRoot = join(__dirname, '../..');
    assert.equal(isGitRepo(projectRoot), true);
  });

  it('should return false for a non-git directory', () => {
    // Must be outside ANY git repo — /tmp/ is not inside a git repo
    const tmpDir = join('/tmp', `chati-test-not-git-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    try {
      assert.equal(isGitRepo(tmpDir), false);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should return false for non-existent directory', () => {
    assert.equal(isGitRepo('/tmp/does-not-exist-xyz-123'), false);
  });
});

// ---------------------------------------------------------------------------
// createWorktree — with a real temporary git repo
// ---------------------------------------------------------------------------

describe('createWorktree', () => {
  let tempRepo;

  before(() => {
    // Create a temporary git repo OUTSIDE the project to avoid nested git issues
    tempRepo = join('/tmp', `chati-worktree-test-${Date.now()}`);
    mkdirSync(tempRepo, { recursive: true });
    execSync('git init', { cwd: tempRepo, stdio: 'pipe' });
    execSync('git config user.email "test@test.com"', { cwd: tempRepo, stdio: 'pipe' });
    execSync('git config user.name "Test"', { cwd: tempRepo, stdio: 'pipe' });

    // Create initial commit (required for worktrees)
    writeFileSync(join(tempRepo, 'README.md'), '# Test');
    execSync('git add . && git commit -m "initial"', { cwd: tempRepo, stdio: 'pipe' });
  });

  after(() => {
    // Clean up all worktrees first, then remove dir
    try {
      const worktrees = execSync('git worktree list --porcelain', {
        cwd: tempRepo,
        encoding: 'utf-8',
        stdio: 'pipe',
      });
      // Remove any linked worktrees
      for (const line of worktrees.split('\n')) {
        if (line.startsWith('worktree ') && !line.includes(tempRepo + '\n') && line.trim() !== `worktree ${tempRepo}`) {
          const wtPath = line.replace('worktree ', '').trim();
          if (wtPath !== tempRepo) {
            try {
              execSync(`git worktree remove "${wtPath}" --force`, { cwd: tempRepo, stdio: 'pipe' });
            } catch { /* ignore */ }
          }
        }
      }
    } catch { /* ignore */ }
    rmSync(tempRepo, { recursive: true, force: true });
  });

  it('should create a worktree successfully', () => {
    const result = createWorktree(tempRepo, 'task-001', 1);

    assert.ok(result.path);
    assert.ok(result.branch);
    assert.ok(typeof result.cleanup === 'function');
    assert.ok(result.path.includes('task-001-attempt-1'));
    assert.ok(result.branch.includes('chati/'));
    assert.ok(existsSync(result.path));

    // Cleanup
    result.cleanup();
  });

  it('should sanitize task IDs for file system safety', () => {
    const result = createWorktree(tempRepo, 'task/with spaces!', 2);

    assert.ok(result.path);
    assert.ok(!result.path.includes(' '));
    assert.ok(!result.path.includes('!'));
    assert.ok(existsSync(result.path));

    result.cleanup();
  });

  it('should handle creating worktree when path already exists', () => {
    // Create first
    const result1 = createWorktree(tempRepo, 'overwrite-test', 1);
    assert.ok(existsSync(result1.path));

    // Create again at same path — should succeed
    const result2 = createWorktree(tempRepo, 'overwrite-test', 1);
    assert.ok(existsSync(result2.path));

    result2.cleanup();
  });

  it('should throw for non-git directories', () => {
    // Must be outside ANY git repo — /tmp/ is not inside a git repo
    const nonGitDir = join('/tmp', `chati-test-non-git-wt-${Date.now()}`);
    mkdirSync(nonGitDir, { recursive: true });
    try {
      assert.throws(
        () => createWorktree(nonGitDir, 'task-001', 1),
        { message: /Not a git repository/ }
      );
    } finally {
      rmSync(nonGitDir, { recursive: true, force: true });
    }
  });

  it('should cleanup worktree and branch', () => {
    const result = createWorktree(tempRepo, 'cleanup-test', 1);
    assert.ok(existsSync(result.path));

    result.cleanup();

    // Path should no longer exist after cleanup
    assert.equal(existsSync(result.path), false);
  });
});

// ---------------------------------------------------------------------------
// mergeWorktree
// ---------------------------------------------------------------------------

describe('mergeWorktree', () => {
  let tempRepo;

  before(() => {
    tempRepo = join('/tmp', `chati-merge-test-${Date.now()}`);
    mkdirSync(tempRepo, { recursive: true });
    execSync('git init', { cwd: tempRepo, stdio: 'pipe' });
    execSync('git config user.email "test@test.com"', { cwd: tempRepo, stdio: 'pipe' });
    execSync('git config user.name "Test"', { cwd: tempRepo, stdio: 'pipe' });
    writeFileSync(join(tempRepo, 'README.md'), '# Test');
    execSync('git add . && git commit -m "initial"', { cwd: tempRepo, stdio: 'pipe' });
  });

  after(() => {
    try {
      const worktrees = execSync('git worktree list --porcelain', {
        cwd: tempRepo,
        encoding: 'utf-8',
        stdio: 'pipe',
      });
      for (const line of worktrees.split('\n')) {
        if (line.startsWith('worktree ')) {
          const wtPath = line.replace('worktree ', '').trim();
          if (wtPath !== tempRepo) {
            try {
              execSync(`git worktree remove "${wtPath}" --force`, { cwd: tempRepo, stdio: 'pipe' });
            } catch { /* ignore */ }
          }
        }
      }
    } catch { /* ignore */ }
    rmSync(tempRepo, { recursive: true, force: true });
  });

  it('should merge a worktree branch successfully', () => {
    const mainBranch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: tempRepo,
      encoding: 'utf-8',
    }).trim();

    const wt = createWorktree(tempRepo, 'merge-success', 1);

    // Make a change in the worktree
    writeFileSync(join(wt.path, 'new-file.txt'), 'hello from worktree');
    execSync('git add . && git commit -m "worktree change"', { cwd: wt.path, stdio: 'pipe' });

    const result = mergeWorktree(tempRepo, wt.branch, mainBranch);

    assert.equal(result.success, true);
    assert.deepEqual(result.conflicts, []);

    // Verify the file exists in main
    assert.ok(existsSync(join(tempRepo, 'new-file.txt')));

    wt.cleanup();
  });

  it('should detect merge conflicts', () => {
    const mainBranch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: tempRepo,
      encoding: 'utf-8',
    }).trim();

    const wt = createWorktree(tempRepo, 'merge-conflict', 1);

    // Make conflicting changes
    writeFileSync(join(tempRepo, 'conflict.txt'), 'main version');
    execSync('git add . && git commit -m "main change"', { cwd: tempRepo, stdio: 'pipe' });

    writeFileSync(join(wt.path, 'conflict.txt'), 'worktree version');
    execSync('git add . && git commit -m "wt change"', { cwd: wt.path, stdio: 'pipe' });

    const result = mergeWorktree(tempRepo, wt.branch, mainBranch);

    assert.equal(result.success, false);
    assert.ok(result.conflicts.length > 0);

    wt.cleanup();
  });
});

// ---------------------------------------------------------------------------
// cleanupWorktrees
// ---------------------------------------------------------------------------

describe('cleanupWorktrees', () => {
  it('should return empty when no worktree directory exists', () => {
    const fakeDir = join(__dirname, 'tmp-no-worktrees');
    mkdirSync(fakeDir, { recursive: true });
    try {
      const result = cleanupWorktrees(fakeDir);
      assert.deepEqual(result.cleaned, []);
      assert.deepEqual(result.errors, []);
    } finally {
      rmSync(fakeDir, { recursive: true, force: true });
    }
  });

  it('should not clean fresh worktrees', () => {
    let tempRepo;
    try {
      tempRepo = join('/tmp', `chati-cleanup-fresh-${Date.now()}`);
      mkdirSync(tempRepo, { recursive: true });
      execSync('git init', { cwd: tempRepo, stdio: 'pipe' });
      execSync('git config user.email "test@test.com"', { cwd: tempRepo, stdio: 'pipe' });
      execSync('git config user.name "Test"', { cwd: tempRepo, stdio: 'pipe' });
      writeFileSync(join(tempRepo, 'README.md'), '# Test');
      execSync('git add . && git commit -m "initial"', { cwd: tempRepo, stdio: 'pipe' });

      const wt = createWorktree(tempRepo, 'fresh-task', 1);

      // With very long maxAge, nothing should be cleaned
      const result = cleanupWorktrees(tempRepo, { maxAge: 999_999_999 });
      assert.deepEqual(result.cleaned, []);

      wt.cleanup();
    } finally {
      if (tempRepo) rmSync(tempRepo, { recursive: true, force: true });
    }
  });
});
