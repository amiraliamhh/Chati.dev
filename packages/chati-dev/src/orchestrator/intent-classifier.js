/**
 * @fileoverview Intent classification for user messages.
 * Determines what the user wants to accomplish based on their input.
 */

/**
 * Intent categories the classifier can identify.
 */
export const INTENT_TYPES = {
  DISCOVER: 'discover',
  IMPLEMENTATION: 'implementation',
  REVIEW: 'review',
  DEPLOY: 'deploy',
  QUESTION: 'question',
  DEVIATION: 'deviation',
  STATUS: 'status',
  RESUME: 'resume',
  HELP: 'help',
  QUICK_FLOW: 'quick_flow',
  STANDARD_FLOW: 'standard_flow',
};

/**
 * Keyword dictionaries for each intent type.
 * Higher weight = stronger signal for that intent.
 */
const INTENT_KEYWORDS = {
  [INTENT_TYPES.DISCOVER]: {
    high: ['plan', 'design', 'architecture', 'structure', 'requirements', 'spec', 'specification'],
    medium: ['define', 'outline', 'organize', 'prepare', 'brief', 'draft'],
    low: ['think', 'consider', 'analyze', 'brainstorm'],
  },
  [INTENT_TYPES.IMPLEMENTATION]: {
    high: ['implement', 'build', 'code', 'create', 'develop', 'write'],
    medium: ['fix', 'add', 'update', 'change', 'refactor', 'modify'],
    low: ['edit', 'adjust', 'tweak', 'improve'],
  },
  [INTENT_TYPES.REVIEW]: {
    high: ['review', 'test', 'qa', 'quality', 'validate', 'verify'],
    medium: ['check', 'inspect', 'examine', 'audit', 'assess'],
    low: ['look', 'see', 'confirm'],
  },
  [INTENT_TYPES.DEPLOY]: {
    high: ['deploy', 'release', 'publish', 'ship', 'launch'],
    medium: ['ci', 'cd', 'pipeline', 'production', 'staging'],
    low: ['push', 'upload', 'deliver'],
  },
  [INTENT_TYPES.STATUS]: {
    high: ['status', 'progress', 'dashboard', 'summary', 'report'],
    medium: ['where', 'how far', 'current', 'state'],
    low: ['show', 'display', 'list'],
  },
  [INTENT_TYPES.RESUME]: {
    high: ['continue', 'resume', 'pick up', 'carry on', 'proceed', 'where we left', 'left off'],
    medium: ['where was i', 'where were we', 'what next', 'keep going'],
    low: ['onwards'],
  },
  [INTENT_TYPES.DEVIATION]: {
    high: ['change', 'instead', 'actually', 'wait', 'stop', 'different'],
    medium: ['switch', 'modify', 'adjust', 'reconsider', 'rethink'],
    low: ['maybe', 'perhaps', 'alternatively'],
  },
  [INTENT_TYPES.QUESTION]: {
    high: ['what', 'how', 'why', 'when', 'where', 'which', 'who'],
    medium: ['explain', 'tell me', 'show me', 'help me understand'],
    low: ['can you', 'could you', 'would you'],
  },
  [INTENT_TYPES.HELP]: {
    high: ['help', 'guide', 'tutorial', 'documentation', 'docs'],
    medium: ['how to', 'what is', 'explain', 'confused'],
    low: ['support', 'assist', 'info'],
  },
  [INTENT_TYPES.QUICK_FLOW]: {
    high: ['quick fix', 'hotfix', 'bug fix', 'small change', 'just fix', 'just do it'],
    medium: ['fix', 'tweak', 'config', 'patch', 'simple'],
    low: ['change', 'adjust', 'small', 'update'],
  },
  [INTENT_TYPES.STANDARD_FLOW]: {
    high: ['standard flow', 'standard pipeline', 'medium project', 'moderate scope'],
    medium: ['feature', 'integration', 'enhancement', 'module', 'component'],
    low: ['project', 'application', 'service', 'system'],
  },
};

