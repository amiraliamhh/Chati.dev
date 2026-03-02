/**
 * @fileoverview Semantic merge engine for parallel agent outputs.
 *
 * Detects file-level, import, and naming conflicts between
 * changes produced by concurrent agents, and applies merge
 * strategies (conservative or latest-wins).
 *
 * Constitution Protocol 5 — Two-Layer Handoff.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Conflict type identifiers. */
export const CONFLICT_TYPES = {
  FILE_OVERLAP: 'file_overlap',
  IMPORT_CONFLICT: 'import_conflict',
  NAMING_CONFLICT: 'naming_conflict',
  STRUCTURAL_CONFLICT: 'structural_conflict',
};

/** Merge strategy options. */
export const MERGE_STRATEGIES = {
  CONSERVATIVE: 'conservative',
  LATEST: 'latest',
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * @typedef {object} Change
 * @property {string} agent - Agent name that produced the change
 * @property {string} file - File path affected
 * @property {string} [content] - New content (for full-file changes)
 * @property {string[]} [imports] - Import statements added
 * @property {string[]} [exports] - Export names added
 * @property {string} [timestamp] - ISO timestamp of the change
 */

/**
 * @typedef {object} Conflict
 * @property {string} type - Conflict type (from CONFLICT_TYPES)
 * @property {string} file - File involved
 * @property {string[]} agents - Agents that conflict
 * @property {string} description - Human-readable description
 * @property {string} severity - 'error' | 'warning'
 */

/**
 * Detect conflicts between a set of changes from different agents.
 *
 * @param {Change[]} changes
 * @returns {{ hasConflicts: boolean, conflicts: Conflict[] }}
 */
export function detectConflicts(changes) {
  if (!Array.isArray(changes) || changes.length < 2) {
    return { hasConflicts: false, conflicts: [] };
  }

  const conflicts = [];

  // 1. File overlap detection — multiple agents changing same file
  const fileAgentMap = groupByFile(changes);
  for (const [file, agentChanges] of fileAgentMap.entries()) {
    const agents = [...new Set(agentChanges.map(c => c.agent))];
    if (agents.length > 1) {
      conflicts.push({
        type: CONFLICT_TYPES.FILE_OVERLAP,
        file,
        agents,
        description: `Multiple agents (${agents.join(', ')}) modified ${file}`,
        severity: 'error',
      });
    }
  }

  // 2. Import conflict detection — duplicate or contradictory imports
  const importsByFile = new Map();
  for (const change of changes) {
    if (!change.imports || change.imports.length === 0) continue;
    if (!importsByFile.has(change.file)) {
      importsByFile.set(change.file, []);
    }
    importsByFile.get(change.file).push({ agent: change.agent, imports: change.imports });
  }

  for (const [file, importSets] of importsByFile.entries()) {
    if (importSets.length < 2) continue;

    // Check for duplicate imports from different agents
    const allImports = new Map();
    for (const { agent, imports } of importSets) {
      for (const imp of imports) {
        const normalized = normalizeImport(imp);
        if (allImports.has(normalized)) {
          const existing = allImports.get(normalized);
          if (existing.agent !== agent) {
            conflicts.push({
              type: CONFLICT_TYPES.IMPORT_CONFLICT,
              file,
              agents: [existing.agent, agent],
              description: `Duplicate import "${normalized}" from agents ${existing.agent} and ${agent}`,
              severity: 'warning',
            });
          }
        } else {
          allImports.set(normalized, { agent, raw: imp });
        }
      }
    }
  }

  // 3. Naming conflict detection — same export name from different agents
  const exportsByName = new Map();
  for (const change of changes) {
    if (!change.exports || change.exports.length === 0) continue;
    for (const exp of change.exports) {
      if (!exportsByName.has(exp)) {
        exportsByName.set(exp, []);
      }
      exportsByName.get(exp).push({ agent: change.agent, file: change.file });
    }
  }

  for (const [name, sources] of exportsByName.entries()) {
    const uniqueAgents = [...new Set(sources.map(s => s.agent))];
    if (uniqueAgents.length > 1) {
      const files = [...new Set(sources.map(s => s.file))];
      conflicts.push({
        type: CONFLICT_TYPES.NAMING_CONFLICT,
        file: files[0],
        agents: uniqueAgents,
        description: `Export name "${name}" defined by multiple agents: ${uniqueAgents.join(', ')}`,
        severity: 'error',
      });
    }
  }

  return {
    hasConflicts: conflicts.length > 0,
    conflicts,
  };
}

/**
 * Merge changes from multiple agents using a strategy.
 *
 * @param {Change[]} changes
 * @param {string} [strategy='conservative'] - Merge strategy
 * @returns {{ merged: Change[], skipped: Change[], strategy: string }}
 */
export function mergeChanges(changes, strategy = MERGE_STRATEGIES.CONSERVATIVE) {
  if (!Array.isArray(changes) || changes.length === 0) {
    return { merged: [], skipped: [], strategy };
  }

  if (changes.length === 1) {
    return { merged: [...changes], skipped: [], strategy };
  }

  const fileAgentMap = groupByFile(changes);
  const merged = [];
  const skipped = [];

  for (const [file, agentChanges] of fileAgentMap.entries()) {
    const agents = [...new Set(agentChanges.map(c => c.agent))];

    if (agents.length === 1) {
      // No conflict — include all changes for this file
      merged.push(...agentChanges);
      continue;
    }

    // Conflict resolution based on strategy
    if (strategy === MERGE_STRATEGIES.LATEST) {
      // Latest wins — sort by timestamp, take the most recent
      const sorted = [...agentChanges].sort((a, b) => {
        const tA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const tB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return tB - tA;
      });
      merged.push(sorted[0]);
      skipped.push(...sorted.slice(1));
    } else {
      // Conservative — keep the first agent's changes, skip later ones
      const sorted = [...agentChanges].sort((a, b) => {
        const tA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const tB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return tA - tB;
      });
      merged.push(sorted[0]);
      skipped.push(...sorted.slice(1));
    }
  }

  return { merged, skipped, strategy };
}

/**
 * Validate that a merged result is structurally sound.
 *
 * @param {string} original - Original file content
 * @param {string} merged - Merged file content
 * @returns {{ valid: boolean, issues: string[] }}
 */
export function validateMergedResult(original, merged) {
  const issues = [];

  if (!merged || typeof merged !== 'string') {
    issues.push('Merged content is empty or not a string');
    return { valid: false, issues };
  }

  // Check for obvious syntax issues

  // 1. Balanced braces
  const openBraces = (merged.match(/\{/g) || []).length;
  const closeBraces = (merged.match(/\}/g) || []).length;
  if (openBraces !== closeBraces) {
    issues.push(`Unbalanced braces: ${openBraces} open, ${closeBraces} close`);
  }

  // 2. Balanced parentheses
  const openParens = (merged.match(/\(/g) || []).length;
  const closeParens = (merged.match(/\)/g) || []).length;
  if (openParens !== closeParens) {
    issues.push(`Unbalanced parentheses: ${openParens} open, ${closeParens} close`);
  }

  // 3. Balanced brackets
  const openBrackets = (merged.match(/\[/g) || []).length;
  const closeBrackets = (merged.match(/\]/g) || []).length;
  if (openBrackets !== closeBrackets) {
    issues.push(`Unbalanced brackets: ${openBrackets} open, ${closeBrackets} close`);
  }

  // 4. Check that imports haven't been duplicated
  const importLines = merged.match(/^import\s+.+$/gm) || [];
  const normalizedImports = importLines.map(normalizeImport);
  const uniqueImports = new Set(normalizedImports);
  if (uniqueImports.size < normalizedImports.length) {
    issues.push(`Duplicate imports detected (${normalizedImports.length - uniqueImports.size} duplicates)`);
  }

  // 5. Check content wasn't completely destroyed
  if (original && merged.length < original.length * 0.5) {
    issues.push('Merged content is less than 50% of original size — possible data loss');
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Group changes by file path.
 *
 * @param {Change[]} changes
 * @returns {Map<string, Change[]>}
 */
function groupByFile(changes) {
  const map = new Map();
  for (const change of changes) {
    if (!change.file) continue;
    if (!map.has(change.file)) {
      map.set(change.file, []);
    }
    map.get(change.file).push(change);
  }
  return map;
}

/**
 * Normalize an import statement for comparison.
 *
 * @param {string} importStr
 * @returns {string}
 */
function normalizeImport(importStr) {
  return importStr
    .replace(/['"]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
