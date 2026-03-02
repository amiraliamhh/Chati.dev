/**
 * Session Manager — Complete session lifecycle management.
 *
 * Manages session initialization, state updates, mode transitions,
 * agent completions, and session validation for the Chati.dev pipeline.
 */

import yaml from 'js-yaml';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

const SESSION_FILE = '.chati/session.yaml';

/**
 * Default session template.
 */
const CURRENT_SCHEMA_VERSION = '1.0';

const DEFAULT_SESSION = {
  schema_version: CURRENT_SCHEMA_VERSION,
  version: '1.0',
  mode: 'discover',
  project: { name: '', type: 'greenfield', state: 'discover' },
  language: 'en',
  project_type: 'greenfield',
  started_at: null,
  current_agent: '',
  pipeline_position: 0,
  execution_mode: 'interactive',
  user_level: 'auto',
  user_level_confidence: 0.0,
  ides: [],
  mcps: [],
  completed_agents: [],
  agent_results: {},
  mode_transitions: [],
  deviations: [],
  agents: {
    'greenfield-wu': { status: 'pending', score: 0, criteria_count: 0, completed_at: null },
    'brownfield-wu': { status: 'pending', score: 0, criteria_count: 0, completed_at: null },
    'brief': { status: 'pending', score: 0, criteria_count: 0, completed_at: null },
    'detail': { status: 'pending', score: 0, criteria_count: 0, completed_at: null },
    'architect': { status: 'pending', score: 0, criteria_count: 0, completed_at: null },
    'ux': { status: 'pending', score: 0, criteria_count: 0, completed_at: null },
    'phases': { status: 'pending', score: 0, criteria_count: 0, completed_at: null },
    'tasks': { status: 'pending', score: 0, criteria_count: 0, completed_at: null },
    'qa-planning': { status: 'pending', score: 0, criteria_count: 0, completed_at: null },
    'dev': { status: 'pending', score: 0, criteria_count: 0, completed_at: null },
    'qa-implementation': { status: 'pending', score: 0, criteria_count: 0, completed_at: null },
    'devops': { status: 'pending', score: 0, criteria_count: 0, completed_at: null },
  },
  backlog: [],
  last_handoff: '',
};

/**
 * Initialize a new session.
 * @param {string} projectDir
 * @param {object} options - { mode, isGreenfield, language }
 * @returns {{ created: boolean, session: object, path: string }}
 */
export function initSession(projectDir, options = {}) {
  const sessionPath = join(projectDir, SESSION_FILE);
  const dir = dirname(sessionPath);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const session = {
    ...DEFAULT_SESSION,
    mode: options.mode || 'discover',
    project: {
      name: options.projectName || '',
      type: options.isGreenfield === false ? 'brownfield' : 'greenfield',
      state: options.mode || 'discover',
    },
    language: options.language || 'en',
    project_type: options.isGreenfield === false ? 'brownfield' : 'greenfield',
    started_at: new Date().toISOString(),
    ides: options.ides || [],
    mcps: options.mcps || [],
  };

  try {
    const yamlContent = yaml.dump(session, {
      lineWidth: -1,
      noRefs: true,
    });

    writeFileSync(sessionPath, yamlContent, 'utf-8');

    return {
      created: true,
      session,
      path: sessionPath,
    };
  } catch (err) {
    return {
      created: false,
      session: null,
      path: sessionPath,
      error: `Failed to create session: ${err.message}`,
    };
  }
}

/**
 * Migrate a session object to the current schema version.
 *
 * @param {object} session - Session object (may be missing schema_version)
 * @returns {{ migrated: boolean, fromVersion: string|null, toVersion: string }}
 */
export function migrateSession(session) {
  if (!session || typeof session !== 'object') {
    return { migrated: false, fromVersion: null, toVersion: CURRENT_SCHEMA_VERSION };
  }

  if (session.schema_version === CURRENT_SCHEMA_VERSION) {
    return { migrated: false, fromVersion: session.schema_version, toVersion: CURRENT_SCHEMA_VERSION };
  }

  // v0 (no schema_version) → v1.0
  const fromVersion = session.schema_version || null;
  session.schema_version = CURRENT_SCHEMA_VERSION;

  // Ensure fields added in v1.0 exist
  if (!session.completed_agents) session.completed_agents = [];
  if (!session.agent_results) session.agent_results = {};
  if (!session.deviations) session.deviations = [];
  if (!session.mode_transitions) session.mode_transitions = [];

  return { migrated: true, fromVersion, toVersion: CURRENT_SCHEMA_VERSION };
}

/**
 * Load current session state.
 * @param {string} projectDir
 * @returns {{ loaded: boolean, session: object|null, error: string|null, migrated?: boolean }}
 */