/**
 * Weight values for keyword matching.
 */
const WEIGHTS = {
  high: 3,
  medium: 2,
  low: 1,
};

/**
 * Context boost multipliers based on current mode.
 */
const MODE_CONTEXT_BOOST = {
  discover: {
    [INTENT_TYPES.DISCOVER]: 1.5,
    [INTENT_TYPES.IMPLEMENTATION]: 0.5,
  },
  plan: {
    [INTENT_TYPES.DISCOVER]: 1.2,
    [INTENT_TYPES.IMPLEMENTATION]: 0.5,
  },
  build: {
    [INTENT_TYPES.IMPLEMENTATION]: 1.5,
    [INTENT_TYPES.REVIEW]: 1.2,
    [INTENT_TYPES.DISCOVER]: 0.5,
  },
  deploy: {
    [INTENT_TYPES.DEPLOY]: 1.5,
    [INTENT_TYPES.IMPLEMENTATION]: 0.5,
  },
};

/**
 * Classify user intent from their message.
 * Uses keyword matching with weighted scoring.
 *
 * @param {string} message - User's raw input
 * @param {object} [sessionContext] - { mode, currentAgent, pipelinePosition }
 * @returns {{ intent: string, confidence: number, keywords: string[], reasoning: string }}
 */
export function classifyIntent(message, sessionContext = {}) {
  const normalizedMessage = message.toLowerCase().trim();
  const scores = {};
  const matchedKeywords = {};

  // Initialize scores
  for (const intent of Object.values(INTENT_TYPES)) {
    scores[intent] = 0;
    matchedKeywords[intent] = [];
  }

  // Score each intent based on keyword matches
  for (const [intent, weightedKeywords] of Object.entries(INTENT_KEYWORDS)) {
    for (const [weight, keywords] of Object.entries(weightedKeywords)) {
      for (const keyword of keywords) {
        if (normalizedMessage.includes(keyword)) {
          scores[intent] += WEIGHTS[weight];
          matchedKeywords[intent].push(keyword);
        }
      }
    }
  }

  // Apply session context boost
  if (sessionContext.mode && MODE_CONTEXT_BOOST[sessionContext.mode]) {
    const boosts = MODE_CONTEXT_BOOST[sessionContext.mode];
    for (const [intent, multiplier] of Object.entries(boosts)) {
      scores[intent] *= multiplier;
    }
  }

  // Find highest scoring intent
  let maxScore = 0;
  let topIntent = INTENT_TYPES.QUESTION; // default fallback
  let totalScore = 0;

  for (const [intent, score] of Object.entries(scores)) {
    totalScore += score;
    if (score > maxScore) {
      maxScore = score;
      topIntent = intent;
    }
  }

  // Calculate confidence (0-1)
  const confidence = totalScore > 0 ? maxScore / totalScore : 0.5;

  // Build reasoning
  const reasoning = buildReasoning(
    topIntent,
    matchedKeywords[topIntent],
    sessionContext
  );

  return {
    intent: topIntent,
    confidence,
    keywords: matchedKeywords[topIntent],
    reasoning,
  };
}

/**
 * Build human-readable reasoning for intent classification.
 *
 * @param {string} intent - Classified intent
 * @param {string[]} keywords - Matched keywords
 * @param {object} context - Session context
 * @returns {string}
 */
function buildReasoning(intent, keywords, context) {
  const parts = [];

  if (keywords.length > 0) {
    parts.push(`Matched keywords: ${keywords.join(', ')}`);
  }

  if (context.mode) {
    parts.push(`Current mode: ${context.mode}`);
  }

  if (context.currentAgent) {
    parts.push(`Current agent: ${context.currentAgent}`);
  }

  return parts.join('; ');
}

/**
 * Get intent-to-phase mapping.
 *
 * @param {string} intent
 * @returns {string} Target phase (discover, plan, build, deploy)
 */
