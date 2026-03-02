/**
 * Impact Analyzer - Dependency analysis for chati.dev
 * Analyzes impact of changes via dependency graph traversal
 *
 * @module decision/analyzer
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';

/**
 * Analyze impact of changing an entity.
 * Builds dependency graph from entity-registry and calculates affected entities.
 *
 * @param {string} projectDir
 * @param {string} entityPath - Path of entity being changed
 * @returns {{ impactLevel: 'low'|'medium'|'high'|'critical', affectedEntities: object[], dependencyChain: string[] }}
 */
export function analyzeImpact(projectDir, entityPath) {
  const graph = buildDependencyGraph(projectDir);
  const affectedPaths = getTransitiveDependents(graph, entityPath);

  // Determine impact level based on affected entity count
  let impactLevel;
  const affectedCount = affectedPaths.length;

  if (affectedCount === 0) {
    impactLevel = 'low';
  } else if (affectedCount <= 2) {
    impactLevel = 'low';
  } else if (affectedCount <= 5) {
    impactLevel = 'medium';
  } else if (affectedCount <= 10) {
    impactLevel = 'high';
  } else {
    impactLevel = 'critical';
  }

  // Load entity details
  const registryPath = join(projectDir, 'chati.dev', 'entity-registry.yaml');
  const registry = existsSync(registryPath)
    ? yaml.load(readFileSync(registryPath, 'utf8'))
    : { entities: {} };

  const allEntities = flattenEntities(registry);
  const entityMap = new Map(allEntities.map(e => [e.path, e]));

  const affectedEntities = affectedPaths.map(path => {
    const entity = entityMap.get(path);
    return {
      path,
      type: entity?.type || 'unknown',
      name: entity?.name || path.split('/').pop()
    };
  });

  return {
    impactLevel,
    affectedEntities,
    dependencyChain: affectedPaths
  };
}

/**
 * Build dependency graph from entity registry.
 * @param {string} projectDir
 * @returns {Map<string, string[]>} Map of entityPath -> [dependentPaths]
 */
export function buildDependencyGraph(projectDir) {
  const registryPath = join(projectDir, 'chati.dev', 'entity-registry.yaml');
  const graph = new Map();

  if (!existsSync(registryPath)) {
    return graph;
  }

  const registry = yaml.load(readFileSync(registryPath, 'utf8'));
  const entities = flattenEntities(registry);

  // Initialize graph with all entities
  entities.forEach(entity => {
    if (entity.path) {
      graph.set(entity.path, []);
    }
  });

  // Build reverse dependency map (who depends on whom)
  entities.forEach(entity => {
    if (entity.dependencies && Array.isArray(entity.dependencies)) {
      entity.dependencies.forEach(depPath => {
        if (!graph.has(depPath)) {
          graph.set(depPath, []);
        }
        // Add entity.path as dependent of depPath
        const dependents = graph.get(depPath);
        if (!dependents.includes(entity.path)) {
          dependents.push(entity.path);
        }
      });
    }
  });

  return graph;
}

/**
 * Get all entities that depend on a given entity (transitive).
 * Uses BFS traversal.
 * @param {Map<string, string[]>} graph
 * @param {string} entityPath
 * @returns {string[]} All affected paths
 */
export function getTransitiveDependents(graph, entityPath) {
  const visited = new Set();
  const queue = [entityPath];
  const result = [];

  while (queue.length > 0) {
    const current = queue.shift();

    if (visited.has(current)) {
      continue;
    }

    visited.add(current);

    // Get direct dependents
    const dependents = graph.get(current) || [];

    dependents.forEach(dependent => {
      if (!visited.has(dependent)) {
        queue.push(dependent);
        result.push(dependent);
      }
    });
  }

  return result;
}

/**
 * Score a decision option based on multiple criteria using TF-IDF-inspired
 * keyword relevance scoring.
 *
 * @param {{ name: string, description?: string, keywords?: string[] }} option
 * @param {{ requirements?: string[], constraints?: string[], existingEntities?: string[] }} context
 * @returns {{ score: number, alignment: number, complexity: number, reuse: number, breakdown: object }}
 */