export function loadSession(projectDir) {
  const sessionPath = join(projectDir, SESSION_FILE);

  if (!existsSync(sessionPath)) {
    return {
      loaded: false,
      session: null,
      error: 'Session file not found',
    };
  }

  try {
    const content = readFileSync(sessionPath, 'utf-8');
    const session = yaml.load(content);

    // Run migration if needed
    const migration = migrateSession(session);
    if (migration.migrated) {
      try {
        const yamlContent = yaml.dump(session, { lineWidth: -1, noRefs: true });
        writeFileSync(sessionPath, yamlContent, 'utf-8');
      } catch {
        // Migration write failed — continue with migrated in-memory session
      }
    }

    return {
      loaded: true,
      session,
      error: null,
      migrated: migration.migrated,
    };
  } catch (err) {
    return {
      loaded: false,
      session: null,
      error: `Failed to load session: ${err.message}`,
    };
  }
}

/**
 * Update session state (merge with existing).
 * @param {string} projectDir
 * @param {object} updates - Partial session updates
 * @returns {{ saved: boolean }}
 */
export function updateSession(projectDir, updates) {
  const sessionPath = join(projectDir, SESSION_FILE);

  // Load existing session
  const loadResult = loadSession(projectDir);

  if (!loadResult.loaded) {
    return {
      saved: false,
      error: loadResult.error,
    };
  }

  try {
    // Merge updates
    const merged = {
      ...loadResult.session,
      ...updates,
    };

    // Deep merge agents if provided
    if (updates.agents) {
      merged.agents = {
        ...loadResult.session.agents,
        ...updates.agents,
      };

      // Merge individual agent data
      for (const [agentName, agentData] of Object.entries(updates.agents)) {
        merged.agents[agentName] = {
          ...loadResult.session.agents[agentName],
          ...agentData,
        };
      }
    }

    // Write back
    const yamlContent = yaml.dump(merged, {
      lineWidth: -1,
      noRefs: true,
    });

    writeFileSync(sessionPath, yamlContent, 'utf-8');

    return {
      saved: true,
      session: merged,
    };
  } catch (err) {
    return {
      saved: false,
      error: `Failed to update session: ${err.message}`,
    };
  }
}

/**
 * Record a mode transition in session history.
 * @param {string} projectDir
 * @param {object} transition - { from, to, trigger, reason }
 * @returns {{ saved: boolean }}
 */
export function recordModeTransition(projectDir, transition) {
  const loadResult = loadSession(projectDir);

  if (!loadResult.loaded) {
    return {
      saved: false,
      error: loadResult.error,
    };
  }

  const session = loadResult.session;

  // Add transition to history
  session.mode_transitions = session.mode_transitions || [];
  session.mode_transitions.push({
    from: transition.from,
    to: transition.to,
    trigger: transition.trigger || 'manual',
    reason: transition.reason || '',
    timestamp: new Date().toISOString(),
  });

  // Update current mode (both flat and nested for compatibility)
  session.mode = transition.to;
  if (session.project) {
    session.project.state = transition.to;
  }

  return updateSession(projectDir, session);
}

/**
 * Record an agent completion in session.
 * @param {string} projectDir
 * @param {object} completion - { agent, status, score, outputs }
 * @returns {{ saved: boolean }}
 */
export function recordAgentCompletion(projectDir, completion) {
  const loadResult = loadSession(projectDir);

  if (!loadResult.loaded) {
    return {
      saved: false,
      error: loadResult.error,
    };
  }

  const session = loadResult.session;
  const { agent, status, score, outputs = [] } = completion;

  // Update agent data
  if (!session.agents[agent]) {
    session.agents[agent] = {
      status: 'pending',
      score: 0,
      criteria_count: 0,
      completed_at: null,
    };
  }

  session.agents[agent].status = status;
  session.agents[agent].score = score || 0;
  session.agents[agent].completed_at = new Date().toISOString();

  // Add to completed agents list
  session.completed_agents = session.completed_agents || [];
  if (status === 'completed' && !session.completed_agents.includes(agent)) {
    session.completed_agents.push(agent);
  }

  // Store detailed results
  session.agent_results = session.agent_results || {};
  session.agent_results[agent] = {
    status,
    score,
    outputs,
    completed_at: session.agents[agent].completed_at,
  };

  // Update last handoff
  session.last_handoff = agent;

  return updateSession(projectDir, session);
}

/**
 * Get session summary for display.
 * @param {string} projectDir
 * @returns {object} Summary with progress, mode, agents, timeline
 */
export function getSessionSummary(projectDir) {
  const loadResult = loadSession(projectDir);

  if (!loadResult.loaded) {
    return {
      error: loadResult.error,
      summary: null,
    };
  }

  const session = loadResult.session;

  // Calculate progress
  const totalAgents = Object.keys(session.agents || {}).length;
  const completedCount = (session.completed_agents || []).length;
  const progressPercent = totalAgents > 0
    ? Math.round((completedCount / totalAgents) * 100)
    : 0;

  // Get active agents
  const activeAgents = Object.entries(session.agents || {})
    .filter(([, data]) => data.status === 'in_progress')
    .map(([name]) => name);

  // Calculate duration
  let durationMs = 0;
  if (session.started_at) {
    durationMs = Date.now() - new Date(session.started_at).getTime();
  }

  const durationHours = Math.floor(durationMs / (1000 * 60 * 60));
  const durationMinutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));

  return {
    mode: session.mode,
    language: session.language,
    project_type: session.project_type,
    current_agent: session.current_agent,
    progress: {
      percent: progressPercent,
      completed: completedCount,
      total: totalAgents,
    },
    active_agents: activeAgents,
    completed_agents: session.completed_agents || [],
    duration: {
      ms: durationMs,
      hours: durationHours,
      minutes: durationMinutes,
      formatted: `${durationHours}h ${durationMinutes}m`,
    },
    mode_transitions: (session.mode_transitions || []).length,
    deviations: (session.deviations || []).length,
    started_at: session.started_at,
  };
}