export function getIntentPhase(intent) {
  const phaseMap = {
    [INTENT_TYPES.DISCOVER]: 'discover',
    [INTENT_TYPES.IMPLEMENTATION]: 'build',
    [INTENT_TYPES.REVIEW]: 'build',
    [INTENT_TYPES.DEPLOY]: 'deploy',
    [INTENT_TYPES.QUESTION]: null, // no phase change
    [INTENT_TYPES.DEVIATION]: null, // handled separately
    [INTENT_TYPES.STATUS]: null, // no phase change
    [INTENT_TYPES.RESUME]: null, // uses current phase
    [INTENT_TYPES.HELP]: null, // no phase change
    [INTENT_TYPES.QUICK_FLOW]: 'discover', // starts with quick brief
    [INTENT_TYPES.STANDARD_FLOW]: 'discover', // starts with brief
  };

  return phaseMap[intent];
}

/**
 * Check if an intent requires mode change.
 *
 * @param {string} intent
 * @param {string} currentMode
 * @returns {{ needsChange: boolean, targetMode: string|null, reason: string }}
 */
export function checkModeAlignment(intent, currentMode) {
  const targetPhase = getIntentPhase(intent);

  if (!targetPhase) {
    return {
      needsChange: false,
      targetMode: null,
      reason: 'Intent does not require mode change',
    };
  }

  if (targetPhase === currentMode) {
    return {
      needsChange: false,
      targetMode: null,
      reason: 'Already in correct mode',
    };
  }

  // Check if mode change is allowed
  const modeOrder = ['discover', 'plan', 'build', 'deploy'];
  const currentIndex = modeOrder.indexOf(currentMode);
  const targetIndex = modeOrder.indexOf(targetPhase);

  if (targetIndex > currentIndex) {
    return {
      needsChange: true,
      targetMode: targetPhase,
      reason: `Intent requires ${targetPhase} mode (forward transition)`,
    };
  }

  // Backward transition (requires deviation protocol)
  return {
    needsChange: true,
    targetMode: targetPhase,
    reason: `Intent requires ${targetPhase} mode (backward transition - deviation protocol)`,
  };
}

/**
 * Quick Flow trigger and disqualifier keywords.
 */
const QUICK_FLOW_TRIGGERS = [
  'quick fix', 'hotfix', 'bug fix', 'small change', 'just fix',
  'just do it', 'simple fix', 'patch', 'config change',
];

const QUICK_FLOW_DISQUALIFIERS = [
  'architecture', 'design system', 'database schema', 'auth',
  'authentication', 'multiple services', 'microservices', 'enterprise',
  'compliance', 'full pipeline', 'full process',
];

/**
 * Detect if a message qualifies for Quick Flow (fast-track pipeline).
 * Quick Flow skips Detail, Architect, UX, Phases, Tasks, QA-Planning.
 *
 * @param {string} message - User's raw input
 * @param {object} [sessionContext] - { mode, currentAgent, isGreenfield, hasExistingCodebase }
 * @returns {{ isQuickFlow: boolean, confidence: number, reason: string }}
 */
