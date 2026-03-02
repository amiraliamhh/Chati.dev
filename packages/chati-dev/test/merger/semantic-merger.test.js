import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFLICT_TYPES,
  MERGE_STRATEGIES,
  detectConflicts,
  mergeChanges,
  validateMergedResult,
} from '../../src/merger/semantic-merger.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('semantic-merger constants', () => {
  it('should export CONFLICT_TYPES', () => {
    assert.equal(CONFLICT_TYPES.FILE_OVERLAP, 'file_overlap');
    assert.equal(CONFLICT_TYPES.IMPORT_CONFLICT, 'import_conflict');
    assert.equal(CONFLICT_TYPES.NAMING_CONFLICT, 'naming_conflict');
    assert.equal(CONFLICT_TYPES.STRUCTURAL_CONFLICT, 'structural_conflict');
  });

  it('should export MERGE_STRATEGIES', () => {
    assert.equal(MERGE_STRATEGIES.CONSERVATIVE, 'conservative');
    assert.equal(MERGE_STRATEGIES.LATEST, 'latest');
  });
});

// ---------------------------------------------------------------------------
// detectConflicts
// ---------------------------------------------------------------------------

describe('detectConflicts', () => {
  it('should return no conflicts for single change', () => {
    const result = detectConflicts([{ agent: 'dev', file: 'a.js' }]);
    assert.equal(result.hasConflicts, false);
    assert.equal(result.conflicts.length, 0);
  });

  it('should return no conflicts for null/empty', () => {
    assert.equal(detectConflicts(null).hasConflicts, false);
    assert.equal(detectConflicts([]).hasConflicts, false);
  });

  it('should detect file overlap from different agents', () => {
    const changes = [
      { agent: 'dev', file: 'src/app.js', content: 'code1' },
      { agent: 'architect', file: 'src/app.js', content: 'code2' },
    ];
    const result = detectConflicts(changes);
    assert.equal(result.hasConflicts, true);
    assert.equal(result.conflicts[0].type, CONFLICT_TYPES.FILE_OVERLAP);
    assert.deepEqual(result.conflicts[0].agents, ['dev', 'architect']);
  });

  it('should NOT detect conflict when same agent changes same file', () => {
    const changes = [
      { agent: 'dev', file: 'src/app.js', content: 'code1' },
      { agent: 'dev', file: 'src/app.js', content: 'code2' },
    ];
    const result = detectConflicts(changes);
    assert.equal(result.hasConflicts, false);
  });

  it('should detect import conflicts', () => {
    const changes = [
      { agent: 'dev', file: 'src/app.js', imports: ["import { foo } from './utils'"] },
      { agent: 'architect', file: 'src/app.js', imports: ["import { foo } from './utils'"] },
    ];
    const result = detectConflicts(changes);
    assert.equal(result.hasConflicts, true);
    const importConflict = result.conflicts.find(c => c.type === CONFLICT_TYPES.IMPORT_CONFLICT);
    assert.ok(importConflict, 'Expected import conflict');
  });

  it('should detect naming conflicts (export collision)', () => {
    const changes = [
      { agent: 'dev', file: 'src/utils.js', exports: ['formatDate'] },
      { agent: 'architect', file: 'src/helpers.js', exports: ['formatDate'] },
    ];
    const result = detectConflicts(changes);
    assert.equal(result.hasConflicts, true);
    const namingConflict = result.conflicts.find(c => c.type === CONFLICT_TYPES.NAMING_CONFLICT);
    assert.ok(namingConflict, 'Expected naming conflict');
    assert.ok(namingConflict.description.includes('formatDate'));
  });

  it('should report no conflicts for non-overlapping changes', () => {
    const changes = [
      { agent: 'dev', file: 'src/a.js', content: 'code1' },
      { agent: 'architect', file: 'src/b.js', content: 'code2' },
    ];
    const result = detectConflicts(changes);
    assert.equal(result.hasConflicts, false);
  });

  it('should set severity appropriately', () => {
    const changes = [
      { agent: 'dev', file: 'src/app.js', content: 'code1' },
      { agent: 'architect', file: 'src/app.js', content: 'code2' },
    ];
    const result = detectConflicts(changes);
    assert.equal(result.conflicts[0].severity, 'error');
  });
});

// ---------------------------------------------------------------------------
// mergeChanges
// ---------------------------------------------------------------------------

