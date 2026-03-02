/**
 * @fileoverview Tests for telemetry module.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import yaml from 'js-yaml';

import {
  TELEMETRY_EVENTS,
  validateEvent,
} from '../../src/telemetry/schema.js';

import {
  getTelemetryConfig,
  isEnabled,
  setEnabled,
  getAnonymousId,
} from '../../src/telemetry/config.js';

import {
  initCollector,
  track,
  flush,
  getBufferSize,
  getStatus,
} from '../../src/telemetry/collector.js';

import { sendEvents } from '../../src/telemetry/sender.js';

// ---------------------------------------------------------------------------
// Schema Tests
// ---------------------------------------------------------------------------

describe('telemetry schema', () => {
  it('TELEMETRY_EVENTS contains exactly 6 event types', () => {
    assert.equal(TELEMETRY_EVENTS.length, 6);
  });

  it('TELEMETRY_EVENTS includes all planned types', () => {
    const expected = [
      'installation_completed',
      'agent_completed',
      'gate_evaluated',
      'pipeline_completed',
      'circuit_breaker_triggered',
      'error_occurred',
    ];
    assert.deepEqual(TELEMETRY_EVENTS, expected);
  });

  it('validateEvent accepts valid event', () => {
    const result = validateEvent({
      type: 'agent_completed',
      properties: { agent: 'brief', provider: 'claude', duration: 5000 },
    });
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it('validateEvent rejects unknown event type', () => {
    const result = validateEvent({ type: 'unknown_event', properties: {} });
    assert.equal(result.valid, false);
    assert.ok(result.errors[0].includes('Unknown event type'));
  });

  it('validateEvent rejects event without type', () => {
    const result = validateEvent({ properties: {} });
    assert.equal(result.valid, false);
  });

  it('validateEvent rejects non-object input', () => {
    const result = validateEvent(null);
    assert.equal(result.valid, false);
  });

  it('validateEvent detects PII field names', () => {
    const result = validateEvent({
      type: 'agent_completed',
      properties: { agent: 'brief', filePath: '/home/user/project' },
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('PII field')));
  });

  it('validateEvent detects PII in values (filesystem path)', () => {
    const result = validateEvent({
      type: 'agent_completed',
      properties: { agent: 'brief', location: '/Users/john/project' },
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('filesystem path')));
  });

  it('event properties do not contain PII in normal usage', () => {
    const normalEvent = {
      type: 'pipeline_completed',
      properties: {
        pipelineType: 'standard',
        totalDuration: 120000,
        agentsRun: 8,
        finalStatus: 'completed',
        totalCost: 0.45,
      },
    };
    const result = validateEvent(normalEvent);
    assert.equal(result.valid, true);
  });
});

// ---------------------------------------------------------------------------
// Config Tests
// ---------------------------------------------------------------------------

describe('telemetry config', () => {
  let dir;

  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'chati-telemetry-'));
    const chatiDir = join(dir, 'chati.dev');
    mkdirSync(chatiDir, { recursive: true });
    writeFileSync(
      join(chatiDir, 'config.yaml'),
      yaml.dump({
        version: '3.2.8',
        telemetry: { enabled: false, anonymous_id: null },
      }),
    );
  });

  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('isEnabled returns false by default', () => {
    assert.equal(isEnabled(dir), false);
  });

  it('setEnabled(true) enables telemetry', () => {
    setEnabled(dir, true);
    assert.equal(isEnabled(dir), true);
  });

  it('setEnabled(true) generates anonymousId', () => {
    setEnabled(dir, true);
    const config = getTelemetryConfig(dir);
    assert.ok(config.anonymousId);
    assert.equal(typeof config.anonymousId, 'string');
    assert.ok(config.anonymousId.length > 10);
  });

  it('setEnabled(false) disables telemetry', () => {
    setEnabled(dir, false);
    assert.equal(isEnabled(dir), false);
  });

  it('getAnonymousId returns existing or generates new', () => {
    const id = getAnonymousId(dir);
    assert.ok(id);
    assert.equal(typeof id, 'string');
    // UUID v4 format
    assert.ok(id.includes('-'));
  });

  it('getTelemetryConfig returns defaults for missing dir', () => {
    const config = getTelemetryConfig('/nonexistent/path');
    assert.equal(config.enabled, false);
    assert.equal(config.anonymousId, null);
  });
});

// ---------------------------------------------------------------------------
// Collector Tests
// ---------------------------------------------------------------------------

describe('telemetry collector', () => {
  it('track() buffers event when enabled', () => {
    initCollector(true);
    track('agent_completed', { agent: 'brief', provider: 'claude' });
    assert.equal(getBufferSize(), 1);
  });

  it('track() does nothing when disabled', () => {
    initCollector(false);
    track('agent_completed', { agent: 'brief' });
    assert.equal(getBufferSize(), 0);
  });

  it('flush() returns events and clears buffer', () => {
    initCollector(true);
    track('agent_completed', { agent: 'brief' });
    track('gate_evaluated', { gate: 'g2', score: 95 });

    const events = flush();
    assert.equal(events.length, 2);
    assert.equal(events[0].type, 'agent_completed');
    assert.equal(events[1].type, 'gate_evaluated');
    assert.ok(events[0].timestamp);

    // Buffer should be empty after flush
    assert.equal(getBufferSize(), 0);
    assert.deepEqual(flush(), []);
  });

  it('flush() returns empty array when disabled', () => {
    initCollector(false);
    track('agent_completed', { agent: 'brief' });
    const events = flush();
    assert.deepEqual(events, []);
  });

  it('track() silently drops invalid events', () => {
    initCollector(true);
    track('invalid_type', { agent: 'brief' });
    assert.equal(getBufferSize(), 0);
  });

  it('getStatus() returns correct state', () => {
    initCollector(true);
    track('agent_completed', { agent: 'brief' });
    const status = getStatus();
    assert.equal(status.enabled, true);
    assert.equal(status.buffered, 1);
  });
});

// ---------------------------------------------------------------------------
// Sender Tests
// ---------------------------------------------------------------------------

describe('telemetry sender', () => {
  it('sendEvents returns false when config is missing', async () => {
    const result = await sendEvents([{ type: 'test' }], null);
    assert.equal(result, false);
  });

  it('sendEvents returns false for empty events', async () => {
    const result = await sendEvents([], { anonymousId: 'test-id', version: '1.0' });
    assert.equal(result, false);
  });

  it('sendEvents returns false when anonymousId is missing', async () => {
    const result = await sendEvents([{ type: 'test' }], { version: '1.0' });
    assert.equal(result, false);
  });
});
