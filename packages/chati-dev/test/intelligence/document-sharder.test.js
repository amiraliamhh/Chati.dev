import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  shardDocument,
  reassembleShards,
  getShardForSection,
  DEFAULT_MAX_SHARD_SIZE,
  DEFAULT_OVERLAP,
} from '../../src/intelligence/document-sharder.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('document-sharder constants', () => {
  it('should export DEFAULT_MAX_SHARD_SIZE as 8000', () => {
    assert.equal(DEFAULT_MAX_SHARD_SIZE, 8_000);
  });

  it('should export DEFAULT_OVERLAP as 800', () => {
    assert.equal(DEFAULT_OVERLAP, 800);
  });
});

// ---------------------------------------------------------------------------
// shardDocument
// ---------------------------------------------------------------------------

describe('shardDocument', () => {
  it('should return empty array for null/undefined/empty input', () => {
    assert.deepEqual(shardDocument(null), []);
    assert.deepEqual(shardDocument(undefined), []);
    assert.deepEqual(shardDocument(''), []);
  });

  it('should return single shard for small content', () => {
    const content = '# Title\n\nSome short content.';
    const shards = shardDocument(content);
    assert.equal(shards.length, 1);
    assert.equal(shards[0].index, 0);
    assert.equal(shards[0].content, content);
    assert.equal(shards[0].hasOverlap, false);
    assert.equal(shards[0].startOffset, 0);
    assert.equal(shards[0].endOffset, content.length);
  });

  it('should extract section headings', () => {
    const content = '# Main Title\n\n## Section A\n\nText A\n\n## Section B\n\nText B';
    const shards = shardDocument(content);
    assert.equal(shards.length, 1);
    assert.deepEqual(shards[0].sections, ['Main Title', 'Section A', 'Section B']);
  });

  it('should split large content into multiple shards', () => {
    // Create content larger than default max shard size
    const sections = [];
    for (let i = 0; i < 20; i++) {
      sections.push(`## Section ${i}\n\n${'Lorem ipsum dolor sit amet. '.repeat(20)}`);
    }
    const content = `# Big Document\n\n${sections.join('\n\n')}`;

    const shards = shardDocument(content, { maxShardSize: 2000, overlap: 200 });
    assert.ok(shards.length > 1, `Expected multiple shards, got ${shards.length}`);

    // First shard should not have overlap
    assert.equal(shards[0].hasOverlap, false);

    // Subsequent shards should have overlap
    for (let i = 1; i < shards.length; i++) {
      assert.equal(shards[i].hasOverlap, true, `Shard ${i} should have overlap`);
    }
  });

  it('should respect heading boundaries when splitting', () => {
    const section = 'x'.repeat(500);
    const content = `## Section 1\n\n${section}\n\n## Section 2\n\n${section}\n\n## Section 3\n\n${section}`;

    const shards = shardDocument(content, { maxShardSize: 800, overlap: 100 });
    assert.ok(shards.length >= 2);

    // First shard should have at least one section heading
    assert.ok(shards[0].sections.length >= 1, 'First shard should have at least one section');

    // Total sections across all shards should cover all 3 headings
    const allSections = shards.flatMap(s => s.sections);
    assert.ok(allSections.length >= 3, `Expected at least 3 sections total, got ${allSections.length}`);
  });

  it('should use custom maxShardSize and overlap', () => {
    const content = 'x'.repeat(500);
    const shards = shardDocument(content, { maxShardSize: 200, overlap: 50 });
    assert.ok(shards.length > 1);
  });

  it('should assign sequential indices', () => {
    const content = 'x'.repeat(1000);
    const shards = shardDocument(content, { maxShardSize: 300, overlap: 50 });
    for (let i = 0; i < shards.length; i++) {
      assert.equal(shards[i].index, i);
    }
  });
});

// ---------------------------------------------------------------------------
// reassembleShards
// ---------------------------------------------------------------------------

describe('reassembleShards', () => {
  it('should return empty string for null/empty array', () => {
    assert.equal(reassembleShards(null), '');
    assert.equal(reassembleShards([]), '');
  });

  it('should return content for single shard', () => {
    const shards = [{ index: 0, content: 'hello', startOffset: 0, endOffset: 5 }];
    assert.equal(reassembleShards(shards), 'hello');
  });

  it('should reassemble shards in correct order regardless of input order', () => {
    const shards = [
      { index: 1, content: 'world', startOffset: 5, endOffset: 10 },
      { index: 0, content: 'hello', startOffset: 0, endOffset: 5 },
    ];
    const result = reassembleShards(shards);
    assert.ok(result.includes('hello'));
    assert.ok(result.includes('world'));
  });

  it('should handle non-overlapping shards', () => {
    const shards = [
      { index: 0, content: 'AAA', startOffset: 0, endOffset: 3 },
      { index: 1, content: 'BBB', startOffset: 3, endOffset: 6 },
    ];
    assert.equal(reassembleShards(shards), 'AAABBB');
  });
});

// ---------------------------------------------------------------------------
// getShardForSection
// ---------------------------------------------------------------------------

describe('getShardForSection', () => {
  it('should return null for null inputs', () => {
    assert.equal(getShardForSection(null, 'test'), null);
    assert.equal(getShardForSection([], null), null);
  });

  it('should find shard containing a section', () => {
    const shards = [
      { index: 0, sections: ['Introduction', 'Background'] },
      { index: 1, sections: ['Implementation', 'Testing'] },
      { index: 2, sections: ['Deployment', 'Monitoring'] },
    ];

    const result = getShardForSection(shards, 'Implementation');
    assert.equal(result.index, 1);
  });

  it('should match case-insensitively', () => {
    const shards = [
      { index: 0, sections: ['API Reference'] },
    ];

    const result = getShardForSection(shards, 'api reference');
    assert.equal(result.index, 0);
  });

  it('should match partial section names', () => {
    const shards = [
      { index: 0, sections: ['User Authentication Flow'] },
    ];

    const result = getShardForSection(shards, 'Authentication');
    assert.equal(result.index, 0);
  });

  it('should return null when section not found', () => {
    const shards = [
      { index: 0, sections: ['Introduction'] },
    ];

    assert.equal(getShardForSection(shards, 'NonExistent'), null);
  });
});