describe('mergeChanges', () => {
  it('should return empty for null/empty changes', () => {
    const result = mergeChanges(null);
    assert.equal(result.merged.length, 0);
    assert.equal(result.skipped.length, 0);
  });

  it('should return single change as-is', () => {
    const changes = [{ agent: 'dev', file: 'a.js', content: 'code' }];
    const result = mergeChanges(changes);
    assert.equal(result.merged.length, 1);
    assert.equal(result.skipped.length, 0);
  });

  it('should merge non-conflicting changes', () => {
    const changes = [
      { agent: 'dev', file: 'a.js', content: 'codeA' },
      { agent: 'architect', file: 'b.js', content: 'codeB' },
    ];
    const result = mergeChanges(changes);
    assert.equal(result.merged.length, 2);
    assert.equal(result.skipped.length, 0);
  });

  it('should use conservative strategy by default (first wins)', () => {
    const changes = [
      { agent: 'dev', file: 'a.js', content: 'first', timestamp: '2024-01-01T00:00:00Z' },
      { agent: 'architect', file: 'a.js', content: 'second', timestamp: '2024-01-01T01:00:00Z' },
    ];
    const result = mergeChanges(changes);
    assert.equal(result.merged.length, 1);
    assert.equal(result.merged[0].content, 'first');
    assert.equal(result.skipped.length, 1);
    assert.equal(result.strategy, MERGE_STRATEGIES.CONSERVATIVE);
  });

  it('should use latest strategy when specified', () => {
    const changes = [
      { agent: 'dev', file: 'a.js', content: 'first', timestamp: '2024-01-01T00:00:00Z' },
      { agent: 'architect', file: 'a.js', content: 'second', timestamp: '2024-01-01T01:00:00Z' },
    ];
    const result = mergeChanges(changes, MERGE_STRATEGIES.LATEST);
    assert.equal(result.merged.length, 1);
    assert.equal(result.merged[0].content, 'second');
    assert.equal(result.strategy, MERGE_STRATEGIES.LATEST);
  });

  it('should handle mix of conflicting and non-conflicting changes', () => {
    const changes = [
      { agent: 'dev', file: 'a.js', content: 'codeA', timestamp: '2024-01-01T00:00:00Z' },
      { agent: 'architect', file: 'a.js', content: 'codeA2', timestamp: '2024-01-01T01:00:00Z' },
      { agent: 'ux', file: 'b.js', content: 'codeB', timestamp: '2024-01-01T00:00:00Z' },
    ];
    const result = mergeChanges(changes);
    assert.equal(result.merged.length, 2); // a.js winner + b.js
    assert.equal(result.skipped.length, 1); // a.js loser
  });
});

// ---------------------------------------------------------------------------
// validateMergedResult
// ---------------------------------------------------------------------------

describe('validateMergedResult', () => {
  it('should fail for null/empty merged content', () => {
    const result = validateMergedResult('original', null);
    assert.equal(result.valid, false);
    assert.ok(result.issues.length > 0);
  });

  it('should pass for valid code', () => {
    const original = 'const x = { a: [1, 2, 3] };';
    const merged = 'const x = { a: [1, 2, 3], b: true };';
    const result = validateMergedResult(original, merged);
    assert.equal(result.valid, true);
    assert.equal(result.issues.length, 0);
  });

  it('should detect unbalanced braces', () => {
    const result = validateMergedResult('{}', '{ unclosed');
    assert.equal(result.valid, false);
    assert.ok(result.issues.some(i => i.includes('braces')));
  });

  it('should detect unbalanced parentheses', () => {
    const result = validateMergedResult('()', '(unclosed');
    assert.equal(result.valid, false);
    assert.ok(result.issues.some(i => i.includes('parentheses')));
  });

  it('should detect unbalanced brackets', () => {
    const result = validateMergedResult('[]', '[unclosed');
    assert.equal(result.valid, false);
    assert.ok(result.issues.some(i => i.includes('brackets')));
  });

  it('should detect duplicate imports', () => {
    const merged = "import { foo } from './bar';\nimport { foo } from './bar';\nconst x = foo();";
    const result = validateMergedResult('', merged);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some(i => i.includes('Duplicate imports')));
  });

  it('should warn about significant content loss', () => {
    const original = 'x'.repeat(1000);
    const merged = 'x'.repeat(100);
    const result = validateMergedResult(original, merged);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some(i => i.includes('data loss')));
  });

  it('should pass when original is empty and merged is valid', () => {
    const result = validateMergedResult('', 'const x = 1;');
    assert.equal(result.valid, true);
  });
});
