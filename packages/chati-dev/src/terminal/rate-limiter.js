/**
 * @fileoverview Rate limiting for terminal spawner.
 *
 * Prevents exceeding API rate limits when spawning multiple agent
 * processes. Uses a sliding window counter per provider.
 *
 * Constitution Article XIX — Multi-CLI Governance.
 */

// ---------------------------------------------------------------------------
// Default Limits
// ---------------------------------------------------------------------------

/**
 * Default rate limits per provider (requests per minute).
 * Conservative defaults — can be overridden at creation time.
 */
export const DEFAULT_LIMITS = {
  claude: 20,
  gemini: 15,
  codex: 10,
  copilot: 10,
};

/** Sliding window size in milliseconds (1 minute). */
const WINDOW_MS = 60_000;

// ---------------------------------------------------------------------------
// RateLimiter Class
// ---------------------------------------------------------------------------

/**
 * @typedef {object} RateLimiterStats
 * @property {number} used - Requests used in current window
 * @property {number} limit - Maximum requests per window
 * @property {number} windowStart - Window start timestamp (ms)
 * @property {number|null} nextAvailable - Timestamp when next slot opens (null if available now)
 * @property {string} provider - Provider name
 */

/**
 * Create a rate limiter instance for a specific provider.
 *
 * @param {string} provider - Provider name (claude, gemini, codex, copilot)
 * @param {{ limit?: number }} [customLimits={}]
 * @returns {{ canSpawn: () => boolean, recordSpawn: () => void, waitForSlot: () => Promise<void>, getStats: () => RateLimiterStats, reset: () => void }}
 */
export function createRateLimiter(provider, customLimits = {}) {
  const limit = customLimits.limit || DEFAULT_LIMITS[provider] || 10;

  /** @type {number[]} Timestamps of recorded spawns */
  let timestamps = [];

  /**
   * Prune timestamps outside the sliding window.
   */
  function prune() {
    const cutoff = Date.now() - WINDOW_MS;
    timestamps = timestamps.filter(t => t > cutoff);
  }

  /**
   * Check if a spawn is allowed under current rate limits.
   * @returns {boolean}
   */
  function canSpawn() {
    prune();
    return timestamps.length < limit;
  }

  /**
   * Record a spawn event.
   */
  function recordSpawn() {
    timestamps.push(Date.now());
  }

  /**
   * Wait until a rate limit slot becomes available.
   * Resolves immediately if a slot is available.
   *
   * @returns {Promise<void>}
   */
  function waitForSlot() {
    if (canSpawn()) {
      return Promise.resolve();
    }

    // Calculate when the oldest timestamp exits the window
    prune();
    if (timestamps.length === 0) {
      return Promise.resolve();
    }

    const oldestInWindow = timestamps[0];
    const waitTime = Math.max(0, (oldestInWindow + WINDOW_MS) - Date.now() + 10);

    return new Promise(resolve => {
      setTimeout(() => {
        prune();
        resolve();
      }, waitTime);
    });
  }

  /**
   * Get current rate limiter statistics.
   * @returns {RateLimiterStats}
   */
  function getStats() {
    prune();

    const now = Date.now();
    const windowStart = now - WINDOW_MS;

    let nextAvailable = null;
    if (timestamps.length >= limit && timestamps.length > 0) {
      nextAvailable = timestamps[0] + WINDOW_MS;
    }

    return {
      used: timestamps.length,
      limit,
      windowStart,
      nextAvailable,
      provider,
    };
  }

  /**
   * Reset the rate limiter (clear all recorded timestamps).
   */
  function reset() {
    timestamps = [];
  }

  return { canSpawn, recordSpawn, waitForSlot, getStats, reset };
}

// ---------------------------------------------------------------------------
// Global Registry
// ---------------------------------------------------------------------------

/** @type {Map<string, ReturnType<typeof createRateLimiter>>} */
const _registry = new Map();

/**
 * Get or create a rate limiter for a provider.
 * Ensures one limiter per provider across the application.
 *
 * @param {string} provider - Provider name
 * @param {{ limit?: number }} [customLimits={}]
 * @returns {ReturnType<typeof createRateLimiter>}
 */
export function getRateLimiter(provider, customLimits = {}) {
  if (!_registry.has(provider)) {
    _registry.set(provider, createRateLimiter(provider, customLimits));
  }
  return _registry.get(provider);
}

/**
 * Clear all registered rate limiters (useful in tests).
 */
export function clearAllLimiters() {
  _registry.clear();
}

/**
 * Exported for testing.
 */
export { WINDOW_MS };
