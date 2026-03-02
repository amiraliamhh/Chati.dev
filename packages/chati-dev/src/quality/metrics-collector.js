/**
 * @fileoverview Quality metrics collector and trend analysis.
 *
 * Persists quality metrics over time and calculates trends
 * (improving, stable, declining) via linear regression.
 *
 * Constitution Article XIV — Framework Registry Governance.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Metrics storage filename. */
const METRICS_FILE = 'quality-history.json';

/** Metrics directory relative to project root. */
const METRICS_DIR = '.chati/metrics';

/** Maximum metrics entries to keep per project. */
export const MAX_METRICS_ENTRIES = 500;

/** Valid metric types. */
export const METRIC_TYPES = {
  QA_SCORE: 'qa_score',
  HEALTH_SCORE: 'health_score',
  TEST_COUNT: 'test_count',
  COVERAGE: 'coverage',
  LINT_ERRORS: 'lint_errors',
  BUILD_TIME: 'build_time',
};

/** Trend direction values. */
export const TREND_DIRECTION = {
  IMPROVING: 'improving',
  STABLE: 'stable',
  DECLINING: 'declining',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get the metrics file path for a project.
 *
 * @param {string} projectDir
 * @returns {string}
 */
function getMetricsPath(projectDir) {
  return join(projectDir, METRICS_DIR, METRICS_FILE);
}

/**
 * Load metrics from disk.
 *
 * @param {string} projectDir
 * @returns {{ metrics: object[] }}
 */
function loadMetrics(projectDir) {
  const filePath = getMetricsPath(projectDir);
  if (!existsSync(filePath)) {
    return { metrics: [] };
  }

  try {
    const raw = readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    return { metrics: Array.isArray(data.metrics) ? data.metrics : [] };
  } catch {
    return { metrics: [] };
  }
}

/**
 * Save metrics to disk.
 *
 * @param {string} projectDir
 * @param {{ metrics: object[] }} data
 */
function saveMetrics(projectDir, data) {
  const filePath = getMetricsPath(projectDir);
  const dir = dirname(filePath);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Trim to MAX_METRICS_ENTRIES
  if (data.metrics.length > MAX_METRICS_ENTRIES) {
    data.metrics = data.metrics.slice(-MAX_METRICS_ENTRIES);
  }

  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * @typedef {object} MetricEntry
 * @property {string} type - Metric type (from METRIC_TYPES)
 * @property {number} value - Metric value
 * @property {string} [agent] - Agent that produced the metric
 * @property {string} [sessionId] - Session identifier
 * @property {string} timestamp - ISO timestamp
 */

/**
 * Record a quality metric.
 *
 * @param {string} projectDir
 * @param {{ type: string, value: number, agent?: string, sessionId?: string }} metric
 * @returns {{ recorded: boolean, total: number }}
 */
export function recordMetric(projectDir, metric) {
  if (!metric || typeof metric.value !== 'number') {
    return { recorded: false, total: 0 };
  }

  const validTypes = Object.values(METRIC_TYPES);
  if (!validTypes.includes(metric.type)) {
    return { recorded: false, total: 0 };
  }

  const data = loadMetrics(projectDir);

  data.metrics.push({
    type: metric.type,
    value: metric.value,
    agent: metric.agent || null,
    sessionId: metric.sessionId || null,
    timestamp: new Date().toISOString(),
  });

  saveMetrics(projectDir, data);

  return { recorded: true, total: data.metrics.length };
}

/**
 * Get metrics history with optional filtering.
 *
 * @param {string} projectDir
 * @param {{ type?: string, agent?: string, limit?: number, since?: string }} [options={}]
 * @returns {{ metrics: MetricEntry[], trend: { direction: string, slope: number, confidence: number } }}
 */
export function getMetricsHistory(projectDir, options = {}) {
  const data = loadMetrics(projectDir);
  let metrics = data.metrics;

  // Filter by type
  if (options.type) {
    metrics = metrics.filter(m => m.type === options.type);
  }

  // Filter by agent
  if (options.agent) {
    metrics = metrics.filter(m => m.agent === options.agent);
  }

  // Filter by time
  if (options.since) {
    const sinceDate = new Date(options.since).getTime();
    metrics = metrics.filter(m => new Date(m.timestamp).getTime() >= sinceDate);
  }

  // Apply limit
  if (options.limit && options.limit > 0) {
    metrics = metrics.slice(-options.limit);
  }

  // Calculate trend
  const trend = calculateTrend(metrics);

  return { metrics, trend };
}

/**
 * Calculate trend from a series of metrics using linear regression.
 *
 * @param {MetricEntry[]} metrics
 * @returns {{ direction: string, slope: number, confidence: number }}
 */
export function calculateTrend(metrics) {
  if (!metrics || metrics.length < 3) {
    return { direction: TREND_DIRECTION.STABLE, slope: 0, confidence: 0 };
  }

  const values = metrics.map(m => m.value);
  const n = values.length;

  // Simple linear regression: y = mx + b
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  let sumY2 = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
    sumY2 += values[i] * values[i];
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

  // Calculate R² (coefficient of determination)
  const meanY = sumY / n;
  let ssRes = 0;
  let ssTot = 0;

  for (let i = 0; i < n; i++) {
    const predicted = meanY + slope * (i - (n - 1) / 2);
    ssRes += (values[i] - predicted) ** 2;
    ssTot += (values[i] - meanY) ** 2;
  }

  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  const confidence = Math.max(0, Math.min(1, Math.abs(r2)));

  // Determine direction
  // Normalize slope by mean to get relative change
  const normalizedSlope = meanY !== 0 ? slope / Math.abs(meanY) : slope;
  const threshold = 0.02; // 2% change per step is significant

  let direction;
  if (normalizedSlope > threshold && confidence > 0.3) {
    direction = TREND_DIRECTION.IMPROVING;
  } else if (normalizedSlope < -threshold && confidence > 0.3) {
    direction = TREND_DIRECTION.DECLINING;
  } else {
    direction = TREND_DIRECTION.STABLE;
  }

  return {
    direction,
    slope: Math.round(slope * 1000) / 1000,
    confidence: Math.round(confidence * 100) / 100,
  };
}

/**
 * Get a quality dashboard summary.
 *
 * @param {string} projectDir
 * @returns {{ latestScores: Record<string, number>, trends: Record<string, object>, totalMetrics: number, lastUpdated: string|null }}
 */
export function getQualityDashboard(projectDir) {
  const data = loadMetrics(projectDir);
  const metrics = data.metrics;

  if (metrics.length === 0) {
    return { latestScores: {}, trends: {}, totalMetrics: 0, lastUpdated: null };
  }

  // Get latest value for each metric type
  const latestScores = {};
  const trends = {};

  for (const type of Object.values(METRIC_TYPES)) {
    const typeMetrics = metrics.filter(m => m.type === type);
    if (typeMetrics.length > 0) {
      latestScores[type] = typeMetrics[typeMetrics.length - 1].value;
      trends[type] = calculateTrend(typeMetrics);
    }
  }

  const lastUpdated = metrics[metrics.length - 1]?.timestamp || null;

  return {
    latestScores,
    trends,
    totalMetrics: metrics.length,
    lastUpdated,
  };
}
