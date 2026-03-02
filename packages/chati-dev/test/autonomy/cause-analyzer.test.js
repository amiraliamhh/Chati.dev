import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  FAILURE_CATEGORIES,
  analyzeCause,
  buildRetryGuidance,
} from '../../src/autonomy/cause-analyzer.js';

// ---------------------------------------------------------------------------
// FAILURE_CATEGORIES enum
// ---------------------------------------------------------------------------

describe('FAILURE_CATEGORIES', () => {
  it('should have all expected categories', () => {
    assert.equal(FAILURE_CATEGORIES.SYNTAX_ERROR, 'syntax_error');
    assert.equal(FAILURE_CATEGORIES.TEST_FAILURE, 'test_failure');
    assert.equal(FAILURE_CATEGORIES.LINT_VIOLATION, 'lint_violation');
    assert.equal(FAILURE_CATEGORIES.TYPE_ERROR, 'type_error');
    assert.equal(FAILURE_CATEGORIES.TIMEOUT, 'timeout');
    assert.equal(FAILURE_CATEGORIES.SCOPE_VIOLATION, 'scope_violation');
    assert.equal(FAILURE_CATEGORIES.DEPENDENCY, 'dependency');
    assert.equal(FAILURE_CATEGORIES.RUNTIME_ERROR, 'runtime_error');
    assert.equal(FAILURE_CATEGORIES.UNKNOWN, 'unknown');
  });

  it('should have 9 categories', () => {
    assert.equal(Object.keys(FAILURE_CATEGORIES).length, 9);
  });
});

// ---------------------------------------------------------------------------
// analyzeCause — classification
// ---------------------------------------------------------------------------

describe('analyzeCause — classification', () => {
  it('should classify SyntaxError', () => {
    const result = analyzeCause('SyntaxError: Unexpected token }');
    assert.equal(result.category, FAILURE_CATEGORIES.SYNTAX_ERROR);
  });

  it('should classify parsing errors', () => {
    const result = analyzeCause('parsing error at line 42: unterminated string');
    assert.equal(result.category, FAILURE_CATEGORIES.SYNTAX_ERROR);
  });

  it('should classify test failures', () => {
    const result = analyzeCause('test suite failed: expected 5 but got 3');
    assert.equal(result.category, FAILURE_CATEGORIES.TEST_FAILURE);
  });

  it('should classify assertion failures', () => {
    const result = analyzeCause('AssertionError: assertion failed — expected true, received false');
    assert.equal(result.category, FAILURE_CATEGORIES.TEST_FAILURE);
  });

  it('should classify lint violations', () => {
    const result = analyzeCause('eslint found 3 errors and 1 warning');
    assert.equal(result.category, FAILURE_CATEGORIES.LINT_VIOLATION);
  });

  it('should classify prettier errors', () => {
    const result = analyzeCause('Prettier error: formatting mismatch in src/index.js');
    assert.equal(result.category, FAILURE_CATEGORIES.LINT_VIOLATION);
  });

  it('should classify TypeErrors', () => {
    const result = analyzeCause('TypeError: Cannot read property "name" of undefined');
    assert.equal(result.category, FAILURE_CATEGORIES.TYPE_ERROR);
  });

  it('should classify type mismatches', () => {
    const result = analyzeCause('type mismatch in argument at position 2');
    assert.equal(result.category, FAILURE_CATEGORIES.TYPE_ERROR);
  });

  it('should classify timeouts', () => {
    const result = analyzeCause('ETIMEDOUT: request timed out after 30000ms');
    assert.equal(result.category, FAILURE_CATEGORIES.TIMEOUT);
  });

  it('should classify scope violations', () => {
    const result = analyzeCause('scope violation: cannot write to /usr/bin in planning mode');
    assert.equal(result.category, FAILURE_CATEGORIES.SCOPE_VIOLATION);
  });

  it('should classify dependency errors', () => {
    const result = analyzeCause('Cannot find module "express"');
    assert.equal(result.category, FAILURE_CATEGORIES.DEPENDENCY);
  });

  it('should classify missing dependencies', () => {
    const result = analyzeCause('ENOENT: no such file or directory, open "config.json"');
    assert.equal(result.category, FAILURE_CATEGORIES.DEPENDENCY);
  });

  it('should classify runtime errors', () => {
    const result = analyzeCause('ReferenceError: myVar is not defined');
    assert.equal(result.category, FAILURE_CATEGORIES.RUNTIME_ERROR);
  });

  it('should return UNKNOWN for unrecognized output', () => {
    const result = analyzeCause('something completely random happened');
    assert.equal(result.category, FAILURE_CATEGORIES.UNKNOWN);
  });

  it('should handle empty output', () => {
    const result = analyzeCause('');
    assert.equal(result.category, FAILURE_CATEGORIES.UNKNOWN);
  });

  it('should handle null/undefined output', () => {
    const result = analyzeCause(null);
    assert.equal(result.category, FAILURE_CATEGORIES.UNKNOWN);
  });
});

