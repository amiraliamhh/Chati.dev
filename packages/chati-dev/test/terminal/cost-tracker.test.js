import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  COST_PER_1K,
  estimateTokens,
  createCostTracker,
} from '../../src/terminal/cost-tracker.js';

// ---------------------------------------------------------------------------
// COST_PER_1K
// ---------------------------------------------------------------------------

describe('COST_PER_1K', () => {
  it('should have costs for all main models', () => {
    assert.ok(typeof COST_PER_1K.opus === 'number');
    assert.ok(typeof COST_PER_1K.sonnet === 'number');
    assert.ok(typeof COST_PER_1K.haiku === 'number');
    assert.ok(typeof COST_PER_1K.pro === 'number');
    assert.ok(typeof COST_PER_1K.flash === 'number');
    assert.ok(typeof COST_PER_1K.unknown === 'number');
  });

  it('should have opus more expensive than sonnet', () => {
    assert.ok(COST_PER_1K.opus > COST_PER_1K.sonnet);
  });

  it('should have sonnet more expensive than haiku', () => {
    assert.ok(COST_PER_1K.sonnet > COST_PER_1K.haiku);
  });
});

// ---------------------------------------------------------------------------
// estimateTokens
// ---------------------------------------------------------------------------

describe('estimateTokens', () => {
  it('should estimate ~4 chars per token', () => {
    const tokens = estimateTokens('hello world'); // 11 chars
    assert.equal(tokens, Math.ceil(11 / 4)); // 3
  });

  it('should return 0 for empty string', () => {
    assert.equal(estimateTokens(''), 0);
  });

  it('should return 0 for null', () => {
    assert.equal(estimateTokens(null), 0);
  });

  it('should return 0 for non-string', () => {
    assert.equal(estimateTokens(42), 0);
  });

  it('should handle long text', () => {
    const text = 'x'.repeat(4000);
    assert.equal(estimateTokens(text), 1000);
  });
});

// ---------------------------------------------------------------------------
// createCostTracker
// ---------------------------------------------------------------------------

