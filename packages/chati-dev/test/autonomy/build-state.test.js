/**
 * @fileoverview Tests for build-state module
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_ITERATIONS_PER_TASK,
  MAX_TIME_PER_TASK_MS,
  GLOBAL_TIMEOUT_MS,
  ABANDONED_THRESHOLD_MS,
  BuildStatus,
  CheckpointStatus,
  createBuildState,
  loadBuildState,
  saveBuildState,
  updateCheckpoint,
  startBuild,
  completeBuild,
  failBuild,
  getNextPendingTask,
  isTaskExhausted,
  isTimedOut,
  getProgress,
} from '../../src/autonomy/build-state.js';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('build-state', () => {
  describe('constants', () => {
    it('should export MAX_ITERATIONS_PER_TASK as 10', () => {
      assert.equal(MAX_ITERATIONS_PER_TASK, 10);
    });

    it('should export MAX_TIME_PER_TASK_MS as 10 minutes', () => {
      assert.equal(MAX_TIME_PER_TASK_MS, 10 * 60 * 1000);
    });

    it('should export GLOBAL_TIMEOUT_MS as 30 minutes', () => {
      assert.equal(GLOBAL_TIMEOUT_MS, 30 * 60 * 1000);
    });

    it('should export ABANDONED_THRESHOLD_MS as 1 hour', () => {
      assert.equal(ABANDONED_THRESHOLD_MS, 60 * 60 * 1000);
    });
  });

  describe('createBuildState', () => {
    it('should create state with correct structure', () => {
      const state = createBuildState(['task-1', 'task-2']);
      assert.equal(state.status, BuildStatus.PENDING);
      assert.equal(state.checkpoints.length, 2);
      assert.ok(state.sessionId.startsWith('build-'));
      assert.equal(state.totalAttempts, 0);
      assert.equal(state.completedAt, null);
    });

    it('should create checkpoints with firstAttempt null', () => {
      const state = createBuildState(['task-1']);
      const checkpoint = state.checkpoints[0];
      assert.equal(checkpoint.taskId, 'task-1');
      assert.equal(checkpoint.status, CheckpointStatus.PENDING);
      assert.equal(checkpoint.attempts, 0);
      assert.equal(checkpoint.firstAttempt, null);
      assert.equal(checkpoint.lastAttempt, null);
      assert.equal(checkpoint.output, null);
      assert.equal(checkpoint.error, null);
    });
  });

  describe('updateCheckpoint', () => {
    it('should update checkpoint fields', () => {
      const state = createBuildState(['task-1']);
      const updated = updateCheckpoint(state, 'task-1', {
        status: CheckpointStatus.IN_PROGRESS,
        attempts: 1,
      });
      assert.equal(updated.checkpoints[0].status, CheckpointStatus.IN_PROGRESS);
      assert.equal(updated.checkpoints[0].attempts, 1);
    });

    it('should throw for unknown task', () => {
      const state = createBuildState(['task-1']);
      assert.throws(() => updateCheckpoint(state, 'unknown', {}), /not found/);
    });

    it('should set firstAttempt on first attempt', () => {
      const state = createBuildState(['task-1']);
      const updated = updateCheckpoint(state, 'task-1', { attempts: 1 });
      assert.ok(updated.checkpoints[0].firstAttempt !== null);
      assert.ok(typeof updated.checkpoints[0].firstAttempt === 'string');
    });

    it('should not overwrite firstAttempt on subsequent attempts', () => {
      const state = createBuildState(['task-1']);
      const after1 = updateCheckpoint(state, 'task-1', { attempts: 1 });
      const firstAttemptTime = after1.checkpoints[0].firstAttempt;
      const after2 = updateCheckpoint(after1, 'task-1', { attempts: 2 });
      assert.equal(after2.checkpoints[0].firstAttempt, firstAttemptTime);
    });

    it('should update totalAttempts when attempts changes', () => {
      const state = createBuildState(['task-1', 'task-2']);
      const updated = updateCheckpoint(state, 'task-1', { attempts: 3 });
      assert.equal(updated.totalAttempts, 3);
    });

    it('should update lastCheckpoint timestamp', () => {
      const state = createBuildState(['task-1']);
      const before = state.lastCheckpoint;
      const updated = updateCheckpoint(state, 'task-1', { status: CheckpointStatus.COMPLETED });
      assert.notEqual(updated.lastCheckpoint, before);
    });
  });

  describe('isTaskExhausted', () => {
    it('should return true when attempts exceed MAX_ITERATIONS_PER_TASK', () => {
      const checkpoint = { attempts: 10, firstAttempt: new Date().toISOString() };
      assert.equal(isTaskExhausted(checkpoint), true);
    });

    it('should return false when attempts below max and time below max', () => {
      const checkpoint = { attempts: 3, firstAttempt: new Date().toISOString() };
      assert.equal(isTaskExhausted(checkpoint), false);
    });

    it('should return true when time exceeds MAX_TIME_PER_TASK_MS even with few attempts', () => {
      const pastTime = new Date(Date.now() - MAX_TIME_PER_TASK_MS - 1000).toISOString();
      const checkpoint = { attempts: 2, firstAttempt: pastTime };
      assert.equal(isTaskExhausted(checkpoint), true);
    });

    it('should return false when time is below max even with many attempts (but below iteration max)', () => {
      const checkpoint = { attempts: 9, firstAttempt: new Date().toISOString() };
      assert.equal(isTaskExhausted(checkpoint), false);
    });

    it('should handle checkpoint without firstAttempt (backward compat)', () => {
      const checkpoint = { attempts: 5 };
      assert.equal(isTaskExhausted(checkpoint), false);
    });

    it('should handle checkpoint without firstAttempt at max iterations', () => {
      const checkpoint = { attempts: 10 };
      assert.equal(isTaskExhausted(checkpoint), true);
    });
  });

  describe('startBuild / completeBuild / failBuild', () => {
    it('should set status to IN_PROGRESS', () => {
      const state = createBuildState(['task-1']);
      const started = startBuild(state);
      assert.equal(started.status, BuildStatus.IN_PROGRESS);
    });

    it('should set status to COMPLETED', () => {
      const state = createBuildState(['task-1']);
      const completed = completeBuild(state);
      assert.equal(completed.status, BuildStatus.COMPLETED);
      assert.ok(completed.completedAt !== null);
    });

    it('should set status to FAILED', () => {
      const state = createBuildState(['task-1']);
      const failed = failBuild(state, 'reason');
      assert.equal(failed.status, BuildStatus.FAILED);
      assert.ok(failed.completedAt !== null);
    });
  });

  describe('getNextPendingTask', () => {
    it('should return first pending task', () => {
      const state = createBuildState(['task-1', 'task-2']);
      const next = getNextPendingTask(state);
      assert.equal(next.taskId, 'task-1');
    });

    it('should return in_progress task over pending', () => {
      const state = createBuildState(['task-1', 'task-2']);
      state.checkpoints[0].status = CheckpointStatus.IN_PROGRESS;
      const next = getNextPendingTask(state);
      assert.equal(next.taskId, 'task-1');
    });

    it('should return null when all completed or failed', () => {
      const state = createBuildState(['task-1']);
      state.checkpoints[0].status = CheckpointStatus.COMPLETED;
      assert.equal(getNextPendingTask(state), null);
    });
  });

  describe('isTimedOut', () => {
    it('should return false for recent build', () => {
      const state = createBuildState(['task-1']);
      assert.equal(isTimedOut(state), false);
    });

    it('should return true for old build', () => {
      const state = createBuildState(['task-1']);
      state.startedAt = new Date(Date.now() - GLOBAL_TIMEOUT_MS - 1000).toISOString();
      assert.equal(isTimedOut(state), true);
    });
  });

  describe('getProgress', () => {
    it('should calculate progress correctly', () => {
      const state = createBuildState(['task-1', 'task-2', 'task-3']);
      state.checkpoints[0].status = CheckpointStatus.COMPLETED;
      state.checkpoints[1].status = CheckpointStatus.FAILED;
      const progress = getProgress(state);
      assert.equal(progress.total, 3);
      assert.equal(progress.completed, 1);
      assert.equal(progress.failed, 1);
      assert.equal(progress.pending, 1);
      assert.equal(progress.progress, 33);
    });
  });

  describe('saveBuildState / loadBuildState', () => {
    const tmpDir = join(tmpdir(), `chati-test-build-state-${Date.now()}`);

    it('should save and load state', () => {
      mkdirSync(tmpDir, { recursive: true });
      const state = createBuildState(['task-1']);
      saveBuildState(tmpDir, state);
      const loaded = loadBuildState(tmpDir);
      assert.equal(loaded.sessionId, state.sessionId);
      assert.equal(loaded.checkpoints.length, 1);
      rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should return null when no state file', () => {
      const noDir = join(tmpdir(), `chati-test-nodir-${Date.now()}`);
      assert.equal(loadBuildState(noDir), null);
    });

    it('should detect abandoned builds', () => {
      mkdirSync(tmpDir, { recursive: true });
      const state = createBuildState(['task-1']);
      state.status = BuildStatus.IN_PROGRESS;
      state.lastCheckpoint = new Date(Date.now() - ABANDONED_THRESHOLD_MS - 1000).toISOString();
      saveBuildState(tmpDir, state);
      const loaded = loadBuildState(tmpDir);
      assert.equal(loaded.status, BuildStatus.ABANDONED);
      rmSync(tmpDir, { recursive: true, force: true });
    });
  });

  describe('BuildStatus enum', () => {
    it('should have all expected statuses', () => {
      assert.equal(BuildStatus.PENDING, 'pending');
      assert.equal(BuildStatus.IN_PROGRESS, 'in_progress');
      assert.equal(BuildStatus.PAUSED, 'paused');
      assert.equal(BuildStatus.ABANDONED, 'abandoned');
      assert.equal(BuildStatus.FAILED, 'failed');
      assert.equal(BuildStatus.COMPLETED, 'completed');
    });
  });

  describe('CheckpointStatus enum', () => {
    it('should have all expected statuses', () => {
      assert.equal(CheckpointStatus.PENDING, 'pending');
      assert.equal(CheckpointStatus.IN_PROGRESS, 'in_progress');
      assert.equal(CheckpointStatus.COMPLETED, 'completed');
      assert.equal(CheckpointStatus.FAILED, 'failed');
      assert.equal(CheckpointStatus.SKIPPED, 'skipped');
    });
  });
});
