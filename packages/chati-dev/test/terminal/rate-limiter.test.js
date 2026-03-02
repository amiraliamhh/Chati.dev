import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_LIMITS,
  WINDOW_MS,
  createRateLimiter,
  getRateLimiter,
  clearAllLimiters,
} from '../../src/terminal/rate-limiter.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('rate-limiter constants', () => {
  it('should have default limits for all providers', () => {
    assert.equal(typeof DEFAULT_LIMITS.claude, 'number');
    assert.equal(typeof DEFAULT_LIMITS.gemini, 'number');
    assert.equal(typeof DEFAULT_LIMITS.codex, 'number');
    assert.equal(typeof DEFAULT_LIMITS.copilot, 'number');
  });

  it('should have a 60-second window', () => {
    assert.equal(WINDOW_MS, 60_000);
  });

  it('should have positive limits', () => {
    for (const [, limit] of Object.entries(DEFAULT_LIMITS)) {
      assert.ok(limit > 0);
    }
  });
});

// ---------------------------------------------------------------------------
// createRateLimiter
// ---------------------------------------------------------------------------

describe('createRateLimiter', () => {
  it('should create a limiter with default provider limits', () => {
    const limiter = createRateLimiter('claude');
    const stats = limiter.getStats();
    assert.equal(stats.limit, DEFAULT_LIMITS.claude);
    assert.equal(stats.provider, 'claude');
    assert.equal(stats.used, 0);
  });

  it('should accept custom limits', () => {
    const limiter = createRateLimiter('claude', { limit: 5 });
    const stats = limiter.getStats();
    assert.equal(stats.limit, 5);
  });

  it('should use fallback limit for unknown providers', () => {
    const limiter = createRateLimiter('unknown-provider');
    const stats = limiter.getStats();
    assert.equal(stats.limit, 10); // fallback
  });
});

// ---------------------------------------------------------------------------
// canSpawn
// ---------------------------------------------------------------------------

describe('canSpawn', () => {
  it('should allow spawn when under limit', () => {
    const limiter = createRateLimiter('claude', { limit: 3 });
    assert.equal(limiter.canSpawn(), true);
  });

  it('should deny spawn when at limit', () => {
    const limiter = createRateLimiter('claude', { limit: 2 });

    limiter.recordSpawn();
    limiter.recordSpawn();

    assert.equal(limiter.canSpawn(), false);
  });

  it('should allow spawn after reset', () => {
    const limiter = createRateLimiter('claude', { limit: 1 });
    limiter.recordSpawn();
    assert.equal(limiter.canSpawn(), false);

    limiter.reset();
    assert.equal(limiter.canSpawn(), true);
  });
});

// ---------------------------------------------------------------------------
// recordSpawn
// ---------------------------------------------------------------------------

describe('recordSpawn', () => {
  it('should increment used count', () => {
    const limiter = createRateLimiter('gemini', { limit: 10 });
    assert.equal(limiter.getStats().used, 0);

    limiter.recordSpawn();
    assert.equal(limiter.getStats().used, 1);

    limiter.recordSpawn();
    assert.equal(limiter.getStats().used, 2);
  });
});

// ---------------------------------------------------------------------------
// waitForSlot
// ---------------------------------------------------------------------------

describe('waitForSlot', () => {
  it('should resolve immediately when under limit', async () => {
    const limiter = createRateLimiter('claude', { limit: 5 });
    const start = Date.now();

    await limiter.waitForSlot();

    const elapsed = Date.now() - start;
    assert.ok(elapsed < 50, `Expected immediate resolution, took ${elapsed}ms`);
  });

  it('should resolve immediately after reset', async () => {
    const limiter = createRateLimiter('claude', { limit: 1 });
    limiter.recordSpawn();

    limiter.reset();

    const start = Date.now();
    await limiter.waitForSlot();
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 50);
  });
});

// ---------------------------------------------------------------------------
// getStats
// ---------------------------------------------------------------------------

describe('getStats', () => {
  it('should return complete stats object', () => {
    const limiter = createRateLimiter('codex', { limit: 5 });
    const stats = limiter.getStats();

    assert.equal(typeof stats.used, 'number');
    assert.equal(typeof stats.limit, 'number');
    assert.equal(typeof stats.windowStart, 'number');
    assert.equal(stats.provider, 'codex');
    assert.equal(stats.used, 0);
    assert.equal(stats.limit, 5);
  });

  it('should show null nextAvailable when under limit', () => {
    const limiter = createRateLimiter('claude', { limit: 5 });
    const stats = limiter.getStats();
    assert.equal(stats.nextAvailable, null);
  });

  it('should show nextAvailable when at limit', () => {
    const limiter = createRateLimiter('claude', { limit: 1 });
    limiter.recordSpawn();
    const stats = limiter.getStats();
    assert.ok(stats.nextAvailable !== null);
    assert.ok(stats.nextAvailable > Date.now());
  });
});

// ---------------------------------------------------------------------------
// Global Registry
// ---------------------------------------------------------------------------

describe('getRateLimiter (global registry)', () => {
  beforeEach(() => {
    clearAllLimiters();
  });

  it('should return same instance for same provider', () => {
    const a = getRateLimiter('claude');
    const b = getRateLimiter('claude');
    assert.equal(a, b);
  });

  it('should return different instances for different providers', () => {
    const a = getRateLimiter('claude');
    const b = getRateLimiter('gemini');
    assert.notEqual(a, b);
  });

  it('should clear all limiters', () => {
    const a = getRateLimiter('claude');
    a.recordSpawn();
    assert.equal(a.getStats().used, 1);

    clearAllLimiters();

    const b = getRateLimiter('claude');
    assert.equal(b.getStats().used, 0);
  });
});

// ---------------------------------------------------------------------------
// Per-provider isolation
// ---------------------------------------------------------------------------

describe('per-provider isolation', () => {
  it('should track spawns independently per provider', () => {
    const claude = createRateLimiter('claude', { limit: 5 });
    const gemini = createRateLimiter('gemini', { limit: 5 });

    claude.recordSpawn();
    claude.recordSpawn();
    claude.recordSpawn();

    assert.equal(claude.getStats().used, 3);
    assert.equal(gemini.getStats().used, 0);
  });
});