// ---------------------------------------------------------------------------
// Team / Concurrent Support
// ---------------------------------------------------------------------------

/**
 * Claim session ownership for a user.
 * Prevents concurrent users from modifying the same session.
 *
 * @param {string} projectDir
 * @param {string} userId - Unique user identifier
 * @returns {{ claimed: boolean, owner?: string, since?: string, error?: string }}
 */
export function claimSession(projectDir, userId) {
  if (!projectDir || !userId) {
    return { claimed: false, error: 'projectDir and userId are required' };
  }

  const loadResult = loadSession(projectDir);

  if (!loadResult.loaded) {
    return { claimed: false, error: loadResult.error };
  }

  const session = loadResult.session;

  // Check existing ownership
  if (session._owner && session._owner.userId && session._owner.userId !== userId) {
    return {
      claimed: false,
      owner: session._owner.userId,
      since: session._owner.since,
      error: `Session already claimed by ${session._owner.userId}`,
    };
  }

  // Claim it
  const ownership = {
    userId,
    since: new Date().toISOString(),
    hostname: typeof globalThis !== 'undefined' ? (globalThis.process?.env?.HOSTNAME || 'localhost') : 'localhost',
    pid: process.pid,
  };

  const updateResult = updateSession(projectDir, { _owner: ownership });

  if (!updateResult.saved) {
    return { claimed: false, error: updateResult.error };
  }

  return { claimed: true, owner: userId, since: ownership.since };
}

/**
 * Release session ownership.
 *
 * @param {string} projectDir
 * @param {string} userId - User releasing the session
 * @returns {{ released: boolean, error?: string }}
 */
export function releaseSession(projectDir, userId) {
  if (!projectDir || !userId) {
    return { released: false, error: 'projectDir and userId are required' };
  }

  const loadResult = loadSession(projectDir);

  if (!loadResult.loaded) {
    return { released: false, error: loadResult.error };
  }

  const session = loadResult.session;

  // Only the owner can release
  if (session._owner && session._owner.userId && session._owner.userId !== userId) {
    return {
      released: false,
      error: `Cannot release: session owned by ${session._owner.userId}`,
    };
  }

  const updateResult = updateSession(projectDir, { _owner: null });

  if (!updateResult.saved) {
    return { released: false, error: updateResult.error };
  }

  return { released: true };
}

/**
 * Get current session owner information.
 *
 * @param {string} projectDir
 * @returns {{ owner: string|null, since: string|null, hostname: string|null }}
 */
export function getSessionOwner(projectDir) {
  if (!projectDir) {
    return { owner: null, since: null, hostname: null };
  }

  const loadResult = loadSession(projectDir);

  if (!loadResult.loaded || !loadResult.session._owner) {
    return { owner: null, since: null, hostname: null };
  }

  const ownership = loadResult.session._owner;

  return {
    owner: ownership.userId || null,
    since: ownership.since || null,
    hostname: ownership.hostname || null,
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Check if a session exists and is valid.
 * @param {string} projectDir
 * @returns {{ exists: boolean, valid: boolean, reason: string }}
 */
export function validateSession(projectDir) {
  const sessionPath = join(projectDir, SESSION_FILE);

  if (!existsSync(sessionPath)) {
    return {
      exists: false,
      valid: false,
      reason: 'Session file does not exist',
    };
  }

  const loadResult = loadSession(projectDir);

  if (!loadResult.loaded) {
    return {
      exists: true,
      valid: false,
      reason: loadResult.error,
    };
  }

  const session = loadResult.session;

  // Validate required fields
  const requiredFields = ['schema_version', 'version', 'mode', 'language', 'project_type', 'agents'];
  for (const field of requiredFields) {
    if (!session[field]) {
      return {
        exists: true,
        valid: false,
        reason: `Missing required field: ${field}`,
      };
    }
  }

  // Validate mode
  const validModes = ['discover', 'plan', 'build', 'validate', 'deploy', 'completed'];
  if (!validModes.includes(session.mode)) {
    return {
      exists: true,
      valid: false,
      reason: `Invalid mode: ${session.mode}`,
    };
  }

  // Validate agents structure
  if (typeof session.agents !== 'object') {
    return {
      exists: true,
      valid: false,
      reason: 'Invalid agents structure',
    };
  }

  return {
    exists: true,
    valid: true,
    reason: 'Session is valid',
  };
}
