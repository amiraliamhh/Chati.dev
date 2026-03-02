/**
 * @fileoverview Progressive escalation for build loop retries.
 *
 * When a task fails repeatedly, escalation progressively increases
 * the resources (model tier, context enrichment) and ultimately
 * pauses for human intervention.
 *
 * Constitution Article XVII — Execution Mode Governance.
 */

// ---------------------------------------------------------------------------
// Escalation Levels
// ---------------------------------------------------------------------------

/**
 * Escalation level definitions.
 * @enum {number}
 */
export const ESCALATION_LEVELS = {
  /** Standard — use configured model, no extra context. */
  STANDARD: 0,
  /** Enriched — same model, inject cause analysis + retry guidance. */
  ENRICHED: 1,
  /** Upgraded — escalate to higher-tier model (e.g. sonnet → opus). */
  UPGRADED: 2,
  /** Max — pause execution and request human intervention. */
  MAX: 3,
};

/**
 * Model upgrade map — maps current model tier to the next tier.
 * Keys are logical tier names used in chati config.
 */
const MODEL_UPGRADE_MAP = {
  haiku: 'sonnet',
  sonnet: 'opus',
  opus: 'opus', // opus is ceiling
  // Gemini equivalents
  flash: 'pro',
  pro: 'pro',
  // Codex equivalents
  codex: 'codex',
};

/**
 * Thresholds for automatic escalation.
 */
const ESCALATION_THRESHOLDS = {
  /** Attempts before escalating from STANDARD to ENRICHED. */
  ENRICHED_AFTER: 2,
  /** Attempts before escalating from ENRICHED to UPGRADED. */
  UPGRADED_AFTER: 4,
  /** Attempts before escalating from UPGRADED to MAX. */
  MAX_AFTER: 7,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get the current escalation level for a task checkpoint.
 *
 * @param {{ attempts: number, escalationLevel?: number }} checkpoint
 * @returns {number} Current escalation level (0-3)
 */
export function getEscalationLevel(checkpoint) {
  if (!checkpoint) return ESCALATION_LEVELS.STANDARD;

  // Explicit level takes precedence (set by previous escalation)
  if (typeof checkpoint.escalationLevel === 'number') {
    return checkpoint.escalationLevel;
  }

  // Derive from attempt count
  const attempts = checkpoint.attempts || 0;

  if (attempts >= ESCALATION_THRESHOLDS.MAX_AFTER) {
    return ESCALATION_LEVELS.MAX;
  }
  if (attempts >= ESCALATION_THRESHOLDS.UPGRADED_AFTER) {
    return ESCALATION_LEVELS.UPGRADED;
  }
  if (attempts >= ESCALATION_THRESHOLDS.ENRICHED_AFTER) {
    return ESCALATION_LEVELS.ENRICHED;
  }

  return ESCALATION_LEVELS.STANDARD;
}

/**
 * Determine whether escalation should occur based on checkpoint
 * state and cause analysis.
 *
 * @param {{ attempts: number, escalationLevel?: number }} checkpoint
 * @param {{ isRepetitive: boolean, category: string }} analysis - Cause analysis result
 * @returns {{ escalate: boolean, newLevel: number, reason: string }}
 */
export function shouldEscalate(checkpoint, analysis) {
  const currentLevel = getEscalationLevel(checkpoint);
  const attempts = checkpoint?.attempts || 0;

  // Already at max — no further escalation
  if (currentLevel >= ESCALATION_LEVELS.MAX) {
    return {
      escalate: false,
      newLevel: ESCALATION_LEVELS.MAX,
      reason: 'Already at maximum escalation level',
    };
  }

  // Repetitive failures trigger immediate escalation (+1 level)
  if (analysis?.isRepetitive) {
    const newLevel = Math.min(currentLevel + 1, ESCALATION_LEVELS.MAX);
    return {
      escalate: true,
      newLevel,
      reason: `Repetitive ${analysis.category} failure — escalating to level ${newLevel}`,
    };
  }

  // Threshold-based escalation
  let targetLevel = ESCALATION_LEVELS.STANDARD;
  if (attempts >= ESCALATION_THRESHOLDS.MAX_AFTER) {
    targetLevel = ESCALATION_LEVELS.MAX;
  } else if (attempts >= ESCALATION_THRESHOLDS.UPGRADED_AFTER) {
    targetLevel = ESCALATION_LEVELS.UPGRADED;
  } else if (attempts >= ESCALATION_THRESHOLDS.ENRICHED_AFTER) {
    targetLevel = ESCALATION_LEVELS.ENRICHED;
  }

  if (targetLevel > currentLevel) {
    return {
      escalate: true,
      newLevel: targetLevel,
      reason: `Attempt ${attempts} reached threshold for level ${targetLevel}`,
    };
  }

  return {
    escalate: false,
    newLevel: currentLevel,
    reason: 'No escalation needed',
  };
}

/**
 * Get configuration for a given escalation level.
 *
 * @param {number} level - Escalation level (0-3)
 * @param {string} [currentModel='sonnet'] - Current model tier name
 * @returns {{ model: string|null, contextBoost: boolean, shouldPause: boolean, description: string }}
 */
export function getEscalationConfig(level, currentModel = 'sonnet') {
  switch (level) {
    case ESCALATION_LEVELS.STANDARD:
      return {
        model: null, // no override
        contextBoost: false,
        shouldPause: false,
        description: 'Standard execution — no escalation',
      };

    case ESCALATION_LEVELS.ENRICHED:
      return {
        model: null, // same model
        contextBoost: true,
        shouldPause: false,
        description: 'Enriched context — cause analysis + retry guidance injected',
      };

    case ESCALATION_LEVELS.UPGRADED:
      return {
        model: MODEL_UPGRADE_MAP[currentModel] || currentModel,
        contextBoost: true,
        shouldPause: false,
        description: `Model upgraded from ${currentModel} to ${MODEL_UPGRADE_MAP[currentModel] || currentModel}`,
      };

    case ESCALATION_LEVELS.MAX:
      return {
        model: MODEL_UPGRADE_MAP[currentModel] || currentModel,
        contextBoost: true,
        shouldPause: true,
        description: 'Maximum escalation — pausing for human intervention',
      };

    default:
      return {
        model: null,
        contextBoost: false,
        shouldPause: false,
        description: `Unknown escalation level: ${level}`,
      };
  }
}

/**
 * Build a human-readable escalation summary.
 *
 * @param {number} level - Escalation level
 * @param {string} reason - Escalation reason
 * @returns {string}
 */
export function buildEscalationSummary(level, reason) {
  const levelNames = ['STANDARD', 'ENRICHED', 'UPGRADED', 'MAX'];
  const name = levelNames[level] || 'UNKNOWN';
  return `[Escalation ${name}] ${reason}`;
}

/**
 * Exported for testing — escalation thresholds.
 */
export { ESCALATION_THRESHOLDS };
