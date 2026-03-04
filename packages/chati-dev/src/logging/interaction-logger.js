/**
 * @fileoverview Session interaction logger.
 *
 * Persists prompt/response events to .chati/interaction-log.json so users can
 * audit what they asked and what was sent to/returned from LLM processes.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const LOG_FILE_NAME = 'interaction-log.json';

/**
 * Get absolute path to the interaction log file.
 *
 * @param {string} projectDir
 * @returns {string}
 */
export function getInteractionLogPath(projectDir) {
  return join(projectDir, '.chati', LOG_FILE_NAME);
}

/**
 * Ensure .chati/interaction-log.json exists.
 *
 * @param {string} projectDir
 * @returns {string} absolute log path
 */
export function ensureInteractionLog(projectDir) {
  const chatiDir = join(projectDir, '.chati');
  if (!existsSync(chatiDir)) {
    mkdirSync(chatiDir, { recursive: true });
  }

  const logPath = getInteractionLogPath(projectDir);
  if (!existsSync(logPath)) {
    const now = new Date().toISOString();
    writeFileSync(logPath, JSON.stringify({
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
      interactions: [],
      userPrompts: [],
    }, null, 2) + '\n', 'utf-8');
  }

  return logPath;
}

/**
 * Append a single interaction event to the session log.
 *
 * @param {string} projectDir
 * @param {{
 *   kind: 'user_prompt'|'generated_prompt'|'llm_response'|'llm_stderr',
 *   text: string,
 *   agent?: string,
 *   taskId?: string,
 *   provider?: string,
 *   model?: string,
 *   source?: string,
 *   metadata?: Record<string, any>
 * }} event
 */
export function appendInteraction(projectDir, event) {
  try {
    const logPath = ensureInteractionLog(projectDir);
    const raw = readFileSync(logPath, 'utf-8');
    const log = JSON.parse(raw);
    const now = new Date().toISOString();

    if (!Array.isArray(log.interactions)) log.interactions = [];
    if (!Array.isArray(log.userPrompts)) log.userPrompts = [];

    const entry = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
      timestamp: now,
      kind: event.kind,
      agent: event.agent || null,
      taskId: event.taskId || null,
      provider: event.provider || null,
      model: event.model || null,
      source: event.source || null,
      text: event.text || '',
      metadata: event.metadata || null,
    };

    log.interactions.push(entry);

    if (event.kind === 'user_prompt') {
      log.userPrompts.push({
        timestamp: now,
        agent: event.agent || null,
        taskId: event.taskId || null,
        source: event.source || null,
        text: event.text || '',
      });
    }

    log.updatedAt = now;
    writeFileSync(logPath, JSON.stringify(log, null, 2) + '\n', 'utf-8');
  } catch {
    // Logging must never break agent execution.
  }
}
