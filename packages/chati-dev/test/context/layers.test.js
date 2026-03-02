import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { processL0 } from '../../src/context/layers/l0-constitution.js';
import { processL1 } from '../../src/context/layers/l1-global.js';
import { processL2 } from '../../src/context/layers/l2-agent.js';
import { processL3 } from '../../src/context/layers/l3-workflow.js';
import { processL4 } from '../../src/context/layers/l4-task.js';
import { loadDomainFile, extractRules } from '../../src/context/domain-loader.js';

describe('Layer Processors', () => {
  let domainsDir;

  before(() => {
    const tempDir = mkdtempSync(join(tmpdir(), 'layers-'));
    domainsDir = join(tempDir, 'domains');
    mkdirSync(join(domainsDir, 'agents'), { recursive: true });
    mkdirSync(join(domainsDir, 'workflows'), { recursive: true });

    writeFileSync(join(domainsDir, 'constitution.yaml'), `
summary: "Test constitution"
articleCount: 16
rules:
  - id: r1
    text: "Rule one"
    priority: critical
`);

    writeFileSync(join(domainsDir, 'global.yaml'), `
rules:
  - id: g1
    text: "Global rule"
    priority: high
modes:
  planning:
    writeScope: "chati.dev/"
    allowedActions: [read]
    blockedActions: [write]
  build:
    writeScope: "*"
    allowedActions: [read, write]
    blockedActions: []
brackets:
  FRESH:
    behavior: "Full"
`);

    writeFileSync(join(domainsDir, 'agents', 'brief.yaml'), `
mission: "Extract reqs"
authority:
  exclusive: [requirement_extraction]
  allowed: [read]
  blocked: [code]
  redirectMessage: "Use dev"
outputs: [brief.yaml]
rules:
  - id: b1
    text: "Brief rule"
    priority: critical
`);

    writeFileSync(join(domainsDir, 'workflows', 'greenfield-fullstack.yaml'), `
steps:
  - wu
  - brief
  - detail
rules:
  - id: wf1
    text: "Workflow rule"
    priority: high
`);
  });

  after(() => {
    rmSync(join(domainsDir, '..'), { recursive: true, force: true });
  });

  describe('L0 Constitution', () => {
    it('loads constitution rules', () => {
      const result = processL0({ domainsDir });
      assert.equal(result.layer, 'L0');
      assert.equal(result.articleCount, 16);
      assert.equal(result.rules.length, 1);
      assert.equal(result.rules[0].id, 'r1');
    });

    it('returns summary when available', () => {
      const result = processL0({ domainsDir });
      assert.ok(result.summary.includes('Test constitution'));
    });

    it('handles missing domain gracefully', () => {
      const result = processL0({ domainsDir: '/nonexistent' });
      assert.equal(result.layer, 'L0');
      assert.equal(result.rules.length, 0);
    });
  });

  describe('L1 Global', () => {
    it('loads global rules and mode constraints', () => {
      const result = processL1({ domainsDir, mode: 'discover', bracket: 'FRESH' });
      assert.equal(result.layer, 'L1');
      assert.equal(result.mode, 'discover');
      assert.equal(result.modeRules.writeScope, 'chati.dev/');
      assert.deepEqual(result.modeRules.blockedActions, ['write']);
    });

    it('returns build mode rules', () => {
      const result = processL1({ domainsDir, mode: 'build', bracket: 'FRESH' });
      assert.equal(result.modeRules.writeScope, '*');
    });

    it('defaults to discover when mode not set', () => {
      const result = processL1({ domainsDir, bracket: 'FRESH' });
      assert.equal(result.mode, 'discover');
    });
  });

  describe('L2 Agent', () => {
    it('loads agent domain for known agent', () => {
      const result = processL2({ domainsDir, agent: 'brief' });
      assert.equal(result.layer, 'L2');
      assert.equal(result.agent, 'brief');
      assert.equal(result.mission, 'Extract reqs');
      assert.deepEqual(result.authority.exclusive, ['requirement_extraction']);
    });

    it('returns empty for unknown agent', () => {
      const result = processL2({ domainsDir, agent: 'nonexistent' });
      assert.equal(result.agent, 'nonexistent');
      assert.equal(result.rules.length, 0);
    });

    it('returns empty when no agent set', () => {
      const result = processL2({ domainsDir });
      assert.equal(result.agent, null);
      assert.equal(result.rules.length, 0);
    });
  });

  describe('L3 Workflow', () => {
    it('loads workflow with pipeline context', () => {
      const result = processL3({
        domainsDir,
        workflow: 'greenfield-fullstack',
        pipelinePosition: 'brief',
      });
      assert.equal(result.layer, 'L3');
      assert.equal(result.workflow, 'greenfield-fullstack');
      assert.equal(result.pipelineContext.currentStep, 'brief');
      assert.equal(result.pipelineContext.previousStep, 'wu');
      assert.equal(result.pipelineContext.nextStep, 'detail');
    });

    it('calculates progress correctly', () => {
      const result = processL3({
        domainsDir,
        workflow: 'greenfield-fullstack',
        pipelinePosition: 'detail',
      });
      assert.equal(result.pipelineContext.progress, 100);
    });

    it('returns empty when no workflow set', () => {
      const result = processL3({ domainsDir });
      assert.equal(result.workflow, null);
    });
  });

  describe('L4 Task', () => {
    it('passes through task data', () => {
      const result = processL4({
        taskId: 'brief-extract',
        handoff: { source: 'wu', score: 95 },
        artifacts: ['report.yaml'],
        taskCriteria: ['All categories extracted'],
      });
      assert.equal(result.layer, 'L4');
      assert.equal(result.taskId, 'brief-extract');
      assert.deepEqual(result.handoff, { source: 'wu', score: 95 });
      assert.deepEqual(result.criteria, ['All categories extracted']);
    });

    it('returns defaults when no task data', () => {
      const result = processL4({});
      assert.equal(result.taskId, null);
      assert.deepEqual(result.handoff, {});
      assert.deepEqual(result.artifacts, []);
    });
  });
});

