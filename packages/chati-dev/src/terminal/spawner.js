/**
 * @fileoverview Terminal spawner for multi-agent parallel execution.
 *
 * Spawns separate Claude Code CLI processes so that multiple agents
 * can work concurrently.  The heavy lifting is split into pure,
 * testable helpers (buildSpawnCommand) and a thin runtime layer
 * (spawnTerminal) that actually calls child_process.spawn.
 */

import { spawn } from 'child_process';
import { validateWriteScopes, buildIsolationEnv } from './isolation.js';
import { getProvider } from './cli-registry.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default maximum concurrent processes when spawning in parallel. */
export const DEFAULT_CONCURRENCY = 3;

/** Patterns that indicate a transient failure (worth retrying). */
export const TRANSIENT_PATTERNS = [
  /rate limit/i, /too many requests/i, /429/, /503/,
  /timeout/i, /ECONNRESET/, /ECONNREFUSED/,
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _counter = 0;

/**
 * Generate a unique terminal identifier.
 *
 * @param {string} agent - Agent name
 * @returns {string} Unique ID in the form "agent-<timestamp>-<counter>"
 */
function generateTerminalId(agent) {
  _counter += 1;
  return `${agent}-${Date.now()}-${_counter}`;
}

/**
 * Reset the internal counter (useful in tests).
 */
export function _resetCounter() {
  _counter = 0;
}

// ---------------------------------------------------------------------------
// Environment cleaning
// ---------------------------------------------------------------------------

/**
 * Environment variable prefixes injected by Claude Code that must NOT
 * leak into spawned CLI processes.  A spawned `claude --print` that
 * inherits `CLAUDECODE=1` will refuse to start ("cannot be launched
 * inside another Claude Code session").
 *
 * @type {string[]}
 */
const BLOCKED_ENV_PREFIXES = ['CLAUDE_CODE_', 'CLAUDE_AGENT_SDK_'];

/**
 * Exact environment variable names to strip (no prefix match needed).
 * @type {string[]}
 */
const BLOCKED_ENV_EXACT = ['CLAUDECODE'];

/**
 * Return a copy of the given environment with Claude Code-specific
 * variables removed.  This prevents "nested session" errors when
 * spawning `claude --print` from inside a Claude Code session.
 *
 * The function is intentionally conservative — it only removes vars
 * that are known to be injected by the Claude Code host process.
 * User-configured vars like CLAUDE_API_KEY are preserved.
 *
 * @param {Record<string, string>} env - Source environment (typically process.env)
 * @returns {Record<string, string>} Cleaned environment (new object)
 */
export function cleanParentEnv(env) {
  const cleaned = {};
  for (const [key, value] of Object.entries(env)) {
    if (BLOCKED_ENV_EXACT.includes(key)) continue;
    if (BLOCKED_ENV_PREFIXES.some(prefix => key.startsWith(prefix))) continue;
    cleaned[key] = value;
  }
  return cleaned;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * @typedef {object} SpawnConfig
 * @property {string} agent           - Agent name (e.g. "architect")
 * @property {string} taskId          - Task identifier
 * @property {string} [model]         - LLM model tier name (e.g. opus, pro, codex, claude-sonnet)
 * @property {string} [provider]      - CLI provider name (claude, gemini, codex)
 * @property {string} [prompt]        - Full prompt string (from prompt-builder, piped via stdin)
 * @property {object} [contextPayload] - Context to inject via env var
 * @property {string[]} [writeScope]   - Override write scope
 * @property {string} [workingDir]     - Working directory for the process
 * @property {number} [timeout]        - Max execution time in ms
 */

/**
 * @typedef {object} TerminalHandle
 * @property {string} id         - Unique terminal ID
 * @property {object|null} process - child_process.ChildProcess (null when dry)
 * @property {string} agent      - Agent name
 * @property {string} taskId     - Task identifier
 * @property {string} model      - Model used for this terminal
 * @property {string} startedAt  - ISO timestamp
 * @property {string} status     - "running" | "exited" | "killed"
 * @property {number|null} exitCode - Process exit code (null while running)
 * @property {string[]} stdout   - Captured stdout lines
 * @property {string[]} stderr   - Captured stderr lines
 * @property {number} timeout    - Max execution time in ms
 */

/**
 * Build the CLI command, arguments and environment for spawning a
 * Claude Code terminal.  This is a **pure function** -- it does not
 * perform any I/O and is therefore fully testable in isolation.
 *
 * @param {SpawnConfig} config
 * @returns {{ command: string, args: string[], env: Record<string, string>, terminalId: string, prompt: string|null }}
 */
export function buildSpawnCommand(config) {
  if (!config || typeof config !== 'object') {
    throw new Error('buildSpawnCommand requires a config object');
  }
  if (!config.agent || typeof config.agent !== 'string') {
    throw new Error('config.agent is required and must be a string');
  }
  if (!config.taskId || typeof config.taskId !== 'string') {
    throw new Error('config.taskId is required and must be a string');
  }

  const terminalId = generateTerminalId(config.agent);
  const isolationEnv = buildIsolationEnv(config.agent);

  const env = {
    ...isolationEnv,
    CHATI_TERMINAL_ID: terminalId,
    CHATI_AGENT: config.agent,
    CHATI_TASK_ID: config.taskId,
    CHATI_SPAWNED: 'true',
  };

  if (config.contextPayload) {
    try {
      env.CHATI_CONTEXT = JSON.stringify(config.contextPayload);
    } catch {
      env.CHATI_CONTEXT = '{}';
    }
  }

  // Resolve CLI provider — defaults to claude for backwards compatibility
  const providerName = config.provider || 'claude';
  let command, args, prompt;
  let providerFallback = null;

  try {
    const provider = getProvider(providerName);
    const adapterResult = provider.adapter.buildCommand(config, provider);
    command = adapterResult.command;
    args = adapterResult.args;
    prompt = adapterResult.stdinPrompt;
  } catch (err) {
    // Fallback to claude if provider resolution fails (backwards compatibility)
    providerFallback = {
      requested: providerName,
      actual: 'claude',
      reason: err.message,
      timestamp: new Date().toISOString(),
    };
    console.error(`[chati] Provider "${providerName}" resolution failed: ${err.message}. Falling back to claude.`);
    command = 'claude';
    args = ['--print', '--dangerously-skip-permissions'];
    if (config.model) {
      const claudeProvider = getProvider('claude');
      const resolvedModel = claudeProvider.modelMap[config.model] || config.model;
      args.push('--model', resolvedModel);
    }
    prompt = config.prompt || null;
  }

  return { command, args, env, terminalId, prompt, providerFallback };
}

/**
 * Spawn a new terminal process for an agent task.
 *
 * @param {SpawnConfig} config
 * @returns {TerminalHandle}
 */
export function spawnTerminal(config) {
  const { command, args, env, terminalId, prompt, providerFallback } = buildSpawnCommand(config);

  const cwd = config.workingDir || process.cwd();
  const timeout = config.timeout || 300_000; // default 5 minutes

  const child = spawn(command, args, {
    cwd,
    env: { ...cleanParentEnv(process.env), ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  // Pipe prompt via stdin (avoids shell argument length limits)
  if (prompt) {
    child.stdin.write(prompt);
  }
  child.stdin.end();

  /** @type {TerminalHandle} */
  const handle = {
    id: terminalId,
    process: child,
    agent: config.agent,
    taskId: config.taskId,
    model: config.model || 'unknown',
    provider: config.provider || 'claude',
    providerFallback,
    startedAt: new Date().toISOString(),
    status: 'running',
    exitCode: null,
    stdout: [],
    stderr: [],
    timeout,
  };

  // Capture output (capped at ~10MB to prevent unbounded memory growth)
  const MAX_BUFFER_CHUNKS = 10_000;
  if (child.stdout) {
    child.stdout.on('data', (chunk) => {
      if (handle.stdout.length < MAX_BUFFER_CHUNKS) {
        handle.stdout.push(chunk.toString());
      }
    });
  }
  if (child.stderr) {
    child.stderr.on('data', (chunk) => {
      if (handle.stderr.length < MAX_BUFFER_CHUNKS) {
        handle.stderr.push(chunk.toString());
      }
    });
  }

  child.on('exit', (code) => {
    handle.status = 'exited';
    handle.exitCode = code;
  });

  child.on('error', (err) => {
    handle.status = 'exited';
    handle.exitCode = -1;
    handle.stderr.push(`spawn error: ${err.message}`);
  });

  // Enforce timeout — kill process if it exceeds max execution time
  const timeoutTimer = setTimeout(() => {
    if (handle.status === 'running') {
      handle.stderr.push(`timeout: process exceeded ${timeout}ms limit`);
      killTerminal(handle);
    }
  }, timeout);

  // Clear timer when process exits normally
  child.on('exit', () => clearTimeout(timeoutTimer));

  return handle;
}

/**
 * Spawn a group of terminals concurrently.
 * Validates write scopes before spawning to prevent conflicts.
 *
 * @param {SpawnConfig[]} configs
 * @returns {{ groupId: string, terminals: TerminalHandle[], startedAt: string }}
 * @throws {Error} When write scope conflicts are detected
 */
export function spawnParallelGroup(configs) {
  if (!Array.isArray(configs) || configs.length === 0) {
    throw new Error('spawnParallelGroup requires a non-empty array of configs');
  }

  const validation = validateWriteScopes(configs);
  if (!validation.valid) {
    const details = validation.conflicts
      .map(c => `${c.agents.join(' vs ')} on ${c.path}`)
      .join('; ');
    throw new Error(`Write scope conflicts detected: ${details}`);
  }

  const groupId = `group-${Date.now()}`;
  const terminals = configs.map(cfg => spawnTerminal(cfg));

  return {
    groupId,
    terminals,
    startedAt: new Date().toISOString(),
  };
}

/**
 * Spawn a group of terminals with concurrency control (pool pattern).
 *
 * Unlike `spawnParallelGroup` which launches all at once, this function
 * limits the number of simultaneously running processes. When one process
 * exits, the next in the queue is spawned.
 *
 * @param {SpawnConfig[]} configs
 * @param {{ maxConcurrency?: number }} [options={}]
 * @returns {Promise<{ groupId: string, terminals: TerminalHandle[], startedAt: string }>}
 * @throws {Error} When write scope conflicts are detected
 */
export async function spawnParallelGroupAsync(configs, options = {}) {
  if (!Array.isArray(configs) || configs.length === 0) {
    throw new Error('spawnParallelGroupAsync requires a non-empty array of configs');
  }

  const maxConcurrency = options.maxConcurrency || DEFAULT_CONCURRENCY;

  const validation = validateWriteScopes(configs);
  if (!validation.valid) {
    const details = validation.conflicts
      .map(c => `${c.agents.join(' vs ')} on ${c.path}`)
      .join('; ');
    throw new Error(`Write scope conflicts detected: ${details}`);
  }

  const groupId = `group-${Date.now()}`;
  const startedAt = new Date().toISOString();

  // If within concurrency limit, spawn all at once (fast path)
  if (configs.length <= maxConcurrency) {
    const terminals = configs.map(cfg => spawnTerminal(cfg));
    return { groupId, terminals, startedAt };
  }

  // Pool pattern: spawn up to maxConcurrency, refill as processes exit
  const terminals = [];
  const queue = [...configs];
  const active = new Set();

  /**
   * Wait for a terminal to exit. Returns a Promise that resolves
   * when the terminal's process emits 'exit'.
   */
  function waitForExit(handle) {
    if (handle.status !== 'running') {
      return Promise.resolve();
    }
    return new Promise(resolve => {
      if (!handle.process) {
        resolve();
        return;
      }
      handle.process.once('exit', () => resolve());
    });
  }

  // Fill initial pool
  while (queue.length > 0 && active.size < maxConcurrency) {
    const cfg = queue.shift();
    const handle = spawnTerminal(cfg);
    terminals.push(handle);
    active.add(handle);
  }

  // Process remaining queue as slots free up
  while (queue.length > 0) {
    // Wait for ANY active process to exit
    await Promise.race([...active].map(h => waitForExit(h)));

    // Remove exited processes from active set
    for (const h of active) {
      if (h.status !== 'running') {
        active.delete(h);
      }
    }

    // Fill freed slots
    while (queue.length > 0 && active.size < maxConcurrency) {
      const cfg = queue.shift();
      const handle = spawnTerminal(cfg);
      terminals.push(handle);
      active.add(handle);
    }
  }

  return { groupId, terminals, startedAt };
}

/**
 * Gracefully kill a spawned terminal.
 * Sends SIGTERM first; if the process is still alive after 5 seconds,
 * escalates to SIGKILL.
 *
 * @param {TerminalHandle} handle
 * @returns {Promise<{ killed: boolean, exitCode: number|null }>}
 */
export function killTerminal(handle) {
  if (!handle || !handle.process) {
    return Promise.resolve({ killed: false, exitCode: handle?.exitCode ?? null });
  }

  if (handle.status === 'exited') {
    return Promise.resolve({ killed: false, exitCode: handle.exitCode });
  }

  return new Promise((resolve) => {
    const forceKillTimer = setTimeout(() => {
      try {
        handle.process.kill('SIGKILL');
      } catch {
        // already dead -- ignore
      }
    }, 5000);

    handle.process.once('exit', (code) => {
      clearTimeout(forceKillTimer);
      handle.status = 'killed';
      handle.exitCode = code;
      resolve({ killed: true, exitCode: code });
    });

    try {
      handle.process.kill('SIGTERM');
    } catch {
      clearTimeout(forceKillTimer);
      handle.status = 'killed';
      resolve({ killed: false, exitCode: handle.exitCode });
    }
  });
}

/**
 * Return the current status snapshot of a terminal.
 *
 * @param {TerminalHandle} handle
 * @returns {{ id: string, agent: string, model: string, status: string, elapsed: number, exitCode: number|null }}
 */
export function getTerminalStatus(handle) {
  if (!handle) {
    return { id: 'unknown', agent: 'unknown', model: 'unknown', provider: 'unknown', status: 'unknown', elapsed: 0, exitCode: null, providerFallback: null };
  }

  const elapsed = Date.now() - new Date(handle.startedAt).getTime();

  return {
    id: handle.id,
    agent: handle.agent,
    model: handle.model || 'unknown',
    provider: handle.provider || 'unknown',
    status: handle.status,
    elapsed,
    exitCode: handle.exitCode,
    providerFallback: handle.providerFallback || null,
  };
}

// ---------------------------------------------------------------------------
// Retry / Backoff
// ---------------------------------------------------------------------------

/**
 * Determine whether a terminal failure is transient (worth retrying).
 *
 * @param {number} exitCode - Process exit code
 * @param {string[]|string} stderr - Captured stderr output
 * @returns {boolean}
 */
export function isTransientFailure(exitCode, stderr) {
  if (exitCode === 0) return false;
  const str = Array.isArray(stderr) ? stderr.join('') : (stderr || '');
  return TRANSIENT_PATTERNS.some(p => p.test(str));
}

/**
 * Spawn a terminal with automatic retry on transient failures.
 *
 * Wraps `spawnTerminal()` with exponential backoff.
 * Non-transient failures are returned immediately without retry.
 *
 * @param {SpawnConfig} config
 * @param {{ maxRetries?: number, baseDelay?: number, shouldRetry?: function }} [retryOptions={}]
 * @returns {Promise<TerminalHandle>}
 */
export async function spawnTerminalWithRetry(config, retryOptions = {}) {
  const maxRetries = retryOptions.maxRetries ?? 2;
  const baseDelay = retryOptions.baseDelay ?? 2000;
  const shouldRetry = retryOptions.shouldRetry || isTransientFailure;

  let lastHandle = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const handle = spawnTerminal(config);
    lastHandle = handle;

    // Wait for process to exit
    await new Promise((resolve) => {
      if (!handle.process) { resolve(); return; }
      if (handle.status !== 'running') { resolve(); return; }
      handle.process.once('exit', () => resolve());
    });

    // Success — return immediately
    if (handle.exitCode === 0) {
      return handle;
    }

    // Check if failure is transient and retries remain
    if (attempt < maxRetries && shouldRetry(handle.exitCode, handle.stderr)) {
      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
      continue;
    }

    // Non-transient or out of retries — return as-is
    return handle;
  }

  return lastHandle;
}
