/**
 * @fileoverview Token cost tracking for terminal spawner.
 *
 * Estimates token usage and cost per agent execution,
 * providing session-level and per-agent cost visibility.
 *
 * Constitution Article XVI — Model Governance.
 */

// ---------------------------------------------------------------------------
// Cost Tables
// ---------------------------------------------------------------------------

/**
 * Estimated cost per 1K tokens (input + output average) in USD.
 * These are approximations for cost awareness — not billing.
 */
export const COST_PER_1K = {
  // Claude models
  opus: 0.075,
  sonnet: 0.015,
  haiku: 0.005,
  // Gemini models
  pro: 0.007,
  flash: 0.001,
  // Codex/Copilot
  codex: 0.010,
  copilot: 0.010,
  mini: 0.003,
  // Fallback
  unknown: 0.015,
};

// ---------------------------------------------------------------------------
// Token Estimation
// ---------------------------------------------------------------------------

/**
 * Estimate token count from text using a simple heuristic.
 * Approximation: ~4 characters per token for English text.
 *
 * @param {string} text
 * @returns {number} Estimated token count
 */
export function estimateTokens(text) {
  if (!text || typeof text !== 'string') return 0;
  return Math.ceil(text.length / 4);
}

// ---------------------------------------------------------------------------
// Cost Tracker
// ---------------------------------------------------------------------------

/**
 * @typedef {object} ExecutionRecord
 * @property {string} agent - Agent name
 * @property {string} model - Model tier used
 * @property {string} taskId - Task identifier
 * @property {number} inputTokens - Estimated input tokens
 * @property {number} outputTokens - Estimated output tokens
 * @property {number} cost - Estimated cost in USD
 * @property {number} duration - Execution time in ms
 * @property {string} timestamp - ISO timestamp
 */

/**
 * @typedef {object} CostReport
 * @property {number} totalCost - Total estimated cost
 * @property {number} totalTokens - Total estimated tokens
 * @property {number} executionCount - Number of executions
 * @property {Record<string, { cost: number, tokens: number, count: number }>} byAgent - Per-agent breakdown
 * @property {Record<string, { cost: number, tokens: number, count: number }>} byModel - Per-model breakdown
 * @property {string} generatedAt - ISO timestamp
 */

/**
 * Create a cost tracker instance.
 *
 * @returns {{ recordExecution: Function, getSessionCost: Function, getAgentCost: Function, exportReport: Function, reset: Function }}
 */
export function createCostTracker() {
  /** @type {ExecutionRecord[]} */
  let records = [];

  /**
   * Record a completed execution.
   *
   * @param {{ agent: string, model?: string, taskId: string, inputText?: string, outputText?: string, duration?: number }} execution
   * @returns {ExecutionRecord}
   */
  function recordExecution(execution) {
    const model = execution.model || 'unknown';
    const inputTokens = estimateTokens(execution.inputText);
    const outputTokens = estimateTokens(execution.outputText);
    const totalTokens = inputTokens + outputTokens;
    const costRate = COST_PER_1K[model] || COST_PER_1K.unknown;
    const cost = (totalTokens / 1000) * costRate;

    const record = {
      agent: execution.agent,
      model,
      provider: execution.provider || 'unknown',
      taskId: execution.taskId,
      inputTokens,
      outputTokens,
      cost: Math.round(cost * 1_000_000) / 1_000_000, // 6 decimal places
      duration: execution.duration || 0,
      timestamp: new Date().toISOString(),
    };

    records.push(record);
    return record;
  }

  /**
   * Get total session cost.
   *
   * @returns {number} Total cost in USD
   */
  function getSessionCost() {
    return records.reduce((sum, r) => sum + r.cost, 0);
  }

  /**
   * Get cost for a specific agent.
   *
   * @param {string} agent
   * @returns {{ cost: number, tokens: number, count: number }}
   */
  function getAgentCost(agent) {
    const agentRecords = records.filter(r => r.agent === agent);
    return {
      cost: agentRecords.reduce((sum, r) => sum + r.cost, 0),
      tokens: agentRecords.reduce((sum, r) => sum + r.inputTokens + r.outputTokens, 0),
      count: agentRecords.length,
    };
  }

  /**
   * Export a full cost report.
   *
   * @returns {CostReport}
   */
  function exportReport() {
    const byAgent = {};
    const byModel = {};
    const byProvider = {};

    for (const record of records) {
      const totalTokens = record.inputTokens + record.outputTokens;

      // Aggregate by agent
      if (!byAgent[record.agent]) {
        byAgent[record.agent] = { cost: 0, tokens: 0, count: 0 };
      }
      byAgent[record.agent].cost += record.cost;
      byAgent[record.agent].tokens += totalTokens;
      byAgent[record.agent].count += 1;

      // Aggregate by model
      if (!byModel[record.model]) {
        byModel[record.model] = { cost: 0, tokens: 0, count: 0 };
      }
      byModel[record.model].cost += record.cost;
      byModel[record.model].tokens += totalTokens;
      byModel[record.model].count += 1;

      // Aggregate by provider
      const prov = record.provider || 'unknown';
      if (!byProvider[prov]) {
        byProvider[prov] = { cost: 0, tokens: 0, count: 0 };
      }
      byProvider[prov].cost += record.cost;
      byProvider[prov].tokens += totalTokens;
      byProvider[prov].count += 1;
    }

    return {
      totalCost: getSessionCost(),
      totalTokens: records.reduce((sum, r) => sum + r.inputTokens + r.outputTokens, 0),
      executionCount: records.length,
      byAgent,
      byModel,
      byProvider,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Reset all tracked records.
   */
  function reset() {
    records = [];
  }

  return { recordExecution, getSessionCost, getAgentCost, exportReport, reset };
}
