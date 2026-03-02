/**
 * @fileoverview Tests for terminal/handoff-parser module.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseAgentOutput, validateHandoff } from '../../src/terminal/handoff-parser.js';

describe('handoff-parser', () => {
  describe('parseAgentOutput', () => {
    it('should extract a valid handoff block', () => {
      const output = `Some agent thinking...
Working on the task...

<chati-handoff>
status: complete
score: 97
summary: PRD criado com sucesso.
outputs:
  - chati.dev/artifacts/2-PRD/prd.md
  - chati.dev/artifacts/2-PRD/appendix.md
decisions:
  framework: next.js
  database: postgres
blockers:
needs_input_question: null
</chati-handoff>

Done.`;

      const result = parseAgentOutput(output);

      assert.equal(result.found, true);
      assert.equal(result.handoff.status, 'complete');
      assert.equal(result.handoff.score, 97);
      assert.equal(result.handoff.summary, 'PRD criado com sucesso.');
      assert.deepEqual(result.handoff.outputs, [
        'chati.dev/artifacts/2-PRD/prd.md',
        'chati.dev/artifacts/2-PRD/appendix.md',
      ]);
      assert.deepEqual(result.handoff.decisions, {
        framework: 'next.js',
        database: 'postgres',
      });
      assert.deepEqual(result.handoff.blockers, []);
      assert.equal(result.handoff.needs_input_question, null);
      assert.equal(result.rawOutput, output);
    });

    it('should return found: false when no handoff block exists', () => {
      const output = 'Just some regular agent output with no handoff.';
      const result = parseAgentOutput(output);

      assert.equal(result.found, false);
      assert.equal(result.handoff, null);
      assert.equal(result.rawOutput, output);
    });

    it('should handle null input', () => {
      const result = parseAgentOutput(null);
      assert.equal(result.found, false);
      assert.equal(result.handoff, null);
      assert.equal(result.rawOutput, '');
    });

    it('should handle undefined input', () => {
      const result = parseAgentOutput(undefined);
      assert.equal(result.found, false);
      assert.equal(result.handoff, null);
    });

    it('should handle empty string', () => {
      const result = parseAgentOutput('');
      assert.equal(result.found, false);
      assert.equal(result.handoff, null);
    });

    it('should handle non-string input', () => {
      const result = parseAgentOutput(42);
      assert.equal(result.found, false);
    });

    it('should parse needs_input status correctly', () => {
      const output = `<chati-handoff>
status: needs_input
score: 50
summary: Need clarification on database choice.
needs_input_question: Should we use PostgreSQL or MongoDB?
</chati-handoff>`;

      const result = parseAgentOutput(output);

      assert.equal(result.found, true);
      assert.equal(result.handoff.status, 'needs_input');
      assert.equal(result.handoff.score, 50);
      assert.equal(result.handoff.needs_input_question, 'Should we use PostgreSQL or MongoDB?');
    });

    it('should parse blockers list', () => {
      const output = `<chati-handoff>
status: partial
score: 60
summary: Partially done.
blockers:
  - Missing API credentials
  - Design specs unclear
</chati-handoff>`;

      const result = parseAgentOutput(output);

      assert.equal(result.found, true);
      assert.deepEqual(result.handoff.blockers, [
        'Missing API credentials',
        'Design specs unclear',
      ]);
    });

    it('should handle inline single-item outputs', () => {
      const output = `<chati-handoff>
status: complete
score: 95
summary: Done.
outputs: chati.dev/artifacts/prd.md
</chati-handoff>`;

      const result = parseAgentOutput(output);

      assert.equal(result.found, true);
      assert.deepEqual(result.handoff.outputs, ['chati.dev/artifacts/prd.md']);
    });

    it('should default status to unknown when missing', () => {
      const output = `<chati-handoff>
score: 80
summary: Some work done.
</chati-handoff>`;

      const result = parseAgentOutput(output);

      assert.equal(result.found, true);
      assert.equal(result.handoff.status, 'unknown');
    });

    it('should handle invalid score gracefully', () => {
      const output = `<chati-handoff>
status: complete
score: not-a-number
summary: Done.
</chati-handoff>`;

      const result = parseAgentOutput(output);

      assert.equal(result.found, true);
      assert.equal(result.handoff.score, null);
    });

    it('should handle needs_input_question set to null string', () => {
      const output = `<chati-handoff>
status: complete
score: 95
summary: Done.
needs_input_question: null
</chati-handoff>`;

      const result = parseAgentOutput(output);
      assert.equal(result.handoff.needs_input_question, null);
    });

    it('should handle empty needs_input_question', () => {
      const output = `<chati-handoff>
status: complete
score: 95
summary: Done.
needs_input_question:
</chati-handoff>`;

      const result = parseAgentOutput(output);
      assert.equal(result.handoff.needs_input_question, null);
    });

    it('should handle minimal valid handoff', () => {
      const output = '<chati-handoff>\nstatus: complete\n</chati-handoff>';
      const result = parseAgentOutput(output);

      assert.equal(result.found, true);
      assert.equal(result.handoff.status, 'complete');
      assert.equal(result.handoff.score, null);
      assert.equal(result.handoff.summary, '');
      assert.deepEqual(result.handoff.outputs, []);
      assert.deepEqual(result.handoff.decisions, {});
      assert.deepEqual(result.handoff.blockers, []);
    });

    it('should handle handoff block surrounded by large output', () => {
      const before = 'x'.repeat(5000);
      const after = 'y'.repeat(5000);
      const output = `${before}\n<chati-handoff>\nstatus: complete\nscore: 99\nsummary: Done.\n</chati-handoff>\n${after}`;

      const result = parseAgentOutput(output);
      assert.equal(result.found, true);
      assert.equal(result.handoff.status, 'complete');
      assert.equal(result.handoff.score, 99);
    });
  });

  describe('parseAgentOutput — validation fields', () => {
    it('should include valid and warnings in result', () => {
      const output = '<chati-handoff>\nstatus: APPROVED\nscore: 95\n</chati-handoff>';
      const result = parseAgentOutput(output);

      assert.equal(result.found, true);
      assert.equal(typeof result.valid, 'boolean');
      assert.ok(Array.isArray(result.warnings));
    });

    it('should mark valid handoff as valid', () => {
      const output = '<chati-handoff>\nstatus: APPROVED\nscore: 95\nsummary: All good.\n</chati-handoff>';
      const result = parseAgentOutput(output);

      assert.equal(result.valid, true);
    });

    it('should include warnings for missing handoff block', () => {
      const result = parseAgentOutput('no handoff here');
      assert.equal(result.valid, false);
      assert.ok(result.warnings.length > 0);
    });

    it('should include warnings for null input', () => {
      const result = parseAgentOutput(null);
      assert.equal(result.valid, false);
      assert.ok(result.warnings.length > 0);
    });
  });

  describe('validateHandoff', () => {
    it('should validate a well-formed handoff', () => {
      const handoff = {
        status: 'APPROVED',
        score: 95,
        summary: 'All checks passed',
        outputs: ['file.md'],
        decisions: {},
        blockers: [],
      };
      const result = validateHandoff(handoff);
      assert.equal(result.valid, true);
    });

    it('should warn about invalid status', () => {
      const handoff = { status: 'INVALID_STATUS', score: 50 };
      const result = validateHandoff(handoff);
      assert.equal(result.valid, false);
      assert.ok(result.warnings.some(w => w.includes('Invalid status')));
    });

    it('should warn about score out of range', () => {
      const handoff = { status: 'APPROVED', score: 150 };
      const result = validateHandoff(handoff);
      assert.ok(result.warnings.some(w => w.includes('out of range')));
    });

    it('should handle null handoff', () => {
      const result = validateHandoff(null);
      assert.equal(result.valid, false);
    });

    it('should accept NEEDS_REVISION status', () => {
      const handoff = { status: 'NEEDS_REVISION', score: 70 };
      const result = validateHandoff(handoff);
      assert.equal(result.valid, true);
    });

    it('should accept BLOCKED status', () => {
      const handoff = { status: 'BLOCKED', score: 30 };
      const result = validateHandoff(handoff);
      assert.equal(result.valid, true);
    });
  });

  describe('provider metadata parsing', () => {
    it('should parse provider field from handoff', () => {
      const output = `<chati-handoff>
status: APPROVED
score: 96
provider: gemini
model: pro
summary: Done.
</chati-handoff>`;

      const result = parseAgentOutput(output);
      assert.equal(result.found, true);
      assert.equal(result.handoff.provider, 'gemini');
      assert.equal(result.handoff.model, 'pro');
    });

    it('should parse claude provider and opus model', () => {
      const output = `<chati-handoff>
status: APPROVED
score: 97
provider: claude
model: opus
summary: Done.
</chati-handoff>`;

      const result = parseAgentOutput(output);
      assert.equal(result.handoff.provider, 'claude');
      assert.equal(result.handoff.model, 'opus');
    });

    it('should default provider and model to null when not present', () => {
      const output = `<chati-handoff>
status: APPROVED
score: 95
summary: Done.
</chati-handoff>`;

      const result = parseAgentOutput(output);
      assert.equal(result.handoff.provider, null);
      assert.equal(result.handoff.model, null);
    });

    it('should handle codex provider with codex model', () => {
      const output = `<chati-handoff>
status: APPROVED
score: 95
provider: codex
model: codex
summary: Done.
</chati-handoff>`;

      const result = parseAgentOutput(output);
      assert.equal(result.handoff.provider, 'codex');
      assert.equal(result.handoff.model, 'codex');
    });
  });
});