// ---------------------------------------------------------------------------
// Edge cases & malformed input
// ---------------------------------------------------------------------------

describe('L0 Edge Cases', () => {
  it('handles malformed YAML in constitution domain', () => {
    const badDir = mkdtempSync(join(tmpdir(), 'l0-bad-'));
    writeFileSync(join(badDir, 'constitution.yaml'), '{{invalid yaml: [');
    const result = processL0({ domainsDir: badDir });
    assert.equal(result.layer, 'L0');
    assert.deepEqual(result.rules, []);
    rmSync(badDir, { recursive: true, force: true });
  });

  it('handles empty domain file', () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'l0-empty-'));
    writeFileSync(join(emptyDir, 'constitution.yaml'), '');
    const result = processL0({ domainsDir: emptyDir });
    assert.equal(result.layer, 'L0');
    assert.deepEqual(result.rules, []);
    rmSync(emptyDir, { recursive: true, force: true });
  });
});

describe('L1 Edge Cases', () => {
  it('returns default bracketBehavior for undefined bracket', () => {
    const tmpL1 = mkdtempSync(join(tmpdir(), 'l1-crit-'));
    writeFileSync(join(tmpL1, 'global.yaml'), 'rules:\n  - id: g1\n    text: "Rule"\nbrackets:\n  FRESH:\n    behavior: "Full"\n');
    const result = processL1({ domainsDir: tmpL1, mode: 'discover', bracket: 'CRITICAL' });
    assert.equal(result.layer, 'L1');
    assert.equal(result.bracketBehavior, 'normal');
    rmSync(tmpL1, { recursive: true, force: true });
  });

  it('maps unknown mode to planning governance', () => {
    const tmpL1 = mkdtempSync(join(tmpdir(), 'l1-unk-'));
    writeFileSync(join(tmpL1, 'global.yaml'), 'rules: []\nmodes:\n  planning:\n    writeScope: "chati.dev/"\n');
    const result = processL1({ domainsDir: tmpL1, mode: 'unknown-mode', bracket: 'FRESH' });
    assert.equal(result.modeRules.writeScope, 'chati.dev/');
    rmSync(tmpL1, { recursive: true, force: true });
  });

  it('handles domain without modes block', () => {
    const noModesDir = mkdtempSync(join(tmpdir(), 'l1-nomodes-'));
    writeFileSync(join(noModesDir, 'global.yaml'), 'rules:\n  - id: g1\n    text: "Rule"\n');
    const result = processL1({ domainsDir: noModesDir, mode: 'build', bracket: 'FRESH' });
    assert.equal(result.layer, 'L1');
    assert.equal(result.modeRules.writeScope, 'chati.dev/');
    rmSync(noModesDir, { recursive: true, force: true });
  });

  it('handles domain without brackets block', () => {
    const noBracketsDir = mkdtempSync(join(tmpdir(), 'l1-nobrackets-'));
    writeFileSync(join(noBracketsDir, 'global.yaml'), 'rules:\n  - id: g1\n    text: "Rule"\n');
    const result = processL1({ domainsDir: noBracketsDir, mode: 'discover', bracket: 'FRESH' });
    assert.equal(result.bracketBehavior, 'normal');
    rmSync(noBracketsDir, { recursive: true, force: true });
  });
});

