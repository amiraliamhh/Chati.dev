/**
 * @fileoverview Advanced elicitation techniques for Brief agent.
 *
 * Provides 15 structured questioning techniques that adapt
 * to project context for deeper requirement extraction.
 *
 * Constitution Protocol 8 — Interaction Model.
 */

// ---------------------------------------------------------------------------
// Techniques
// ---------------------------------------------------------------------------

/**
 * @typedef {object} Technique
 * @property {string} id - Unique technique identifier
 * @property {string} name - Human-readable name
 * @property {string} description - When to use this technique
 * @property {string} template - Prompt template with {placeholders}
 * @property {string[]} bestFor - Context categories where this excels
 */

/**
 * All 15 elicitation techniques.
 * @type {Technique[]}
 */
export const TECHNIQUES = [
  {
    id: 'open-ended',
    name: 'Open-Ended Questions',
    description: 'Discover broad goals and motivations',
    template: 'What is the primary problem you want {project} to solve?',
    bestFor: ['greenfield', 'discovery', 'early'],
  },
  {
    id: 'closed',
    name: 'Closed Questions',
    description: 'Confirm specific decisions quickly',
    template: 'Should {feature} support {option_a} or {option_b}?',
    bestFor: ['confirmation', 'late', 'refinement'],
  },
  {
    id: 'scaling',
    name: 'Scaling Questions',
    description: 'Quantify priorities and satisfaction levels',
    template: 'On a scale of 1-10, how important is {aspect} for your project?',
    bestFor: ['prioritization', 'nfr', 'tradeoffs'],
  },
  {
    id: 'five-whys',
    name: 'Five Whys',
    description: 'Drill to root cause of requirements',
    template: 'You mentioned {requirement}. Why is that important? (And why is that? Repeat 5x)',
    bestFor: ['root-cause', 'deep-analysis', 'unclear'],
  },
  {
    id: 'scenario',
    name: 'Scenario-Based',
    description: 'Explore behavior through concrete situations',
    template: 'Imagine a user is trying to {action}. Walk me through what should happen step by step.',
    bestFor: ['user-flow', 'ux', 'behavior'],
  },
  {
    id: 'constraint',
    name: 'Constraint Analysis',
    description: 'Identify limitations and boundaries',
    template: 'What are the hard constraints for {project}? (budget, timeline, technology, team size)',
    bestFor: ['planning', 'nfr', 'feasibility'],
  },
  {
    id: 'analogy',
    name: 'Analogy Questions',
    description: 'Reference existing products for clarity',
    template: 'Is {project} more like {product_a} or {product_b}? What would you change?',
    bestFor: ['greenfield', 'vision', 'discovery'],
  },
  {
    id: 'day-in-life',
    name: 'Day in the Life',
    description: 'Understand user workflows holistically',
    template: 'Walk me through a typical day for a {persona} using {project}.',
    bestFor: ['user-research', 'ux', 'personas'],
  },
  {
    id: 'persona',
    name: 'Persona Questions',
    description: 'Define user types and their needs',
    template: 'Who are the main types of users for {project}? What does each one need most?',
    bestFor: ['user-research', 'discovery', 'early'],
  },
  {
    id: 'exception',
    name: 'Exception Questions',
    description: 'Explore edge cases and error scenarios',
    template: 'What should happen if {action} fails or produces unexpected results?',
    bestFor: ['edge-cases', 'error-handling', 'robustness'],
  },
  {
    id: 'moscow',
    name: 'MoSCoW Priority',
    description: 'Classify features by criticality',
    template: 'For the features you described, which are Must-Have, Should-Have, Could-Have, and Won\'t-Have?',
    bestFor: ['prioritization', 'planning', 'scope'],
  },
  {
    id: 'prototype',
    name: 'Prototype Questions',
    description: 'Validate UI/UX assumptions early',
    template: 'If I showed you a rough mockup of {feature}, what would you check first?',
    bestFor: ['ux', 'visual', 'validation'],
  },
  {
    id: 'acceptance',
    name: 'Acceptance Criteria',
    description: 'Define clear "done" criteria',
    template: 'How will you know {feature} is working correctly? What does success look like?',
    bestFor: ['quality', 'testing', 'refinement'],
  },
  {
    id: 'edge-case',
    name: 'Edge Case Exploration',
    description: 'Probe boundaries systematically',
    template: 'What happens when {input} is empty/null/very large/negative? How should {feature} behave?',
    bestFor: ['edge-cases', 'robustness', 'quality'],
  },
  {
    id: 'stakeholder-map',
    name: 'Stakeholder Mapping',
    description: 'Identify all parties and their interests',
    template: 'Besides end users, who else cares about {project}? (investors, ops team, regulators, partners)',
    bestFor: ['stakeholders', 'discovery', 'enterprise'],
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Select the top N most relevant techniques for a given context.
 *
 * @param {{ phase?: string, projectType?: string, keywords?: string[], userLevel?: string }} context
 * @param {number} [topN=3]
 * @returns {Technique[]}
 */
export function selectTechniques(context, topN = 3) {
  const scored = TECHNIQUES.map(technique => ({
    technique,
    score: scoreTechnique(technique, context),
  }));

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, topN).map(s => s.technique);
}

/**
 * Build a formatted elicitation prompt for a specific technique.
 *
 * @param {Technique} technique
 * @param {{ project?: string, feature?: string, action?: string, persona?: string }} projectContext
 * @returns {string}
 */
export function buildElicitationPrompt(technique, projectContext = {}) {
  let prompt = technique.template;

  // Replace placeholders with context values or generic defaults
  const defaults = {
    project: 'the project',
    feature: 'this feature',
    action: 'perform this action',
    persona: 'a typical user',
    requirement: 'this requirement',
    aspect: 'this aspect',
    input: 'the input',
    option_a: 'option A',
    option_b: 'option B',
    product_a: 'Product A',
    product_b: 'Product B',
  };

  const merged = { ...defaults, ...projectContext };

  for (const [key, value] of Object.entries(merged)) {
    prompt = prompt.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }

  return prompt;
}

/**
 * Get a technique by ID.
 *
 * @param {string} id
 * @returns {Technique|null}
 */
export function getTechnique(id) {
  return TECHNIQUES.find(t => t.id === id) || null;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * Score how relevant a technique is for a given context.
 *
 * @param {Technique} technique
 * @param {{ phase?: string, projectType?: string, keywords?: string[], userLevel?: string }} context
 * @returns {number}
 */
function scoreTechnique(technique, context) {
  let score = 0;

  // Phase matching
  if (context.phase) {
    const phaseMap = {
      discover: ['discovery', 'early', 'greenfield', 'user-research', 'vision'],
      plan: ['planning', 'prioritization', 'scope', 'tradeoffs', 'nfr', 'feasibility'],
      build: ['refinement', 'quality', 'testing', 'edge-cases', 'robustness'],
      deploy: ['confirmation', 'late', 'validation'],
    };
    const phaseKeywords = phaseMap[context.phase] || [];
    for (const kw of phaseKeywords) {
      if (technique.bestFor.includes(kw)) {
        score += 3;
      }
    }
  }

  // Project type matching
  if (context.projectType === 'greenfield' && technique.bestFor.includes('greenfield')) {
    score += 2;
  }
  if (context.projectType === 'brownfield' && technique.bestFor.includes('refinement')) {
    score += 2;
  }

  // Keyword matching
  if (context.keywords) {
    for (const kw of context.keywords) {
      if (technique.bestFor.includes(kw.toLowerCase())) {
        score += 2;
      }
      if (technique.description.toLowerCase().includes(kw.toLowerCase())) {
        score += 1;
      }
    }
  }

  // User level adjustment
  if (context.userLevel === 'beginner') {
    if (['open-ended', 'scenario', 'analogy'].includes(technique.id)) {
      score += 1; // Easier techniques for beginners
    }
  }
  if (context.userLevel === 'expert') {
    if (['five-whys', 'constraint', 'stakeholder-map'].includes(technique.id)) {
      score += 1; // More advanced for experts
    }
  }

  return score;
}