export function detectQuickFlow(message, sessionContext = {}) {
  const normalized = message.toLowerCase().trim();

  // Check for disqualifiers first (they override triggers)
  for (const disqualifier of QUICK_FLOW_DISQUALIFIERS) {
    if (normalized.includes(disqualifier)) {
      return {
        isQuickFlow: false,
        confidence: 0.9,
        reason: `Disqualified: message contains "${disqualifier}"`,
      };
    }
  }

  // Complex greenfield projects (multiple requirements, architecture needed) are disqualified
  // But simple greenfield (single-purpose tool, fun project, prototype) are allowed
  const sentenceCount = normalized.split(/[.!?]+/).filter((s) => s.trim().length > 0).length;
  const requirementSignals = (normalized.match(/\band\b|\balso\b|\bplus\b|\badditionally\b/g) || []).length;

  if (sessionContext.isGreenfield && (sentenceCount > 3 || requirementSignals > 2)) {
    return {
      isQuickFlow: false,
      confidence: 0.7,
      reason: 'Greenfield with multiple requirements detected',
    };
  }

  // Check for trigger keywords
  let triggerScore = 0;
  const matchedTriggers = [];

  for (const trigger of QUICK_FLOW_TRIGGERS) {
    if (normalized.includes(trigger)) {
      triggerScore += 3;
      matchedTriggers.push(trigger);
    }
  }

  // Single-sentence requests are a signal for quick flow
  if (sentenceCount <= 1 && normalized.length < 200) {
    triggerScore += 2;
  }

  // Calculate confidence
  const confidence = Math.min(triggerScore / 5, 1.0);

  if (confidence >= 0.8) {
    return {
      isQuickFlow: true,
      confidence,
      reason: `Quick flow triggers matched: ${matchedTriggers.join(', ') || 'short single-requirement message'}`,
    };
  }

  return {
    isQuickFlow: false,
    confidence,
    reason: `Confidence ${confidence.toFixed(2)} below threshold 0.8`,
  };
}

/**
 * Standard Flow trigger and disqualifier keywords.
 */
const STANDARD_FLOW_TRIGGERS = [
  'standard flow', 'standard pipeline', 'medium project',
  'new feature', 'integration', 'enhancement', 'module',
];

const STANDARD_FLOW_DISQUALIFIERS = [
  'quick fix', 'hotfix', 'just fix', 'simple fix',
  'full pipeline', 'full process', 'enterprise', 'compliance',
];

/**
 * Detect if a message qualifies for Standard Flow (mid-tier pipeline).
 * Standard Flow uses 8 agents (between Quick 4 and Full 12).
 *
 * @param {string} message - User's raw input
 * @param {object} [sessionContext] - { mode, currentAgent, isGreenfield, hasExistingCodebase }
 * @returns {{ isStandardFlow: boolean, confidence: number, reason: string }}
 */
export function detectStandardFlow(message, sessionContext = {}) {
  const normalized = message.toLowerCase().trim();

  // Check for disqualifiers first
  for (const disqualifier of STANDARD_FLOW_DISQUALIFIERS) {
    if (normalized.includes(disqualifier)) {
      return {
        isStandardFlow: false,
        confidence: 0.9,
        reason: `Disqualified: message contains "${disqualifier}"`,
      };
    }
  }

  // Count requirement signals
  const sentenceCount = normalized.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
  const requirementSignals = (normalized.match(/\band\b|\balso\b|\bplus\b|\badditionally\b/g) || []).length;

  // Heuristic: 2-5 requirements suggest standard flow (not quick, not full)
  const requirementCount = sentenceCount + requirementSignals;

  let triggerScore = 0;
  const matchedTriggers = [];

  // Check for trigger keywords
  for (const trigger of STANDARD_FLOW_TRIGGERS) {
    if (normalized.includes(trigger)) {
      triggerScore += 3;
      matchedTriggers.push(trigger);
    }
  }

  // Requirement count in the sweet spot (2-5)
  if (requirementCount >= 2 && requirementCount <= 5) {
    triggerScore += 2;
  }

  // Brownfield moderate context
  if (sessionContext.hasExistingCodebase || sessionContext.isGreenfield === false) {
    triggerScore += 1;
  }

  // Message length in moderate range (not too short, not too long)
  if (normalized.length > 100 && normalized.length < 1000) {
    triggerScore += 1;
  }

  const confidence = Math.min(triggerScore / 5, 1.0);

  if (confidence >= 0.8) {
    return {
      isStandardFlow: true,
      confidence,
      reason: `Standard flow triggers matched: ${matchedTriggers.join(', ') || 'moderate requirement count'}`,
    };
  }

  return {
    isStandardFlow: false,
    confidence,
    reason: `Confidence ${confidence.toFixed(2)} below threshold 0.8`,
  };
}