// ---------------------------------------------------------------------------
// analyzeCause — rootCause extraction
// ---------------------------------------------------------------------------

describe('analyzeCause — rootCause', () => {
  it('should extract error line as root cause', () => {
    const output = 'Building...\nCompiling files...\nError: Cannot resolve import "./missing"\nDone.';
    const result = analyzeCause(output);
    assert.ok(result.rootCause.includes('Cannot resolve import'));
  });

  it('should truncate root cause to 200 chars', () => {
    const longError = 'Error: ' + 'x'.repeat(300);
    const result = analyzeCause(longError);
    assert.ok(result.rootCause.length <= 200);
  });

  it('should use last line as fallback when no error marker', () => {
    const output = 'line 1\nline 2\nline 3 final summary';
    const result = analyzeCause(output);
    assert.ok(result.rootCause.includes('final summary'));
  });

  it('should report no output for empty string', () => {
    const result = analyzeCause('');
    assert.ok(result.rootCause.includes('No output available') || result.rootCause.includes('unknown'));
  });
});

// ---------------------------------------------------------------------------
// analyzeCause — suggestion
// ---------------------------------------------------------------------------

describe('analyzeCause — suggestion', () => {
  it('should provide syntax-specific suggestion', () => {
    const result = analyzeCause('SyntaxError: Unexpected token');
    assert.ok(result.suggestion.includes('bracket') || result.suggestion.includes('semicolon'));
  });

  it('should provide test-specific suggestion', () => {
    const result = analyzeCause('test failed: expected 1 but got 2');
    assert.ok(result.suggestion.includes('test') || result.suggestion.includes('assertion'));
  });

  it('should provide dependency-specific suggestion', () => {
    const result = analyzeCause('Cannot find module "lodash"');
    assert.ok(result.suggestion.includes('module') || result.suggestion.includes('import'));
  });

  it('should provide generic suggestion for unknown', () => {
    const result = analyzeCause('random gibberish');
    assert.ok(result.suggestion.includes('Review'));
  });
});

// ---------------------------------------------------------------------------
// analyzeCause — isRepetitive
// ---------------------------------------------------------------------------

