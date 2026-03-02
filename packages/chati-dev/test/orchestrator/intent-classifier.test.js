/**
 * @fileoverview Tests for intent classification.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  INTENT_TYPES,
  classifyIntent,
  getIntentPhase,
  checkModeAlignment,
  detectStandardFlow,
} from '../../src/orchestrator/intent-classifier.js';

describe('intent-classifier', () => {
  describe('classifyIntent', () => {
    it('should classify discover intent', () => {
      const result = classifyIntent('I want to plan a new feature');
      assert.equal(result.intent, INTENT_TYPES.DISCOVER);
      assert.ok(result.confidence > 0);
      assert.ok(result.keywords.includes('plan'));
    });

    it('should classify implementation intent', () => {
      const result = classifyIntent('Let\'s build the login system');
      assert.equal(result.intent, INTENT_TYPES.IMPLEMENTATION);
      assert.ok(result.keywords.includes('build'));
    });

    it('should classify review intent', () => {
      const result = classifyIntent('Please review and test my code');
      assert.equal(result.intent, INTENT_TYPES.REVIEW);
      assert.ok(result.keywords.includes('review'));
      assert.ok(result.keywords.includes('test'));
    });

    it('should classify deploy intent', () => {
      const result = classifyIntent('Deploy to production please');
      assert.equal(result.intent, INTENT_TYPES.DEPLOY);
      assert.ok(result.keywords.includes('deploy'));
    });

    it('should classify status intent', () => {
      const result = classifyIntent('What is the current status?');
      assert.equal(result.intent, INTENT_TYPES.STATUS);
      assert.ok(result.keywords.includes('status'));
    });

    it('should classify resume intent', () => {
      const result = classifyIntent('Let\'s continue where we left off');
      assert.equal(result.intent, INTENT_TYPES.RESUME);
      assert.ok(result.keywords.includes('continue'));
    });

    it('should classify deviation intent', () => {
      const result = classifyIntent('Actually, let\'s change the plan');
      assert.equal(result.intent, INTENT_TYPES.DEVIATION);
      assert.ok(result.keywords.includes('change'));
    });

    it('should classify question intent', () => {
      const result = classifyIntent('How does this work?');
      assert.equal(result.intent, INTENT_TYPES.QUESTION);
      assert.ok(result.keywords.includes('how'));
    });

    it('should classify help intent', () => {
      const result = classifyIntent('I need help with the setup');
      assert.equal(result.intent, INTENT_TYPES.HELP);
      assert.ok(result.keywords.includes('help'));
    });

    it('should boost implementation intent in build mode', () => {
      const msg = 'add a new feature';
      const withoutContext = classifyIntent(msg);
      const withContext = classifyIntent(msg, { mode: 'build' });

      assert.equal(withContext.intent, INTENT_TYPES.IMPLEMENTATION);
      assert.ok(withContext.confidence >= withoutContext.confidence);
    });

    it('should boost discover intent in discover mode', () => {
      const msg = 'let me think about the architecture';
      const withContext = classifyIntent(msg, { mode: 'discover' });

      assert.equal(withContext.intent, INTENT_TYPES.DISCOVER);
    });

    it('should include reasoning in result', () => {
      const result = classifyIntent('plan a feature', { mode: 'discover' });
      assert.ok(result.reasoning);
      assert.ok(result.reasoning.includes('plan'));
    });

    it('should handle empty message', () => {
      const result = classifyIntent('');
      assert.ok(Object.values(INTENT_TYPES).includes(result.intent));
    });

    it('should handle case insensitive matching', () => {
      const result = classifyIntent('DEPLOY TO PRODUCTION');
      assert.equal(result.intent, INTENT_TYPES.DEPLOY);
    });
  });

  describe('getIntentPhase', () => {
    it('should map discover to discover phase', () => {
      assert.equal(getIntentPhase(INTENT_TYPES.DISCOVER), 'discover');
    });

    it('should map implementation to build phase', () => {
      assert.equal(getIntentPhase(INTENT_TYPES.IMPLEMENTATION), 'build');
    });

    it('should map review to build phase', () => {
      assert.equal(getIntentPhase(INTENT_TYPES.REVIEW), 'build');
    });

    it('should map deploy to deploy phase', () => {
      assert.equal(getIntentPhase(INTENT_TYPES.DEPLOY), 'deploy');
    });

    it('should return null for question intent', () => {
      assert.equal(getIntentPhase(INTENT_TYPES.QUESTION), null);
    });

    it('should return null for status intent', () => {
      assert.equal(getIntentPhase(INTENT_TYPES.STATUS), null);
    });

    it('should return null for resume intent', () => {
      assert.equal(getIntentPhase(INTENT_TYPES.RESUME), null);
    });
  });

  describe('checkModeAlignment', () => {
    it('should detect no change needed when aligned', () => {
      const result = checkModeAlignment(INTENT_TYPES.DISCOVER, 'discover');
      assert.equal(result.needsChange, false);
      assert.equal(result.targetMode, null);
    });

    it('should detect forward transition needed', () => {
      const result = checkModeAlignment(INTENT_TYPES.IMPLEMENTATION, 'discover');
      assert.equal(result.needsChange, true);
      assert.equal(result.targetMode, 'build');
      assert.ok(result.reason.includes('forward'));
    });

    it('should detect backward transition needed', () => {
      const result = checkModeAlignment(INTENT_TYPES.DISCOVER, 'build');
      assert.equal(result.needsChange, true);
      assert.equal(result.targetMode, 'discover');
      assert.ok(result.reason.includes('backward'));
    });

    it('should handle intents with no phase mapping', () => {
      const result = checkModeAlignment(INTENT_TYPES.STATUS, 'discover');
      assert.equal(result.needsChange, false);
    });

    it('should detect deploy transition from discover', () => {
      const result = checkModeAlignment(INTENT_TYPES.DEPLOY, 'discover');
      assert.equal(result.needsChange, true);
      assert.equal(result.targetMode, 'deploy');
    });
  });

  describe('STANDARD_FLOW intent type', () => {
    it('should have STANDARD_FLOW in INTENT_TYPES', () => {
      assert.equal(INTENT_TYPES.STANDARD_FLOW, 'standard_flow');
    });

    it('should map STANDARD_FLOW to discover phase', () => {
      assert.equal(getIntentPhase(INTENT_TYPES.STANDARD_FLOW), 'discover');
    });

    it('should classify standard flow keywords', () => {
      const result = classifyIntent('I need a standard flow for this medium project with a new feature and integration');
      assert.ok(result.confidence > 0);
    });
  });

  describe('detectStandardFlow', () => {
    it('should detect standard flow trigger keywords', () => {
      // Needs enough signals: trigger keyword + moderate length + requirement count
      const result = detectStandardFlow(
        'I need a standard flow for this medium project. Add user authentication and also profile management.',
        { hasExistingCodebase: true }
      );
      assert.equal(result.isStandardFlow, true);
      assert.ok(result.confidence >= 0.8);
    });

    it('should disqualify quick fix messages', () => {
      const result = detectStandardFlow('quick fix for the login bug');
      assert.equal(result.isStandardFlow, false);
      assert.ok(result.reason.includes('Disqualified'));
    });

    it('should disqualify enterprise messages', () => {
      const result = detectStandardFlow('enterprise compliance audit system');
      assert.equal(result.isStandardFlow, false);
    });

    it('should boost brownfield context', () => {
      const withContext = detectStandardFlow(
        'I need a new feature and also an integration module',
        { hasExistingCodebase: true }
      );
      const withoutContext = detectStandardFlow(
        'I need a new feature and also an integration module',
        {}
      );
      assert.ok(withContext.confidence >= withoutContext.confidence);
    });

    it('should not detect for very short messages', () => {
      const result = detectStandardFlow('fix button');
      assert.equal(result.isStandardFlow, false);
    });

    it('should detect moderate requirement count (2-5)', () => {
      const result = detectStandardFlow(
        'Build a new feature for user profiles. Add avatar upload. Also integrate with the notification service. Plus add email preferences.',
        { isGreenfield: false }
      );
      // Should have decent confidence due to requirement count + brownfield
      assert.ok(result.confidence > 0);
    });
  });
});
