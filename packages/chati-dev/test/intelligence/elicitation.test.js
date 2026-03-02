import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  TECHNIQUES,
  selectTechniques,
  buildElicitationPrompt,
  getTechnique,
} from '../../src/intelligence/elicitation.js';

// ---------------------------------------------------------------------------
// TECHNIQUES constant
// ---------------------------------------------------------------------------

describe('TECHNIQUES', () => {
  it('should have 15 techniques', () => {
    assert.equal(TECHNIQUES.length, 15);
  });

  it('should have unique IDs', () => {
    const ids = TECHNIQUES.map(t => t.id);
    assert.equal(new Set(ids).size, 15);
  });

  it('should have required fields on every technique', () => {
    for (const t of TECHNIQUES) {
      assert.ok(t.id, `Missing id on technique`);
      assert.ok(t.name, `Missing name on ${t.id}`);
      assert.ok(t.description, `Missing description on ${t.id}`);
      assert.ok(t.template, `Missing template on ${t.id}`);
      assert.ok(Array.isArray(t.bestFor), `bestFor should be array on ${t.id}`);
      assert.ok(t.bestFor.length >= 2, `bestFor should have 2+ entries on ${t.id}`);
    }
  });

  it('should include expected technique IDs', () => {
    const ids = TECHNIQUES.map(t => t.id);
    const expected = [
      'open-ended', 'closed', 'scaling', 'five-whys', 'scenario',
      'constraint', 'analogy', 'day-in-life', 'persona', 'exception',
      'moscow', 'prototype', 'acceptance', 'edge-case', 'stakeholder-map',
    ];
    for (const e of expected) {
      assert.ok(ids.includes(e), `Missing technique: ${e}`);
    }
  });
});

// ---------------------------------------------------------------------------
// selectTechniques
// ---------------------------------------------------------------------------

describe('selectTechniques', () => {
  it('should return topN techniques (default 3)', () => {
    const result = selectTechniques({});
    assert.equal(result.length, 3);
  });

  it('should return custom topN', () => {
    const result = selectTechniques({}, 5);
    assert.equal(result.length, 5);
  });

  it('should favor discovery techniques in discover phase', () => {
    const result = selectTechniques({ phase: 'discover' }, 5);
    const ids = result.map(t => t.id);
    // At least one discovery-oriented technique should be in top 5
    const discoveryTechniques = ['open-ended', 'analogy', 'persona', 'stakeholder-map'];
    const hasDiscovery = ids.some(id => discoveryTechniques.includes(id));
    assert.ok(hasDiscovery, `Expected discovery techniques, got: ${ids.join(', ')}`);
  });

  it('should favor planning techniques in plan phase', () => {
    const result = selectTechniques({ phase: 'plan' }, 5);
    const ids = result.map(t => t.id);
    const planTechniques = ['constraint', 'moscow', 'scaling'];
    const hasPlan = ids.some(id => planTechniques.includes(id));
    assert.ok(hasPlan, `Expected planning techniques, got: ${ids.join(', ')}`);
  });

  it('should favor build techniques in build phase', () => {
    const result = selectTechniques({ phase: 'build' }, 5);
    const ids = result.map(t => t.id);
    const buildTechniques = ['acceptance', 'edge-case', 'exception'];
    const hasBuild = ids.some(id => buildTechniques.includes(id));
    assert.ok(hasBuild, `Expected build techniques, got: ${ids.join(', ')}`);
  });

  it('should boost greenfield project type', () => {
    const result = selectTechniques({ projectType: 'greenfield' }, 5);
    const ids = result.map(t => t.id);
    assert.ok(ids.includes('open-ended') || ids.includes('analogy'),
      `Expected greenfield techniques, got: ${ids.join(', ')}`);
  });

  it('should boost keyword-matched techniques', () => {
    const result = selectTechniques({ keywords: ['edge-cases'] }, 3);
    const ids = result.map(t => t.id);
    assert.ok(ids.includes('edge-case') || ids.includes('exception'),
      `Expected edge-case techniques, got: ${ids.join(', ')}`);
  });

  it('should adjust for beginner user level', () => {
    const beginner = selectTechniques({ userLevel: 'beginner' }, 5);
    const expert = selectTechniques({ userLevel: 'expert' }, 5);
    // Both should return valid results
    assert.equal(beginner.length, 5);
    assert.equal(expert.length, 5);
  });
});

// ---------------------------------------------------------------------------
// buildElicitationPrompt
// ---------------------------------------------------------------------------

describe('buildElicitationPrompt', () => {
  it('should replace {project} placeholder', () => {
    const technique = getTechnique('open-ended');
    const prompt = buildElicitationPrompt(technique, { project: 'MyApp' });
    assert.ok(prompt.includes('MyApp'), `Expected MyApp in prompt: ${prompt}`);
    assert.ok(!prompt.includes('{project}'), 'Placeholder should be replaced');
  });

  it('should use default values when no context provided', () => {
    const technique = getTechnique('open-ended');
    const prompt = buildElicitationPrompt(technique);
    assert.ok(prompt.includes('the project'), `Expected default project name: ${prompt}`);
  });

  it('should replace multiple placeholders', () => {
    const technique = getTechnique('closed');
    const prompt = buildElicitationPrompt(technique, {
      feature: 'login',
      option_a: 'OAuth',
      option_b: 'JWT',
    });
    assert.ok(prompt.includes('login'));
    assert.ok(prompt.includes('OAuth'));
    assert.ok(prompt.includes('JWT'));
  });

  it('should handle scenario technique with action placeholder', () => {
    const technique = getTechnique('scenario');
    const prompt = buildElicitationPrompt(technique, { action: 'checkout' });
    assert.ok(prompt.includes('checkout'));
  });
});

// ---------------------------------------------------------------------------
// getTechnique
// ---------------------------------------------------------------------------

describe('getTechnique', () => {
  it('should find technique by ID', () => {
    const t = getTechnique('five-whys');
    assert.ok(t);
    assert.equal(t.id, 'five-whys');
    assert.equal(t.name, 'Five Whys');
  });

  it('should return null for unknown ID', () => {
    assert.equal(getTechnique('nonexistent'), null);
  });

  it('should return null for null/undefined', () => {
    assert.equal(getTechnique(null), null);
    assert.equal(getTechnique(undefined), null);
  });
});
