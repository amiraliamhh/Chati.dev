import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  METRIC_TYPES,
  TREND_DIRECTION,
  MAX_METRICS_ENTRIES,
  recordMetric,
  getMetricsHistory,
  calculateTrend,
  getQualityDashboard,
} from '../../src/quality/metrics-collector.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const TEST_DIR = join('/tmp', `chati-metrics-test-${Date.now()}`);

function setup() {
  mkdirSync(TEST_DIR, { recursive: true });
}

function teardown() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('metrics-collector constants', () => {
  it('should export METRIC_TYPES with expected values', () => {
    assert.equal(METRIC_TYPES.QA_SCORE, 'qa_score');
    assert.equal(METRIC_TYPES.HEALTH_SCORE, 'health_score');
    assert.equal(METRIC_TYPES.TEST_COUNT, 'test_count');
    assert.equal(METRIC_TYPES.COVERAGE, 'coverage');
    assert.equal(METRIC_TYPES.LINT_ERRORS, 'lint_errors');
    assert.equal(METRIC_TYPES.BUILD_TIME, 'build_time');
  });

  it('should export TREND_DIRECTION with 3 values', () => {
    assert.equal(TREND_DIRECTION.IMPROVING, 'improving');
    assert.equal(TREND_DIRECTION.STABLE, 'stable');
    assert.equal(TREND_DIRECTION.DECLINING, 'declining');
  });

  it('should export MAX_METRICS_ENTRIES as 500', () => {
    assert.equal(MAX_METRICS_ENTRIES, 500);
  });
});

// ---------------------------------------------------------------------------
// recordMetric
// ---------------------------------------------------------------------------

describe('recordMetric', () => {
  beforeEach(() => setup());
  afterEach(() => teardown());

  it('should record a valid metric', () => {
    const result = recordMetric(TEST_DIR, { type: METRIC_TYPES.QA_SCORE, value: 95 });
    assert.equal(result.recorded, true);
    assert.equal(result.total, 1);
  });

  it('should accumulate multiple metrics', () => {
    recordMetric(TEST_DIR, { type: METRIC_TYPES.QA_SCORE, value: 90 });
    recordMetric(TEST_DIR, { type: METRIC_TYPES.QA_SCORE, value: 92 });
    const result = recordMetric(TEST_DIR, { type: METRIC_TYPES.QA_SCORE, value: 95 });
    assert.equal(result.total, 3);
  });

  it('should reject invalid metric type', () => {
    const result = recordMetric(TEST_DIR, { type: 'invalid_type', value: 50 });
    assert.equal(result.recorded, false);
  });

  it('should reject null/undefined metric', () => {
    assert.equal(recordMetric(TEST_DIR, null).recorded, false);
    assert.equal(recordMetric(TEST_DIR, undefined).recorded, false);
  });

  it('should reject metric without numeric value', () => {
    const result = recordMetric(TEST_DIR, { type: METRIC_TYPES.QA_SCORE, value: 'not-a-number' });
    assert.equal(result.recorded, false);
  });

  it('should store agent and sessionId', () => {
    recordMetric(TEST_DIR, {
      type: METRIC_TYPES.QA_SCORE,
      value: 95,
      agent: 'qa-implementation',
      sessionId: 'sess-123',
    });

    const history = getMetricsHistory(TEST_DIR);
    assert.equal(history.metrics[0].agent, 'qa-implementation');
    assert.equal(history.metrics[0].sessionId, 'sess-123');
  });

  it('should create metrics directory if it does not exist', () => {
    const metricsDir = join(TEST_DIR, '.chati', 'metrics');
    assert.equal(existsSync(metricsDir), false);

    recordMetric(TEST_DIR, { type: METRIC_TYPES.QA_SCORE, value: 95 });
    assert.equal(existsSync(metricsDir), true);
  });
});

// ---------------------------------------------------------------------------
// getMetricsHistory
// ---------------------------------------------------------------------------

