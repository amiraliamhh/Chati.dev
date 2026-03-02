import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import {
  detectTestCommand,
  parseTestOutput,
} from '../../src/quality/test-runner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// detectTestCommand
// ---------------------------------------------------------------------------

describe('detectTestCommand', () => {
  it('should detect test command from project root (this project)', () => {
    // The chati-dev package has node:test in package.json
    const projectRoot = join(__dirname, '../..');
    const result = detectTestCommand(projectRoot);

    assert.equal(result.detected, true);
    assert.ok(result.command);
    assert.equal(result.runner, 'node:test');
  });

  it('should return not detected for non-existent directory', () => {
    const result = detectTestCommand('/tmp/does-not-exist-test-runner-xyz');
    assert.equal(result.detected, false);
    assert.equal(result.command, null);
    assert.equal(result.runner, 'unknown');
  });
});

// ---------------------------------------------------------------------------
// parseTestOutput — node:test
// ---------------------------------------------------------------------------

describe('parseTestOutput — node:test', () => {
  it('should parse node:test TAP output', () => {
    const output = `
# tests 150
# suites 30
# pass 148
# fail 2
# cancelled 0
# skipped 0
    `;
    const result = parseTestOutput(output, 'node:test');

    assert.equal(result.total, 150);
    assert.equal(result.passed, 148);
    assert.equal(result.failed, 2);
    assert.equal(result.skipped, 0);
  });

  it('should handle output with skipped tests', () => {
    const output = '# tests 100\n# pass 90\n# fail 5\n# skipped 5';
    const result = parseTestOutput(output, 'node:test');

    assert.equal(result.total, 100);
    assert.equal(result.passed, 90);
    assert.equal(result.failed, 5);
    assert.equal(result.skipped, 5);
  });
});

// ---------------------------------------------------------------------------
// parseTestOutput — jest
// ---------------------------------------------------------------------------

describe('parseTestOutput — jest', () => {
  it('should parse Jest summary', () => {
    const output = 'Tests:  3 failed, 47 passed, 50 total';
    const result = parseTestOutput(output, 'jest');

    assert.equal(result.total, 50);
    assert.equal(result.failed, 3);
  });
});

// ---------------------------------------------------------------------------
// parseTestOutput — vitest
// ---------------------------------------------------------------------------

describe('parseTestOutput — vitest', () => {
  it('should parse vitest output', () => {
    const output = '✓ 25 passed\n✗ 2 failed\n○ 1 skipped';
    const result = parseTestOutput(output, 'vitest');

    assert.equal(result.passed, 25);
    assert.equal(result.failed, 2);
    assert.equal(result.skipped, 1);
    assert.equal(result.total, 28);
  });
});

// ---------------------------------------------------------------------------
// parseTestOutput — mocha
// ---------------------------------------------------------------------------

describe('parseTestOutput — mocha', () => {
  it('should parse mocha output', () => {
    const output = '  30 passing (1s)\n  2 failing\n  1 pending';
    const result = parseTestOutput(output, 'mocha');

    assert.equal(result.passed, 30);
    assert.equal(result.failed, 2);
    assert.equal(result.skipped, 1);
    assert.equal(result.total, 33);
  });
});

// ---------------------------------------------------------------------------
// parseTestOutput — generic
// ---------------------------------------------------------------------------

describe('parseTestOutput — generic/unknown', () => {
  it('should parse generic pass/fail output', () => {
    const output = 'Results: 10 pass, 3 fail';
    const result = parseTestOutput(output, 'unknown');

    assert.equal(result.passed, 10);
    assert.equal(result.failed, 3);
  });

  it('should handle empty output', () => {
    const result = parseTestOutput('', 'unknown');

    assert.equal(result.total, 0);
    assert.equal(result.passed, 0);
    assert.equal(result.failed, 0);
  });

  it('should handle null output', () => {
    const result = parseTestOutput(null, 'node:test');

    assert.equal(result.total, 0);
  });
});