export function scoreDecision(option, context = {}) {
  if (!option || !option.name) {
    return { score: 0, alignment: 0, complexity: 0, reuse: 0, breakdown: {} };
  }

  const requirements = context.requirements || [];
  const constraints = context.constraints || [];
  const existingEntities = context.existingEntities || [];

  // 1. Alignment score — how well does option match requirements?
  const optionText = `${option.name} ${option.description || ''} ${(option.keywords || []).join(' ')}`.toLowerCase();
  const alignment = computeRelevance(optionText, requirements);

  // 2. Complexity score (inverse — lower complexity = higher score)
  const complexitySignals = ['microservice', 'distributed', 'multi-tenant', 'real-time', 'concurrent', 'migration'];
  let complexityCount = 0;
  for (const signal of complexitySignals) {
    if (optionText.includes(signal)) {
      complexityCount++;
    }
  }
  const complexity = Math.max(0, 1 - complexityCount * 0.15);

  // 3. Reuse score — overlap with existing entities (decision priority: REUSE > ADAPT > CREATE)
  let reuse = 0;
  if (existingEntities.length > 0) {
    const optionWords = new Set(optionText.split(/\s+/));
    let matchCount = 0;
    for (const entity of existingEntities) {
      const entityWords = entity.toLowerCase().split(/[\s/.-]+/);
      for (const word of entityWords) {
        if (word.length > 3 && optionWords.has(word)) {
          matchCount++;
          break;
        }
      }
    }
    reuse = existingEntities.length > 0 ? matchCount / existingEntities.length : 0;
  }

  // 4. Constraint satisfaction
  let constraintScore = 1;
  if (constraints.length > 0) {
    let satisfied = 0;
    for (const constraint of constraints) {
      const constraintWords = constraint.toLowerCase().split(/\s+/);
      const hasMatch = constraintWords.some(w => w.length > 3 && optionText.includes(w));
      if (hasMatch) satisfied++;
    }
    constraintScore = constraints.length > 0 ? satisfied / constraints.length : 1;
  }

  // Weighted final score
  const score = Math.round(
    (alignment * 0.4 + complexity * 0.2 + reuse * 0.25 + constraintScore * 0.15) * 100
  ) / 100;

  return {
    score,
    alignment: Math.round(alignment * 100) / 100,
    complexity: Math.round(complexity * 100) / 100,
    reuse: Math.round(reuse * 100) / 100,
    breakdown: {
      alignment: { weight: 0.4, raw: alignment },
      complexity: { weight: 0.2, raw: complexity },
      reuse: { weight: 0.25, raw: reuse },
      constraints: { weight: 0.15, raw: constraintScore },
    },
  };
}

// ---------------------------------------------------------------------------
// TF-IDF Helpers
// ---------------------------------------------------------------------------

/**
 * Compute TF-IDF-inspired relevance between text and a set of documents.
 *
 * @param {string} text - Source text
 * @param {string[]} documents - Reference documents (requirements, etc.)
 * @returns {number} Relevance score (0-1)
 */
function computeRelevance(text, documents) {
  if (!text || documents.length === 0) return 0;

  const textWords = tokenize(text);
  if (textWords.length === 0) return 0;

  // Build document frequency map
  const docCount = documents.length;
  const df = new Map();

  for (const doc of documents) {
    const words = new Set(tokenize(doc.toLowerCase()));
    for (const word of words) {
      df.set(word, (df.get(word) || 0) + 1);
    }
  }

  // Calculate TF-IDF score for each text word
  const textWordSet = new Set(textWords);
  let totalScore = 0;

  for (const word of textWordSet) {
    const termFreq = textWords.filter(w => w === word).length / textWords.length;
    const docFreq = df.get(word) || 0;

    if (docFreq > 0) {
      // IDF = log(N / df) — boost rare terms
      const idf = Math.log((docCount + 1) / (docFreq + 1)) + 1;
      totalScore += termFreq * idf;
    }
  }

  // Normalize to 0-1 range
  const maxPossible = Math.log(docCount + 1) + 1;
  return maxPossible > 0 ? Math.min(totalScore / maxPossible, 1) : 0;
}

/**
 * Tokenize text into meaningful words (skip stopwords and short tokens).
 *
 * @param {string} text
 * @returns {string[]}
 */
function tokenize(text) {
  const stopwords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'shall', 'can', 'this', 'that', 'these',
    'those', 'it', 'its', 'not', 'no', 'from', 'as', 'into', 'all',
  ]);

  return text
    .toLowerCase()
    .split(/[\s,.;:!?()[\]{}"'`/\\-]+/)
    .filter(w => w.length > 2 && !stopwords.has(w));
}

/**
 * Flatten entity registry into array of entities.
 * @private
 * @param {object} registry
 * @returns {object[]}
 */
function flattenEntities(registry) {
  const entities = [];

  if (!registry.entities) {
    return entities;
  }

  Object.entries(registry.entities).forEach(([type, typeEntities]) => {
    if (Array.isArray(typeEntities)) {
      typeEntities.forEach(entity => {
        entities.push({
          ...entity,
          type
        });
      });
    }
  });

  return entities;
}
