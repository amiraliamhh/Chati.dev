import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ESCALATION_LEVELS,
  ESCALATION_THRESHOLDS,
  getEscalationLevel,
  shouldEscalate,
  getEscalationConfig,
  buildEscalationSummary,
} from '../../src/autonomy/escalation.js';

// ---------------------------------------------------------------------------
// ESCALATION_LEVELS enum
// ---------------------------------------------------------------------------

describe('ESCALATION_LEVELS', () => {
  it('should have 4 levels (0-3)', () => {
    assert.equal(ESCALATION_LEVELS.STANDARD, 0);
    assert.equal(ESCALATION_LEVELS.ENRICHED, 1);
    assert.equal(ESCALATION_LEVELS.UPGRADED, 2);
    assert.equal(ESCALATION_LEVELS.MAX, 3);
  });
});

// ---------------------------------------------------------------------------
// ESCALATION_THRESHOLDS
// ---------------------------------------------------------------------------

describe('ESCALATION_THRESHOLDS', () => {
  it('should have increasing thresholds', () => {
    assert.ok(ESCALATION_THRESHOLDS.ENRICHED_AFTER < ESCALATION_THRESHOLDS.UPGRADED_AFTER);
    assert.ok(ESCALATION_THRESHOLDS.UPGRADED_AFTER < ESCALATION_THRESHOLDS.MAX_AFTER);
  });
});

// ---------------------------------------------------------------------------
// getEscalationLevel
// ---------------------------------------------------------------------------

describe('getEscalationLevel', () => {
  it('should return STANDARD for null checkpoint', () => {
    assert.equal(getEscalationLevel(null), ESCALATION_LEVELS.STANDARD);
  });

  it('should return STANDARD for 0 attempts', () => {
    assert.equal(getEscalationLevel({ attempts: 0 }), ESCALATION_LEVELS.STANDARD);
  });

  it('should return STANDARD for 1 attempt', () => {
    assert.equal(getEscalationLevel({ attempts: 1 }), ESCALATION_LEVELS.STANDARD);
  });

  it('should return ENRICHED after threshold attempts', () => {
    assert.equal(
      getEscalationLevel({ attempts: ESCALATION_THRESHOLDS.ENRICHED_AFTER }),
      ESCALATION_LEVELS.ENRICHED
    );
  });

  it('should return UPGRADED after threshold attempts', () => {
    assert.equal(
      getEscalationLevel({ attempts: ESCALATION_THRESHOLDS.UPGRADED_AFTER }),
      ESCALATION_LEVELS.UPGRADED
    );
  });

  it('should return MAX after threshold attempts', () => {
    assert.equal(
      getEscalationLevel({ attempts: ESCALATION_THRESHOLDS.MAX_AFTER }),
      ESCALATION_LEVELS.MAX
    );
  });

  it('should respect explicit escalationLevel over attempts', () => {
    assert.equal(
      getEscalationLevel({ attempts: 0, escalationLevel: ESCALATION_LEVELS.UPGRADED }),
      ESCALATION_LEVELS.UPGRADED
    );
  });
});

// ---------------------------------------------------------------------------
// shouldEscalate
// ---------------------------------------------------------------------------