describe('L2 Edge Cases', () => {
  it('handles malformed YAML in agent domain', () => {
    const badDir = mkdtempSync(join(tmpdir(), 'l2-bad-'));
    mkdirSync(join(badDir, 'agents'), { recursive: true });
    writeFileSync(join(badDir, 'agents', 'broken.yaml'), '{{not valid yaml');
    const result = processL2({ domainsDir: badDir, agent: 'broken' });
    assert.equal(result.layer, 'L2');
    assert.equal(result.agent, 'broken');
    assert.deepEqual(result.rules, []);
    rmSync(badDir, { recursive: true, force: true });
  });

  it('handles agent with minimal domain (only rules, no authority/mission)', () => {
    const minDir = mkdtempSync(join(tmpdir(), 'l2-min-'));
    mkdirSync(join(minDir, 'agents'), { recursive: true });
    writeFileSync(join(minDir, 'agents', 'minimal.yaml'), 'rules:\n  - id: m1\n    text: "Only rule"\n');
    const result = processL2({ domainsDir: minDir, agent: 'minimal' });
    assert.equal(result.mission, '');
    assert.deepEqual(result.authority.exclusive, []);
    assert.deepEqual(result.outputs, []);
    assert.equal(result.rules.length, 1);
    rmSync(minDir, { recursive: true, force: true });
  });
});

describe('L3 Edge Cases', () => {
  it('handles pipelinePosition not found in steps', () => {
    const tmpL3 = mkdtempSync(join(tmpdir(), 'l3-notfound-'));
    mkdirSync(join(tmpL3, 'workflows'), { recursive: true });
    writeFileSync(join(tmpL3, 'workflows', 'test-wf.yaml'), 'steps:\n  - wu\n  - brief\n  - detail\nrules: []\n');
    const result = processL3({
      domainsDir: tmpL3,
      workflow: 'test-wf',
      pipelinePosition: 'nonexistent-step',
    });
    assert.equal(result.pipelineContext.currentStep, 'nonexistent-step');
    assert.equal(result.pipelineContext.progress, 0);
    assert.equal(result.pipelineContext.previousStep, null);
    rmSync(tmpL3, { recursive: true, force: true });
  });

  it('handles workflow with empty steps', () => {
    const emptyWfDir = mkdtempSync(join(tmpdir(), 'l3-empty-'));
    mkdirSync(join(emptyWfDir, 'workflows'), { recursive: true });
    writeFileSync(join(emptyWfDir, 'workflows', 'empty-wf.yaml'), 'steps: []\nrules: []\n');
    const result = processL3({
      domainsDir: emptyWfDir,
      workflow: 'empty-wf',
      pipelinePosition: 'any',
    });
    assert.equal(result.pipelineContext.totalSteps, 0);
    assert.equal(result.pipelineContext.progress, 0);
    rmSync(emptyWfDir, { recursive: true, force: true });
  });
});

describe('L4 Edge Cases', () => {
  it('passes through all populated fields correctly', () => {
    const result = processL4({
      taskId: 'full-task',
      handoff: { source: 'architect', score: 98, outputs: ['design.md'] },
      artifacts: ['prd.md', 'design.md'],
      taskCriteria: ['Criterion A', 'Criterion B', 'Criterion C'],
    });
    assert.equal(result.taskId, 'full-task');
    assert.equal(result.handoff.source, 'architect');
    assert.equal(result.handoff.score, 98);
    assert.deepEqual(result.artifacts, ['prd.md', 'design.md']);
    assert.deepEqual(result.criteria, ['Criterion A', 'Criterion B', 'Criterion C']);
  });

  it('handles partial fields (only handoff)', () => {
    const result = processL4({
      handoff: { source: 'brief', score: 90 },
    });
    assert.equal(result.taskId, null);
    assert.equal(result.handoff.source, 'brief');
    assert.deepEqual(result.artifacts, []);
    assert.deepEqual(result.criteria, []);
  });
});

describe('Domain Loader', () => {
  it('loads valid YAML file', () => {
    const tmpFile = join(tmpdir(), `test-domain-${Date.now()}.yaml`);
    writeFileSync(tmpFile, 'key: value\nlist:\n  - a\n  - b');
    const result = loadDomainFile(tmpFile);
    assert.equal(result.loaded, true);
    assert.equal(result.data.key, 'value');
    assert.deepEqual(result.data.list, ['a', 'b']);
    rmSync(tmpFile);
  });

  it('returns error for missing file', () => {
    const result = loadDomainFile('/nonexistent/file.yaml');
    assert.equal(result.loaded, false);
    assert.ok(result.error.includes('not found'));
  });

  it('extracts rules from domain', () => {
    const rules = extractRules({
      rules: [
        { id: 'r1', text: 'Rule 1', priority: 'critical' },
        { id: 'r2', rule: 'Rule 2' },
      ],
    });
    assert.equal(rules.length, 2);
    assert.equal(rules[0].text, 'Rule 1');
    assert.equal(rules[1].text, 'Rule 2');
    assert.equal(rules[1].priority, 'normal');
  });

  it('returns empty for null domain', () => {
    assert.deepEqual(extractRules(null), []);
    assert.deepEqual(extractRules({}), []);
  });
});
