/**
 * Tests for decision/analyzer.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';
import {
  analyzeImpact,
  buildDependencyGraph,
  getTransitiveDependents,
  scoreDecision,
} from '../../src/decision/analyzer.js';

const TEST_DIR = join(import.meta.dirname, '../../tmp/test-analyzer');

function setupTestProject() {
  rmSync(TEST_DIR, { recursive: true, force: true });
  mkdirSync(TEST_DIR, { recursive: true });
  mkdirSync(join(TEST_DIR, 'chati.dev'), { recursive: true });

  // Create mock entity registry with dependencies
  const registry = {
    metadata: {
      version: '1.0',
      entity_count: 5,
      last_updated: new Date().toISOString()
    },
    entities: {
      schema: [
        {
          name: 'base-schema',
          path: 'chati.dev/schemas/base-schema.md',
          keywords: ['schema', 'base'],
          dependencies: []
        }
      ],
      domain: [
        {
          name: 'user-domain',
          path: 'chati.dev/domains/user-domain.md',
          keywords: ['user', 'domain'],
          dependencies: ['chati.dev/schemas/base-schema.md']
        },
        {
          name: 'project-domain',
          path: 'chati.dev/domains/project-domain.md',
          keywords: ['project', 'domain'],
          dependencies: ['chati.dev/schemas/base-schema.md']
        }
      ],
      agent: [
        {
          name: 'dev',
          path: 'chati.dev/agents/dev.md',
          keywords: ['development'],
          dependencies: [
            'chati.dev/domains/user-domain.md',
            'chati.dev/domains/project-domain.md'
          ]
        },
        {
          name: 'qa',
          path: 'chati.dev/agents/qa.md',
          keywords: ['quality'],
          dependencies: ['chati.dev/agents/dev.md']
        }
      ]
    }
  };

  writeFileSync(
    join(TEST_DIR, 'chati.dev', 'entity-registry.yaml'),
    yaml.dump(registry),
    'utf8'
  );
}

function cleanupTestProject() {
  rmSync(TEST_DIR, { recursive: true, force: true });
}

test('buildDependencyGraph', () => {
  setupTestProject();

  const graph = buildDependencyGraph(TEST_DIR);

  // Base schema is depended on by user-domain and project-domain
  assert.ok(graph.has('chati.dev/schemas/base-schema.md'));
  const baseDeps = graph.get('chati.dev/schemas/base-schema.md');
  assert.equal(baseDeps.length, 2);
  assert.ok(baseDeps.includes('chati.dev/domains/user-domain.md'));
  assert.ok(baseDeps.includes('chati.dev/domains/project-domain.md'));

  // User domain is depended on by dev agent
  const userDomainDeps = graph.get('chati.dev/domains/user-domain.md');
  assert.ok(userDomainDeps.includes('chati.dev/agents/dev.md'));

  cleanupTestProject();
});

test('getTransitiveDependents - single level', () => {
  const graph = new Map([
    ['A', ['B', 'C']],
    ['B', []],
    ['C', []]
  ]);

  const dependents = getTransitiveDependents(graph, 'A');

  assert.equal(dependents.length, 2);
  assert.ok(dependents.includes('B'));
  assert.ok(dependents.includes('C'));
});

test('getTransitiveDependents - multiple levels', () => {
  const graph = new Map([
    ['A', ['B']],
    ['B', ['C']],
    ['C', ['D']],
    ['D', []]
  ]);

  const dependents = getTransitiveDependents(graph, 'A');

  assert.equal(dependents.length, 3);
  assert.ok(dependents.includes('B'));
  assert.ok(dependents.includes('C'));
  assert.ok(dependents.includes('D'));
});

test('getTransitiveDependents - no dependents', () => {
  const graph = new Map([
    ['A', []],
    ['B', []]
  ]);

  const dependents = getTransitiveDependents(graph, 'A');

  assert.equal(dependents.length, 0);
});

test('analyzeImpact - low impact (0-2 affected)', () => {
  setupTestProject();

  const result = analyzeImpact(
    TEST_DIR,
    'chati.dev/domains/user-domain.md'
  );

  assert.equal(result.impactLevel, 'low');
  assert.ok(result.affectedEntities.length <= 2);
  assert.ok(result.dependencyChain.includes('chati.dev/agents/dev.md'));

  cleanupTestProject();
});

test('analyzeImpact - medium impact (3-5 affected)', () => {
  setupTestProject();

  const result = analyzeImpact(
    TEST_DIR,
    'chati.dev/schemas/base-schema.md'
  );

  // Base schema affects: user-domain, project-domain, dev, qa
  assert.ok(['medium', 'high'].includes(result.impactLevel));
  assert.ok(result.affectedEntities.length >= 3);

  cleanupTestProject();
});

test('analyzeImpact - no dependencies', () => {
  setupTestProject();

  const result = analyzeImpact(
    TEST_DIR,
    'chati.dev/agents/qa.md'
  );

  assert.equal(result.impactLevel, 'low');
  assert.equal(result.affectedEntities.length, 0);

  cleanupTestProject();
});

test('analyzeImpact - no registry', () => {
  rmSync(TEST_DIR, { recursive: true, force: true });
  mkdirSync(TEST_DIR, { recursive: true });

  const result = analyzeImpact(TEST_DIR, 'some/path.md');

  assert.equal(result.impactLevel, 'low');
  assert.equal(result.affectedEntities.length, 0);

  cleanupTestProject();
});

test('analyzeImpact - returns entity details', () => {
  setupTestProject();

  const result = analyzeImpact(
    TEST_DIR,
    'chati.dev/domains/user-domain.md'
  );

  assert.ok(result.affectedEntities.length > 0);
  result.affectedEntities.forEach(entity => {
    assert.ok(entity.path);
    assert.ok(entity.type);
    assert.ok(entity.name);
  });

  cleanupTestProject();
});

// ---------------------------------------------------------------------------
// scoreDecision — TF-IDF scoring
// ---------------------------------------------------------------------------

test('scoreDecision - returns zero for null option', () => {
  const result = scoreDecision(null);
  assert.equal(result.score, 0);
  assert.equal(result.alignment, 0);
});

test('scoreDecision - returns zero for option without name', () => {
  const result = scoreDecision({});
  assert.equal(result.score, 0);
});

test('scoreDecision - scores alignment with matching requirements', () => {
  const option = {
    name: 'REST API with authentication',
    description: 'Build a REST API using Express with JWT authentication',
    keywords: ['api', 'rest', 'auth', 'jwt'],
  };
  const context = {
    requirements: [
      'User authentication with JWT tokens',
      'REST API endpoints for CRUD operations',
      'Role-based access control',
    ],
  };

  const result = scoreDecision(option, context);
  assert.ok(result.alignment > 0, `Expected positive alignment, got ${result.alignment}`);
  assert.ok(result.score > 0, `Expected positive score, got ${result.score}`);
});

test('scoreDecision - low alignment for non-matching option', () => {
  const option = {
    name: 'GraphQL with subscriptions',
    description: 'Real-time GraphQL API with WebSocket subscriptions',
    keywords: ['graphql', 'websocket', 'subscriptions'],
  };
  const context = {
    requirements: [
      'File upload service',
      'Image compression pipeline',
      'CDN integration',
    ],
  };

  const result = scoreDecision(option, context);
  // Should have lower alignment since keywords don't match
  assert.ok(result.score <= 0.7, `Expected lower score for non-matching, got ${result.score}`);
});

test('scoreDecision - penalizes complexity', () => {
  const simple = scoreDecision(
    { name: 'Simple REST API', description: 'Monolithic REST API' },
    { requirements: ['Build an API'] }
  );
  const complex = scoreDecision(
    { name: 'Distributed microservice', description: 'Distributed multi-tenant microservice with real-time' },
    { requirements: ['Build an API'] }
  );

  assert.ok(simple.complexity >= complex.complexity,
    `Simple (${simple.complexity}) should have higher complexity score than complex (${complex.complexity})`);
});

test('scoreDecision - rewards reuse with existing entities', () => {
  const option = {
    name: 'Extend user service',
    description: 'Add profile features to existing user service',
    keywords: ['user', 'service', 'profile'],
  };
  const context = {
    requirements: ['Add user profiles'],
    existingEntities: ['src/services/user-service.js', 'src/models/user.js'],
  };

  const result = scoreDecision(option, context);
  assert.ok(result.reuse > 0, `Expected positive reuse score, got ${result.reuse}`);
});

test('scoreDecision - includes breakdown', () => {
  const result = scoreDecision(
    { name: 'Test option' },
    { requirements: ['Test requirement'] }
  );

  assert.ok(result.breakdown);
  assert.ok(result.breakdown.alignment);
  assert.equal(result.breakdown.alignment.weight, 0.4);
  assert.equal(result.breakdown.complexity.weight, 0.2);
  assert.equal(result.breakdown.reuse.weight, 0.25);
  assert.equal(result.breakdown.constraints.weight, 0.15);
});

test('scoreDecision - considers constraints', () => {
  const option = {
    name: 'PostgreSQL database with TypeScript ORM',
    description: 'Use PostgreSQL with Prisma ORM in TypeScript',
    keywords: ['postgresql', 'prisma', 'typescript'],
  };
  const context = {
    requirements: ['Data persistence'],
    constraints: ['Must use TypeScript', 'PostgreSQL required'],
  };

  const result = scoreDecision(option, context);
  assert.ok(result.score > 0);
});
