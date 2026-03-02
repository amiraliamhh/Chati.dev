/**
 * @fileoverview Document sharding for large PRDs and specifications.
 *
 * Splits large documents into manageable shards while respecting
 * heading boundaries and providing overlap for context continuity.
 *
 * Constitution Article XII — Context Bracket Management.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default maximum shard size in characters (~2K tokens). */
const DEFAULT_MAX_SHARD_SIZE = 8_000;

/** Overlap characters between shards for context continuity. */
const DEFAULT_OVERLAP = 800;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * @typedef {object} Shard
 * @property {number} index - Shard index (0-based)
 * @property {string} content - Shard content
 * @property {string[]} sections - Section headings in this shard
 * @property {number} startOffset - Character offset in original document
 * @property {number} endOffset - End character offset
 * @property {boolean} hasOverlap - Whether this shard has overlap from previous
 */

/**
 * Split a document into shards, respecting heading boundaries.
 *
 * @param {string} content - Full document content
 * @param {{ maxShardSize?: number, overlap?: number }} [options={}]
 * @returns {Shard[]}
 */
export function shardDocument(content, options = {}) {
  if (!content || typeof content !== 'string') {
    return [];
  }

  const maxSize = options.maxShardSize || DEFAULT_MAX_SHARD_SIZE;
  const overlap = options.overlap || DEFAULT_OVERLAP;

  // If content fits in one shard, return as-is
  if (content.length <= maxSize) {
    return [{
      index: 0,
      content,
      sections: extractSections(content),
      startOffset: 0,
      endOffset: content.length,
      hasOverlap: false,
    }];
  }

  // Find heading boundaries (## or # markers)
  const headingPattern = /^#{1,3}\s+.+$/gm;
  const headings = [];
  let match;

  while ((match = headingPattern.exec(content)) !== null) {
    headings.push({ offset: match.index, text: match[0].trim() });
  }

  // Build shards at heading boundaries
  const shards = [];
  let currentStart = 0;

  while (currentStart < content.length) {
    let endPos = currentStart + maxSize;

    if (endPos >= content.length) {
      // Last shard
      endPos = content.length;
    } else {
      // Find the best heading boundary to split at
      const bestBreak = findBestBreak(headings, currentStart, endPos);
      if (bestBreak > currentStart) {
        endPos = bestBreak;
      } else {
        // No heading found — break at paragraph boundary
        const paragraphBreak = content.lastIndexOf('\n\n', endPos);
        if (paragraphBreak > currentStart) {
          endPos = paragraphBreak;
        }
      }
    }

    const shardContent = content.slice(currentStart, endPos);
    const hasOverlap = currentStart > 0;

    shards.push({
      index: shards.length,
      content: shardContent,
      sections: extractSections(shardContent),
      startOffset: currentStart,
      endOffset: endPos,
      hasOverlap,
    });

    // Advance with overlap
    currentStart = Math.max(currentStart + 1, endPos - overlap);
  }

  return shards;
}

/**
 * Reassemble shards back into a document, removing overlaps.
 *
 * @param {Shard[]} shards
 * @returns {string}
 */
export function reassembleShards(shards) {
  if (!shards || shards.length === 0) return '';
  if (shards.length === 1) return shards[0].content;

  // Sort by index
  const sorted = [...shards].sort((a, b) => a.index - b.index);

  // Use non-overlapping portions
  const parts = [];
  for (let i = 0; i < sorted.length; i++) {
    const shard = sorted[i];
    if (i === 0) {
      // First shard: use everything up to where next shard's unique content starts
      if (sorted.length > 1) {
        const nextStart = sorted[1].startOffset;
        const overlapStart = shard.endOffset - nextStart;
        if (overlapStart > 0) {
          parts.push(shard.content.slice(0, shard.content.length - overlapStart));
        } else {
          parts.push(shard.content);
        }
      } else {
        parts.push(shard.content);
      }
    } else if (i === sorted.length - 1) {
      // Last shard: use from overlap end to end
      const prevEnd = sorted[i - 1].endOffset;
      const overlapLength = prevEnd - shard.startOffset;
      if (overlapLength > 0) {
        parts.push(shard.content.slice(overlapLength));
      } else {
        parts.push(shard.content);
      }
    } else {
      // Middle shard: use from overlap end to before next shard's overlap
      const prevEnd = sorted[i - 1].endOffset;
      const startOverlap = prevEnd - shard.startOffset;
      const nextStart = sorted[i + 1].startOffset;
      const endOverlap = shard.endOffset - nextStart;

      const start = Math.max(0, startOverlap);
      const end = endOverlap > 0 ? shard.content.length - endOverlap : shard.content.length;
      parts.push(shard.content.slice(start, end));
    }
  }

  return parts.join('');
}

/**
 * Find the shard containing a specific section heading.
 *
 * @param {Shard[]} shards
 * @param {string} sectionName - Heading text to find (partial match)
 * @returns {Shard|null}
 */
export function getShardForSection(shards, sectionName) {
  if (!shards || !sectionName) return null;

  const lower = sectionName.toLowerCase();
  return shards.find(shard =>
    shard.sections.some(s => s.toLowerCase().includes(lower))
  ) || null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Find the best heading boundary to break at within a range.
 *
 * @param {{ offset: number, text: string }[]} headings
 * @param {number} start
 * @param {number} end
 * @returns {number} Offset of best break point, or 0 if none found
 */
function findBestBreak(headings, start, end) {
  // Find the last heading that starts before end and after start
  let bestOffset = 0;
  for (const heading of headings) {
    if (heading.offset > start && heading.offset <= end) {
      bestOffset = heading.offset;
    }
  }
  return bestOffset;
}

/**
 * Extract section headings from content.
 *
 * @param {string} content
 * @returns {string[]}
 */
function extractSections(content) {
  const headings = content.match(/^#{1,3}\s+.+$/gm) || [];
  return headings.map(h => h.replace(/^#+\s+/, '').trim());
}

/**
 * Exported constants for testing.
 */
export { DEFAULT_MAX_SHARD_SIZE, DEFAULT_OVERLAP };