describe('createCostTracker', () => {
  it('should create tracker with zero initial cost', () => {
    const tracker = createCostTracker();
    assert.equal(tracker.getSessionCost(), 0);
  });

  it('should record an execution', () => {
    const tracker = createCostTracker();
    const record = tracker.recordExecution({
      agent: 'dev',
      model: 'sonnet',
      taskId: 'implement-feature',
      inputText: 'a'.repeat(4000), // ~1000 tokens
      outputText: 'b'.repeat(2000), // ~500 tokens
      duration: 5000,
    });

    assert.equal(record.agent, 'dev');
    assert.equal(record.model, 'sonnet');
    assert.ok(record.inputTokens > 0);
    assert.ok(record.outputTokens > 0);
    assert.ok(record.cost > 0);
    assert.ok(record.timestamp);
  });

  it('should accumulate session cost', () => {
    const tracker = createCostTracker();

    tracker.recordExecution({
      agent: 'dev',
      model: 'sonnet',
      taskId: 't1',
      inputText: 'hello',
      outputText: 'world',
    });

    tracker.recordExecution({
      agent: 'architect',
      model: 'opus',
      taskId: 't2',
      inputText: 'design this',
      outputText: 'architecture plan',
    });

    assert.ok(tracker.getSessionCost() > 0);
  });

  it('should track per-agent costs', () => {
    const tracker = createCostTracker();

    tracker.recordExecution({
      agent: 'dev',
      model: 'sonnet',
      taskId: 't1',
      inputText: 'a'.repeat(400),
      outputText: 'b'.repeat(400),
    });

    tracker.recordExecution({
      agent: 'dev',
      model: 'sonnet',
      taskId: 't2',
      inputText: 'c'.repeat(400),
      outputText: 'd'.repeat(400),
    });

    const devCost = tracker.getAgentCost('dev');
    assert.equal(devCost.count, 2);
    assert.ok(devCost.cost > 0);
    assert.ok(devCost.tokens > 0);
  });

  it('should return zero for unknown agent', () => {
    const tracker = createCostTracker();
    const result = tracker.getAgentCost('nonexistent');
    assert.equal(result.count, 0);
    assert.equal(result.cost, 0);
  });

  it('should export a complete report', () => {
    const tracker = createCostTracker();

    tracker.recordExecution({
      agent: 'dev',
      model: 'sonnet',
      taskId: 't1',
      inputText: 'hello',
      outputText: 'world',
    });

    tracker.recordExecution({
      agent: 'architect',
      model: 'opus',
      taskId: 't2',
      inputText: 'design',
      outputText: 'plan',
    });

    const report = tracker.exportReport();

    assert.ok(report.totalCost > 0);
    assert.ok(report.totalTokens > 0);
    assert.equal(report.executionCount, 2);
    assert.ok(report.byAgent.dev);
    assert.ok(report.byAgent.architect);
    assert.ok(report.byModel.sonnet);
    assert.ok(report.byModel.opus);
    assert.ok(report.generatedAt);
  });

  it('should handle unknown model gracefully', () => {
    const tracker = createCostTracker();
    const record = tracker.recordExecution({
      agent: 'dev',
      taskId: 't1',
      inputText: 'hello',
      outputText: 'world',
    });

    assert.equal(record.model, 'unknown');
    assert.ok(record.cost > 0); // Uses unknown rate
  });

  it('should reset tracked data', () => {
    const tracker = createCostTracker();

    tracker.recordExecution({
      agent: 'dev',
      model: 'sonnet',
      taskId: 't1',
      inputText: 'hello',
    });

    assert.ok(tracker.getSessionCost() > 0);

    tracker.reset();

    assert.equal(tracker.getSessionCost(), 0);
    assert.equal(tracker.exportReport().executionCount, 0);
  });

  it('should include provider when provided in recordExecution', () => {
    const tracker = createCostTracker();
    const record = tracker.recordExecution({
      agent: 'dev',
      model: 'pro',
      provider: 'gemini',
      taskId: 't1',
      inputText: 'hello',
      outputText: 'world',
    });

    assert.equal(record.provider, 'gemini');
  });

  it('should default provider to unknown when not provided', () => {
    const tracker = createCostTracker();
    const record = tracker.recordExecution({
      agent: 'dev',
      model: 'sonnet',
      taskId: 't1',
      inputText: 'hello',
    });

    assert.equal(record.provider, 'unknown');
  });

  it('should include byProvider breakdown in exportReport', () => {
    const tracker = createCostTracker();

    tracker.recordExecution({
      agent: 'dev',
      model: 'sonnet',
      provider: 'claude',
      taskId: 't1',
      inputText: 'a'.repeat(400),
      outputText: 'b'.repeat(400),
    });

    tracker.recordExecution({
      agent: 'architect',
      model: 'pro',
      provider: 'gemini',
      taskId: 't2',
      inputText: 'c'.repeat(400),
      outputText: 'd'.repeat(400),
    });

    const report = tracker.exportReport();

    assert.ok(report.byProvider, 'Report should have byProvider');
    assert.ok(report.byProvider.claude, 'Should have claude provider');
    assert.ok(report.byProvider.gemini, 'Should have gemini provider');
    assert.equal(report.byProvider.claude.count, 1);
    assert.equal(report.byProvider.gemini.count, 1);
    assert.ok(report.byProvider.claude.cost > 0);
    assert.ok(report.byProvider.gemini.cost > 0);
  });

  it('should have correct fields for run-agent integration', () => {
    const tracker = createCostTracker();
    const record = tracker.recordExecution({
      agent: 'detail',
      model: 'opus',
      provider: 'claude',
      taskId: 'expand-prd',
      inputText: 'Full PRISM context...',
      outputText: 'Agent response with handoff...',
      duration: 15000,
    });

    // All fields needed by run-agent.js costEstimate
    assert.equal(typeof record.inputTokens, 'number');
    assert.equal(typeof record.outputTokens, 'number');
    assert.equal(typeof record.cost, 'number');
    assert.equal(typeof record.model, 'string');
    assert.equal(typeof record.provider, 'string');
    assert.equal(record.agent, 'detail');
    assert.equal(record.provider, 'claude');
    assert.equal(record.model, 'opus');
  });
});
