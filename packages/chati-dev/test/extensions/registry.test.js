/**
 * Tests for extension point registry.
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  EXTENSION_POINTS,
  registerExtension,
  getExtensions,
  executeExtensions,
  clearExtensions,
  getExtensionStats,
} from '../../src/extensions/registry.js';

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

afterEach(() => {
  clearExtensions();
});

// ---------------------------------------------------------------------------
// EXTENSION_POINTS
// ---------------------------------------------------------------------------

describe('EXTENSION_POINTS', () => {
  it('should have 6 extension points', () => {
    assert.equal(Object.keys(EXTENSION_POINTS).length, 6);
  });

  it('should contain all expected points', () => {
    assert.equal(EXTENSION_POINTS.PRE_AGENT, 'pre_agent');
    assert.equal(EXTENSION_POINTS.POST_AGENT, 'post_agent');
    assert.equal(EXTENSION_POINTS.PRE_BUILD, 'pre_build');
    assert.equal(EXTENSION_POINTS.POST_BUILD, 'post_build');
    assert.equal(EXTENSION_POINTS.HEALTH_CHECK, 'health_check');
    assert.equal(EXTENSION_POINTS.CUSTOM_GATE, 'custom_gate');
  });
});

// ---------------------------------------------------------------------------
// registerExtension
// ---------------------------------------------------------------------------

describe('registerExtension', () => {
  it('should register a valid handler', () => {
    const result = registerExtension(EXTENSION_POINTS.PRE_AGENT, () => 'ok');
    assert.equal(result.registered, true);
  });

  it('should reject unknown extension point', () => {
    const result = registerExtension('invalid_point', () => 'ok');
    assert.equal(result.registered, false);
    assert.ok(result.error.includes('Unknown extension point'));
  });

  it('should reject non-function handler', () => {
    const result = registerExtension(EXTENSION_POINTS.PRE_AGENT, 'not-a-fn');
    assert.equal(result.registered, false);
    assert.ok(result.error.includes('Handler must be a function'));
  });

  it('should use handler name when no name option given', () => {
    function myHandler() { return 'ok'; }
    registerExtension(EXTENSION_POINTS.PRE_AGENT, myHandler);
    const exts = getExtensions(EXTENSION_POINTS.PRE_AGENT);
    assert.equal(exts[0].name, 'myHandler');
  });

  it('should use provided name over handler name', () => {
    function myHandler() { return 'ok'; }
    registerExtension(EXTENSION_POINTS.PRE_AGENT, myHandler, { name: 'custom' });
    const exts = getExtensions(EXTENSION_POINTS.PRE_AGENT);
    assert.equal(exts[0].name, 'custom');
  });

  it('should sort by priority (higher first)', () => {
    registerExtension(EXTENSION_POINTS.PRE_BUILD, () => 'low', { name: 'low', priority: 1 });
    registerExtension(EXTENSION_POINTS.PRE_BUILD, () => 'high', { name: 'high', priority: 10 });
    registerExtension(EXTENSION_POINTS.PRE_BUILD, () => 'mid', { name: 'mid', priority: 5 });

    const exts = getExtensions(EXTENSION_POINTS.PRE_BUILD);
    assert.equal(exts[0].name, 'high');
    assert.equal(exts[1].name, 'mid');
    assert.equal(exts[2].name, 'low');
  });
});

// ---------------------------------------------------------------------------
// getExtensions
// ---------------------------------------------------------------------------

describe('getExtensions', () => {
  it('should return empty array for point with no extensions', () => {
    const exts = getExtensions(EXTENSION_POINTS.CUSTOM_GATE);
    assert.ok(Array.isArray(exts));
    assert.equal(exts.length, 0);
  });

  it('should return empty array for unknown point', () => {
    const exts = getExtensions('nonexistent');
    assert.ok(Array.isArray(exts));
    assert.equal(exts.length, 0);
  });

  it('should return registered extensions', () => {
    registerExtension(EXTENSION_POINTS.POST_AGENT, () => 'a', { name: 'ext-a' });
    registerExtension(EXTENSION_POINTS.POST_AGENT, () => 'b', { name: 'ext-b' });

    const exts = getExtensions(EXTENSION_POINTS.POST_AGENT);
    assert.equal(exts.length, 2);
  });
});

// ---------------------------------------------------------------------------
// executeExtensions
// ---------------------------------------------------------------------------

describe('executeExtensions', () => {
  it('should execute all handlers in order', async () => {
    const order = [];
    registerExtension(EXTENSION_POINTS.POST_BUILD, () => { order.push('a'); return 'a'; }, { name: 'a', priority: 10 });
    registerExtension(EXTENSION_POINTS.POST_BUILD, () => { order.push('b'); return 'b'; }, { name: 'b', priority: 1 });

    const result = await executeExtensions(EXTENSION_POINTS.POST_BUILD, {});
    assert.equal(result.executed, 2);
    assert.deepEqual(order, ['a', 'b']); // higher priority first
    assert.equal(result.results[0].name, 'a');
    assert.equal(result.results[0].result, 'a');
  });

  it('should capture handler errors without stopping execution', async () => {
    registerExtension(EXTENSION_POINTS.HEALTH_CHECK, () => { throw new Error('boom'); }, { name: 'failing' });
    registerExtension(EXTENSION_POINTS.HEALTH_CHECK, () => 'ok', { name: 'passing' });

    const result = await executeExtensions(EXTENSION_POINTS.HEALTH_CHECK, {});
    assert.equal(result.executed, 2);
    assert.equal(result.results[0].error, 'boom');
    assert.equal(result.results[0].result, null);
    assert.equal(result.results[1].result, 'ok');
  });

  it('should pass context to handlers', async () => {
    let receivedCtx;
    registerExtension(EXTENSION_POINTS.PRE_AGENT, (ctx) => { receivedCtx = ctx; }, { name: 'ctx-test' });

    await executeExtensions(EXTENSION_POINTS.PRE_AGENT, { agent: 'brief', phase: 'discover' });
    assert.equal(receivedCtx.agent, 'brief');
    assert.equal(receivedCtx.phase, 'discover');
  });

  it('should handle async handlers', async () => {
    registerExtension(EXTENSION_POINTS.CUSTOM_GATE, async () => {
      return 'async-result';
    }, { name: 'async-ext' });

    const result = await executeExtensions(EXTENSION_POINTS.CUSTOM_GATE, {});
    assert.equal(result.results[0].result, 'async-result');
  });

  it('should return executed=0 for empty point', async () => {
    const result = await executeExtensions(EXTENSION_POINTS.POST_BUILD, {});
    assert.equal(result.executed, 0);
    assert.equal(result.results.length, 0);
  });
});

// ---------------------------------------------------------------------------
// clearExtensions
// ---------------------------------------------------------------------------

describe('clearExtensions', () => {
  it('should clear all extensions when no point specified', () => {
    registerExtension(EXTENSION_POINTS.PRE_AGENT, () => 'a', { name: 'a' });
    registerExtension(EXTENSION_POINTS.POST_AGENT, () => 'b', { name: 'b' });

    clearExtensions();

    assert.equal(getExtensions(EXTENSION_POINTS.PRE_AGENT).length, 0);
    assert.equal(getExtensions(EXTENSION_POINTS.POST_AGENT).length, 0);
  });

  it('should clear only specified point', () => {
    registerExtension(EXTENSION_POINTS.PRE_AGENT, () => 'a', { name: 'a' });
    registerExtension(EXTENSION_POINTS.POST_AGENT, () => 'b', { name: 'b' });

    clearExtensions(EXTENSION_POINTS.PRE_AGENT);

    assert.equal(getExtensions(EXTENSION_POINTS.PRE_AGENT).length, 0);
    assert.equal(getExtensions(EXTENSION_POINTS.POST_AGENT).length, 1);
  });
});

// ---------------------------------------------------------------------------
// getExtensionStats
// ---------------------------------------------------------------------------

describe('getExtensionStats', () => {
  it('should return zero totals when empty', () => {
    const stats = getExtensionStats();
    assert.equal(stats.total, 0);
    assert.equal(Object.keys(stats.byPoint).length, 6);
  });

  it('should count registered extensions', () => {
    registerExtension(EXTENSION_POINTS.PRE_AGENT, () => 'a', { name: 'a' });
    registerExtension(EXTENSION_POINTS.PRE_AGENT, () => 'b', { name: 'b' });
    registerExtension(EXTENSION_POINTS.POST_BUILD, () => 'c', { name: 'c' });

    const stats = getExtensionStats();
    assert.equal(stats.total, 3);
    assert.equal(stats.byPoint[EXTENSION_POINTS.PRE_AGENT], 2);
    assert.equal(stats.byPoint[EXTENSION_POINTS.POST_BUILD], 1);
    assert.equal(stats.byPoint[EXTENSION_POINTS.CUSTOM_GATE], 0);
  });
});
