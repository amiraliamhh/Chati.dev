/**
 * @fileoverview Dedicated unit tests for the CircuitBreaker class.
 *
 * Tests cover all state transitions (CLOSED → OPEN → HALF_OPEN → CLOSED),
 * threshold behavior, timeout recovery, statistics, and reset logic.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CircuitBreaker, CIRCUIT_STATES } from '../../src/gates/circuit-breaker.js';

// ---------------------------------------------------------------------------
// CIRCUIT_STATES export
// ---------------------------------------------------------------------------

describe('CIRCUIT_STATES', () => {
  it('exports CLOSED, OPEN, HALF_OPEN states', () => {
    assert.equal(CIRCUIT_STATES.CLOSED, 'CLOSED');
    assert.equal(CIRCUIT_STATES.OPEN, 'OPEN');
    assert.equal(CIRCUIT_STATES.HALF_OPEN, 'HALF_OPEN');
    assert.equal(Object.keys(CIRCUIT_STATES).length, 3);
  });
});

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

describe('CircuitBreaker constructor', () => {
  it('uses default failureThreshold=3 and resetTimeout=60000', () => {
    const cb = new CircuitBreaker();
    assert.equal(cb.failureThreshold, 3);
    assert.equal(cb.resetTimeout, 60000);
    assert.equal(cb.getState(), 'CLOSED');
  });

  it('accepts custom failureThreshold and resetTimeout', () => {
    const cb = new CircuitBreaker({ failureThreshold: 5, resetTimeout: 10000 });
    assert.equal(cb.failureThreshold, 5);
    assert.equal(cb.resetTimeout, 10000);
  });
});

// ---------------------------------------------------------------------------
// CLOSED → OPEN transitions
// ---------------------------------------------------------------------------

describe('CLOSED → OPEN transition', () => {
  it('opens after exactly failureThreshold consecutive failures', () => {
    const cb = new CircuitBreaker({ failureThreshold: 3 });

    for (let i = 0; i < 3; i++) {
      assert.throws(() => cb.execute(() => { throw new Error('fail'); }));
    }

    assert.equal(cb.getState(), 'OPEN');
  });

  it('stays CLOSED with fewer than threshold failures', () => {
    const cb = new CircuitBreaker({ failureThreshold: 3 });

    // 2 failures (below threshold of 3)
    for (let i = 0; i < 2; i++) {
      assert.throws(() => cb.execute(() => { throw new Error('fail'); }));
    }

    assert.equal(cb.getState(), 'CLOSED');
  });
});

// ---------------------------------------------------------------------------
// OPEN behavior
// ---------------------------------------------------------------------------

describe('OPEN state', () => {
  it('rejects immediately with descriptive error', () => {
    const cb = new CircuitBreaker({ failureThreshold: 1 });
    assert.throws(() => cb.execute(() => { throw new Error('fail'); }));
    assert.equal(cb.getState(), 'OPEN');

    assert.throws(
      () => cb.execute(() => 'should not run'),
      /Circuit breaker is OPEN/
    );
  });

  it('stays OPEN before resetTimeout elapses', () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeout: 60000 });
    assert.throws(() => cb.execute(() => { throw new Error('fail'); }));
    assert.equal(cb.getState(), 'OPEN');

    // Immediately try — should still be OPEN (timeout not elapsed)
    assert.throws(
      () => cb.execute(() => 'probe'),
      /Circuit breaker is OPEN/
    );
    assert.equal(cb.getState(), 'OPEN');
  });
});

// ---------------------------------------------------------------------------
// OPEN → HALF_OPEN transition (timeout-based)
// ---------------------------------------------------------------------------

describe('OPEN → HALF_OPEN transition', () => {
  it('transitions to HALF_OPEN after resetTimeout', () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeout: 1 });

    // Trigger OPEN
    assert.throws(() => cb.execute(() => { throw new Error('fail'); }));
    assert.equal(cb.getState(), 'OPEN');

    // Force _lastFailure to be in the past
    cb._lastFailure = Date.now() - 10;

    // Next execute should detect timeout and move to HALF_OPEN, then execute fn
    const result = cb.execute(() => 'recovered');
    assert.equal(result, 'recovered');
    assert.equal(cb.getState(), 'CLOSED'); // success in HALF_OPEN → CLOSED
  });
});

// ---------------------------------------------------------------------------
// HALF_OPEN → CLOSED (recovery success)
// ---------------------------------------------------------------------------

describe('HALF_OPEN → CLOSED (recovery)', () => {
  it('closes circuit on successful execution in HALF_OPEN', () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeout: 1 });

    // Open the circuit
    assert.throws(() => cb.execute(() => { throw new Error('fail'); }));
    cb._lastFailure = Date.now() - 10;

    // Succeed in HALF_OPEN
    cb.execute(() => 'ok');
    assert.equal(cb.getState(), 'CLOSED');

    // Failures counter should be reset
    const stats = cb.getStats();
    assert.equal(stats.failures, 0);
  });
});

// ---------------------------------------------------------------------------
// HALF_OPEN → OPEN (recovery failure)
// ---------------------------------------------------------------------------

describe('HALF_OPEN → OPEN (failed recovery)', () => {
  it('reopens circuit on failure in HALF_OPEN', () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeout: 1 });

    // Open the circuit
    assert.throws(() => cb.execute(() => { throw new Error('fail'); }));
    cb._lastFailure = Date.now() - 10;

    // Fail again in HALF_OPEN
    assert.throws(() => cb.execute(() => { throw new Error('still failing'); }));
    assert.equal(cb.getState(), 'OPEN');
  });
});

// ---------------------------------------------------------------------------
// reset()
// ---------------------------------------------------------------------------

describe('reset()', () => {
  it('resets to CLOSED, clears failures and lastFailure', () => {
    const cb = new CircuitBreaker({ failureThreshold: 1 });

    // Open the circuit
    assert.throws(() => cb.execute(() => { throw new Error('fail'); }));
    assert.equal(cb.getState(), 'OPEN');

    cb.reset();
    assert.equal(cb.getState(), 'CLOSED');
    assert.equal(cb.getStats().failures, 0);
    assert.equal(cb.getStats().lastFailure, null);
  });
});

// ---------------------------------------------------------------------------
// getStats()
// ---------------------------------------------------------------------------

describe('getStats()', () => {
  it('returns complete snapshot with all fields', () => {
    const cb = new CircuitBreaker();
    const stats = cb.getStats();

    assert.equal(stats.state, 'CLOSED');
    assert.equal(stats.failures, 0);
    assert.equal(stats.successes, 0);
    assert.equal(stats.lastFailure, null);
    assert.equal(stats.lastSuccess, null);
  });

  it('tracks successes and failures independently after mixed operations', () => {
    const cb = new CircuitBreaker({ failureThreshold: 10 });

    cb.execute(() => 'ok1');
    cb.execute(() => 'ok2');
    assert.throws(() => cb.execute(() => { throw new Error('fail'); }));
    cb.execute(() => 'ok3');

    const stats = cb.getStats();
    assert.equal(stats.successes, 3);
    assert.equal(stats.failures, 1);
    assert.ok(stats.lastSuccess > 0);
    assert.ok(stats.lastFailure > 0);
  });
});

// ---------------------------------------------------------------------------
// Success counting in CLOSED state
// ---------------------------------------------------------------------------

describe('success counting', () => {
  it('increments _successes on each successful execute in CLOSED', () => {
    const cb = new CircuitBreaker();

    cb.execute(() => 'a');
    cb.execute(() => 'b');
    cb.execute(() => 'c');

    assert.equal(cb.getStats().successes, 3);
  });
});

// ---------------------------------------------------------------------------
// Error propagation
// ---------------------------------------------------------------------------

describe('error propagation', () => {
  it('propagates the original error through execute()', () => {
    const cb = new CircuitBreaker({ failureThreshold: 10 });
    const originalError = new Error('specific error message');

    assert.throws(
      () => cb.execute(() => { throw originalError; }),
      (err) => {
        assert.equal(err, originalError);
        assert.equal(err.message, 'specific error message');
        return true;
      }
    );
  });
});