describe('shouldEscalate', () => {
  it('should not escalate at STANDARD with low attempts', () => {
    const result = shouldEscalate(
      { attempts: 1 },
      { isRepetitive: false, category: 'test_failure' }
    );
    assert.equal(result.escalate, false);
    assert.equal(result.newLevel, ESCALATION_LEVELS.STANDARD);
  });

  it('should escalate to ENRICHED after threshold', () => {
    const result = shouldEscalate(
      { attempts: ESCALATION_THRESHOLDS.ENRICHED_AFTER, escalationLevel: ESCALATION_LEVELS.STANDARD },
      { isRepetitive: false, category: 'test_failure' }
    );
    assert.equal(result.escalate, true);
    assert.equal(result.newLevel, ESCALATION_LEVELS.ENRICHED);
  });

  it('should escalate immediately for repetitive failures', () => {
    const result = shouldEscalate(
      { attempts: 1 },
      { isRepetitive: true, category: 'syntax_error' }
    );
    assert.equal(result.escalate, true);
    assert.equal(result.newLevel, ESCALATION_LEVELS.ENRICHED);
    assert.ok(result.reason.includes('Repetitive'));
  });

  it('should not escalate beyond MAX', () => {
    const result = shouldEscalate(
      { attempts: 10, escalationLevel: ESCALATION_LEVELS.MAX },
      { isRepetitive: true, category: 'test_failure' }
    );
    assert.equal(result.escalate, false);
    assert.equal(result.newLevel, ESCALATION_LEVELS.MAX);
  });

  it('should escalate to UPGRADED after threshold', () => {
    const result = shouldEscalate(
      { attempts: ESCALATION_THRESHOLDS.UPGRADED_AFTER, escalationLevel: ESCALATION_LEVELS.ENRICHED },
      { isRepetitive: false, category: 'dependency' }
    );
    assert.equal(result.escalate, true);
    assert.equal(result.newLevel, ESCALATION_LEVELS.UPGRADED);
  });

  it('should escalate to MAX after threshold', () => {
    const result = shouldEscalate(
      { attempts: ESCALATION_THRESHOLDS.MAX_AFTER, escalationLevel: ESCALATION_LEVELS.UPGRADED },
      { isRepetitive: false, category: 'unknown' }
    );
    assert.equal(result.escalate, true);
    assert.equal(result.newLevel, ESCALATION_LEVELS.MAX);
  });
});

// ---------------------------------------------------------------------------
// getEscalationConfig
// ---------------------------------------------------------------------------

describe('getEscalationConfig', () => {
  it('should return no overrides for STANDARD', () => {
    const config = getEscalationConfig(ESCALATION_LEVELS.STANDARD);
    assert.equal(config.model, null);
    assert.equal(config.contextBoost, false);
    assert.equal(config.shouldPause, false);
  });

  it('should return context boost for ENRICHED', () => {
    const config = getEscalationConfig(ESCALATION_LEVELS.ENRICHED);
    assert.equal(config.model, null);
    assert.equal(config.contextBoost, true);
    assert.equal(config.shouldPause, false);
  });

  it('should upgrade model for UPGRADED', () => {
    const config = getEscalationConfig(ESCALATION_LEVELS.UPGRADED, 'sonnet');
    assert.equal(config.model, 'opus');
    assert.equal(config.contextBoost, true);
    assert.equal(config.shouldPause, false);
  });

  it('should upgrade haiku to sonnet', () => {
    const config = getEscalationConfig(ESCALATION_LEVELS.UPGRADED, 'haiku');
    assert.equal(config.model, 'sonnet');
  });

  it('should keep opus as opus (ceiling)', () => {
    const config = getEscalationConfig(ESCALATION_LEVELS.UPGRADED, 'opus');
    assert.equal(config.model, 'opus');
  });

  it('should pause at MAX level', () => {
    const config = getEscalationConfig(ESCALATION_LEVELS.MAX, 'sonnet');
    assert.equal(config.shouldPause, true);
    assert.equal(config.contextBoost, true);
    assert.equal(config.model, 'opus');
  });

  it('should handle unknown model gracefully', () => {
    const config = getEscalationConfig(ESCALATION_LEVELS.UPGRADED, 'unknown-model');
    assert.equal(config.model, 'unknown-model');
  });

  it('should handle unknown level gracefully', () => {
    const config = getEscalationConfig(99);
    assert.equal(config.model, null);
    assert.equal(config.contextBoost, false);
    assert.equal(config.shouldPause, false);
  });
});

// ---------------------------------------------------------------------------
// buildEscalationSummary
// ---------------------------------------------------------------------------

describe('buildEscalationSummary', () => {
  it('should include level name', () => {
    const summary = buildEscalationSummary(ESCALATION_LEVELS.UPGRADED, 'test reason');
    assert.ok(summary.includes('UPGRADED'));
  });

  it('should include reason', () => {
    const summary = buildEscalationSummary(ESCALATION_LEVELS.ENRICHED, 'repetitive failures');
    assert.ok(summary.includes('repetitive failures'));
  });

  it('should handle MAX level', () => {
    const summary = buildEscalationSummary(ESCALATION_LEVELS.MAX, 'human intervention needed');
    assert.ok(summary.includes('MAX'));
    assert.ok(summary.includes('human intervention'));
  });
});
