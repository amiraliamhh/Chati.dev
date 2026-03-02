/**
 * @fileoverview Tests for event-bus module
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  EVENTS,
  emit,
  on,
  once,
  off,
  removeAllListeners,
  listenerCount,
} from '../../src/utils/event-bus.js';

describe('event-bus', () => {
  afterEach(() => {
    removeAllListeners();
  });

  describe('EVENTS', () => {
    it('should have build events', () => {
      assert.ok(EVENTS.BUILD_STARTED);
      assert.ok(EVENTS.BUILD_COMPLETED);
      assert.ok(EVENTS.BUILD_FAILED);
      assert.ok(EVENTS.TASK_STARTED);
      assert.ok(EVENTS.TASK_COMPLETED);
      assert.ok(EVENTS.TASK_FAILED);
      assert.ok(EVENTS.TASK_EXHAUSTED);
    });

    it('should have terminal events', () => {
      assert.ok(EVENTS.TERMINAL_SPAWNED);
      assert.ok(EVENTS.TERMINAL_EXITED);
      assert.ok(EVENTS.TERMINAL_KILLED);
    });

    it('should have pipeline events', () => {
      assert.ok(EVENTS.PHASE_ADVANCED);
      assert.ok(EVENTS.AGENT_COMPLETED);
      assert.ok(EVENTS.QA_GATE_PASSED);
      assert.ok(EVENTS.QA_GATE_FAILED);
    });

    it('should have safety events', () => {
      assert.ok(EVENTS.SAFETY_TRIGGERED);
    });

    it('should have health events', () => {
      assert.ok(EVENTS.HEALTH_CHECK_COMPLETED);
    });

    it('should have escalation events', () => {
      assert.ok(EVENTS.ESCALATION_TRIGGERED);
      assert.ok(EVENTS.ESCALATION_PAUSED);
    });

    it('should have at least 18 events', () => {
      assert.ok(Object.keys(EVENTS).length >= 18);
    });

    it('should have unique event name values', () => {
      const values = Object.values(EVENTS);
      const unique = new Set(values);
      assert.equal(values.length, unique.size);
    });
  });

  describe('emit / on', () => {
    it('should deliver event to listener', () => {
      let received = null;
      on(EVENTS.BUILD_STARTED, (data) => { received = data; });
      emit(EVENTS.BUILD_STARTED, { taskCount: 5 });
      assert.ok(received !== null);
      assert.equal(received.taskCount, 5);
    });

    it('should auto-add timestamp to event data', () => {
      let received = null;
      on(EVENTS.BUILD_STARTED, (data) => { received = data; });
      const before = Date.now();
      emit(EVENTS.BUILD_STARTED, {});
      assert.ok(received.timestamp >= before);
      assert.ok(received.timestamp <= Date.now());
    });

    it('should work with empty data', () => {
      let received = null;
      on(EVENTS.BUILD_COMPLETED, (data) => { received = data; });
      emit(EVENTS.BUILD_COMPLETED);
      assert.ok(received !== null);
      assert.ok(typeof received.timestamp === 'number');
    });

    it('should deliver to multiple listeners', () => {
      let count = 0;
      on(EVENTS.TASK_STARTED, () => { count++; });
      on(EVENTS.TASK_STARTED, () => { count++; });
      emit(EVENTS.TASK_STARTED, {});
      assert.equal(count, 2);
    });
  });

  describe('once', () => {
    it('should fire handler only once', () => {
      let count = 0;
      once(EVENTS.TASK_COMPLETED, () => { count++; });
      emit(EVENTS.TASK_COMPLETED, {});
      emit(EVENTS.TASK_COMPLETED, {});
      assert.equal(count, 1);
    });
  });

  describe('off', () => {
    it('should remove specific listener', () => {
      let count = 0;
      const handler = () => { count++; };
      on(EVENTS.TASK_FAILED, handler);
      emit(EVENTS.TASK_FAILED, {});
      assert.equal(count, 1);
      off(EVENTS.TASK_FAILED, handler);
      emit(EVENTS.TASK_FAILED, {});
      assert.equal(count, 1);
    });
  });

  describe('removeAllListeners', () => {
    it('should remove all listeners for specific event', () => {
      on(EVENTS.BUILD_STARTED, () => {});
      on(EVENTS.BUILD_STARTED, () => {});
      on(EVENTS.BUILD_COMPLETED, () => {});
      removeAllListeners(EVENTS.BUILD_STARTED);
      assert.equal(listenerCount(EVENTS.BUILD_STARTED), 0);
      assert.equal(listenerCount(EVENTS.BUILD_COMPLETED), 1);
    });

    it('should remove all listeners when no event specified', () => {
      on(EVENTS.BUILD_STARTED, () => {});
      on(EVENTS.BUILD_COMPLETED, () => {});
      removeAllListeners();
      assert.equal(listenerCount(EVENTS.BUILD_STARTED), 0);
      assert.equal(listenerCount(EVENTS.BUILD_COMPLETED), 0);
    });
  });

  describe('listenerCount', () => {
    it('should return 0 for no listeners', () => {
      assert.equal(listenerCount(EVENTS.SAFETY_TRIGGERED), 0);
    });

    it('should return correct count', () => {
      on(EVENTS.SAFETY_TRIGGERED, () => {});
      on(EVENTS.SAFETY_TRIGGERED, () => {});
      assert.equal(listenerCount(EVENTS.SAFETY_TRIGGERED), 2);
    });
  });
});