describe('analyzeCause — isRepetitive', () => {
  it('should NOT be repetitive with no previous attempts', () => {
    const result = analyzeCause('SyntaxError: Unexpected token');
    assert.equal(result.isRepetitive, false);
  });

  it('should NOT be repetitive with only 1 matching previous attempt', () => {
    const prev = [{ category: FAILURE_CATEGORIES.SYNTAX_ERROR, output: 'prev' }];
    const result = analyzeCause('SyntaxError: another error', prev);
    assert.equal(result.isRepetitive, false);
  });

  it('should be repetitive with 2+ matching previous attempts', () => {
    const prev = [
      { category: FAILURE_CATEGORIES.SYNTAX_ERROR, output: 'prev1' },
      { category: FAILURE_CATEGORIES.SYNTAX_ERROR, output: 'prev2' },
    ];
    const result = analyzeCause('SyntaxError: yet another error', prev);
    assert.equal(result.isRepetitive, true);
  });

  it('should NOT be repetitive for UNKNOWN category even with matching attempts', () => {
    const prev = [
      { category: FAILURE_CATEGORIES.UNKNOWN, output: 'prev1' },
      { category: FAILURE_CATEGORIES.UNKNOWN, output: 'prev2' },
    ];
    const result = analyzeCause('random unknown error', prev);
    assert.equal(result.isRepetitive, false);
  });

  it('should NOT be repetitive when previous attempts have different categories', () => {
    const prev = [
      { category: FAILURE_CATEGORIES.TEST_FAILURE, output: 'prev1' },
      { category: FAILURE_CATEGORIES.LINT_VIOLATION, output: 'prev2' },
    ];
    const result = analyzeCause('SyntaxError: Unexpected token', prev);
    assert.equal(result.isRepetitive, false);
  });
});

// ---------------------------------------------------------------------------
// buildRetryGuidance
// ---------------------------------------------------------------------------

describe('buildRetryGuidance', () => {
  it('should include attempt number', () => {
    const analysis = {
      category: FAILURE_CATEGORIES.SYNTAX_ERROR,
      rootCause: 'Missing bracket at line 5',
      suggestion: 'Check brackets',
      isRepetitive: false,
    };
    const guidance = buildRetryGuidance(analysis, 3);
    assert.ok(guidance.includes('Attempt 3'));
  });

  it('should include category', () => {
    const analysis = {
      category: FAILURE_CATEGORIES.TEST_FAILURE,
      rootCause: 'Test assertion failed',
      suggestion: 'Review tests',
      isRepetitive: false,
    };
    const guidance = buildRetryGuidance(analysis, 1);
    assert.ok(guidance.includes('test_failure'));
  });

  it('should include root cause', () => {
    const analysis = {
      category: FAILURE_CATEGORIES.DEPENDENCY,
      rootCause: 'Cannot find module "express"',
      suggestion: 'Install deps',
      isRepetitive: false,
    };
    const guidance = buildRetryGuidance(analysis, 1);
    assert.ok(guidance.includes('Cannot find module'));
  });

  it('should include suggestion', () => {
    const analysis = {
      category: FAILURE_CATEGORIES.LINT_VIOLATION,
      rootCause: 'eslint errors',
      suggestion: 'Fix formatting and style issues',
      isRepetitive: false,
    };
    const guidance = buildRetryGuidance(analysis, 2);
    assert.ok(guidance.includes('Fix formatting'));
  });

  it('should include WARNING for repetitive failures', () => {
    const analysis = {
      category: FAILURE_CATEGORIES.SYNTAX_ERROR,
      rootCause: 'Missing bracket',
      suggestion: 'Check brackets',
      isRepetitive: true,
    };
    const guidance = buildRetryGuidance(analysis, 4);
    assert.ok(guidance.includes('WARNING'));
    assert.ok(guidance.includes('REPETITIVE'));
    assert.ok(guidance.includes('fundamentally different'));
  });

  it('should NOT include WARNING when not repetitive', () => {
    const analysis = {
      category: FAILURE_CATEGORIES.SYNTAX_ERROR,
      rootCause: 'Missing bracket',
      suggestion: 'Check brackets',
      isRepetitive: false,
    };
    const guidance = buildRetryGuidance(analysis, 2);
    assert.ok(!guidance.includes('WARNING'));
  });

  it('should handle empty root cause', () => {
    const analysis = {
      category: FAILURE_CATEGORIES.UNKNOWN,
      rootCause: '',
      suggestion: 'Review output',
      isRepetitive: false,
    };
    const guidance = buildRetryGuidance(analysis, 1);
    assert.ok(guidance.includes('Attempt 1'));
    assert.ok(!guidance.includes('Root cause'));
  });
});