describe('getMetricsHistory', () => {
  beforeEach(() => setup());
  afterEach(() => teardown());

  it('should return empty for non-existent project', () => {
    const result = getMetricsHistory(TEST_DIR);
    assert.equal(result.metrics.length, 0);
  });

  it('should filter by type', () => {
    recordMetric(TEST_DIR, { type: METRIC_TYPES.QA_SCORE, value: 90 });
    recordMetric(TEST_DIR, { type: METRIC_TYPES.TEST_COUNT, value: 100 });
    recordMetric(TEST_DIR, { type: METRIC_TYPES.QA_SCORE, value: 95 });

    const result = getMetricsHistory(TEST_DIR, { type: METRIC_TYPES.QA_SCORE });
    assert.equal(result.metrics.length, 2);
  });

  it('should filter by agent', () => {
    recordMetric(TEST_DIR, { type: METRIC_TYPES.QA_SCORE, value: 90, agent: 'qa-planning' });
    recordMetric(TEST_DIR, { type: METRIC_TYPES.QA_SCORE, value: 95, agent: 'qa-implementation' });

    const result = getMetricsHistory(TEST_DIR, { agent: 'qa-planning' });
    assert.equal(result.metrics.length, 1);
    assert.equal(result.metrics[0].value, 90);
  });

  it('should apply limit', () => {
    for (let i = 0; i < 10; i++) {
      recordMetric(TEST_DIR, { type: METRIC_TYPES.QA_SCORE, value: 80 + i });
    }

    const result = getMetricsHistory(TEST_DIR, { limit: 3 });
    assert.equal(result.metrics.length, 3);
    // Should be the last 3
    assert.equal(result.metrics[0].value, 87);
  });

  it('should include trend calculation', () => {
    for (let i = 0; i < 5; i++) {
      recordMetric(TEST_DIR, { type: METRIC_TYPES.QA_SCORE, value: 80 + i * 3 });
    }

    const result = getMetricsHistory(TEST_DIR);
    assert.ok(result.trend);
    assert.ok(result.trend.direction);
    assert.ok(typeof result.trend.slope === 'number');
  });
});

// ---------------------------------------------------------------------------
// calculateTrend
// ---------------------------------------------------------------------------

describe('calculateTrend', () => {
  it('should return stable for null/empty/short arrays', () => {
    assert.equal(calculateTrend(null).direction, TREND_DIRECTION.STABLE);
    assert.equal(calculateTrend([]).direction, TREND_DIRECTION.STABLE);
    assert.equal(calculateTrend([{ value: 1 }]).direction, TREND_DIRECTION.STABLE);
    assert.equal(calculateTrend([{ value: 1 }, { value: 2 }]).direction, TREND_DIRECTION.STABLE);
  });

  it('should detect improving trend', () => {
    const metrics = [
      { value: 70 }, { value: 75 }, { value: 80 }, { value: 85 }, { value: 90 },
    ];
    const result = calculateTrend(metrics);
    assert.equal(result.direction, TREND_DIRECTION.IMPROVING);
    assert.ok(result.slope > 0);
  });

  it('should detect declining trend', () => {
    const metrics = [
      { value: 95 }, { value: 90 }, { value: 85 }, { value: 80 }, { value: 75 },
    ];
    const result = calculateTrend(metrics);
    assert.equal(result.direction, TREND_DIRECTION.DECLINING);
    assert.ok(result.slope < 0);
  });

  it('should detect stable trend', () => {
    const metrics = [
      { value: 90 }, { value: 90 }, { value: 91 }, { value: 90 }, { value: 90 },
    ];
    const result = calculateTrend(metrics);
    assert.equal(result.direction, TREND_DIRECTION.STABLE);
  });

  it('should return confidence between 0 and 1', () => {
    const metrics = [
      { value: 70 }, { value: 80 }, { value: 90 }, { value: 100 },
    ];
    const result = calculateTrend(metrics);
    assert.ok(result.confidence >= 0);
    assert.ok(result.confidence <= 1);
  });
});

// ---------------------------------------------------------------------------
// getQualityDashboard
// ---------------------------------------------------------------------------

describe('getQualityDashboard', () => {
  beforeEach(() => setup());
  afterEach(() => teardown());

  it('should return empty dashboard for no metrics', () => {
    const dashboard = getQualityDashboard(TEST_DIR);
    assert.deepEqual(dashboard.latestScores, {});
    assert.equal(dashboard.totalMetrics, 0);
    assert.equal(dashboard.lastUpdated, null);
  });

  it('should aggregate metrics by type', () => {
    recordMetric(TEST_DIR, { type: METRIC_TYPES.QA_SCORE, value: 90 });
    recordMetric(TEST_DIR, { type: METRIC_TYPES.QA_SCORE, value: 95 });
    recordMetric(TEST_DIR, { type: METRIC_TYPES.TEST_COUNT, value: 150 });

    const dashboard = getQualityDashboard(TEST_DIR);
    assert.equal(dashboard.latestScores[METRIC_TYPES.QA_SCORE], 95);
    assert.equal(dashboard.latestScores[METRIC_TYPES.TEST_COUNT], 150);
    assert.equal(dashboard.totalMetrics, 3);
    assert.ok(dashboard.lastUpdated);
  });

  it('should include trends per type', () => {
    for (let i = 0; i < 5; i++) {
      recordMetric(TEST_DIR, { type: METRIC_TYPES.QA_SCORE, value: 80 + i * 3 });
    }

    const dashboard = getQualityDashboard(TEST_DIR);
    assert.ok(dashboard.trends[METRIC_TYPES.QA_SCORE]);
    assert.ok(dashboard.trends[METRIC_TYPES.QA_SCORE].direction);
  });
});
