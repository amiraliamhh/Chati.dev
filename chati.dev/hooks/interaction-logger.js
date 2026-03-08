#!/usr/bin/env node
/**
 * Interaction Logger Hook
 *
 * Captures user/system conversation events and internal runtime signals into:
 *   .chati/interaction-log.json
 *
 * Hook events supported:
 * - UserPromptSubmit: logs user prompts
 * - Stop: logs assistant responses
 * - SessionStart / SessionEnd: logs lifecycle events
 * - PreToolUse / PostToolUse / PostToolUseFailure: logs tool activity summaries
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const LOG_FILE_NAME = 'interaction-log.json';

function emptyLog(now) {
  return {
    schemaVersion: 2,
    createdAt: now,
    updatedAt: now,
    interactions: [],
    userPrompts: [],
    conversation: [],
    systemTrace: [],
    timeline: [],
  };
}

function ensureLog(projectDir) {
  const chatiDir = join(projectDir, '.chati');
  if (!existsSync(chatiDir)) {
    mkdirSync(chatiDir, { recursive: true });
  }
  const logPath = join(chatiDir, LOG_FILE_NAME);
  if (!existsSync(logPath)) {
    const now = new Date().toISOString();
    writeFileSync(logPath, JSON.stringify(emptyLog(now), null, 2) + '\n', 'utf-8');
  }
  return logPath;
}

function summarizeToolEvent(event) {
  const name = event.tool_name || 'unknown';
  const input = event.tool_input || {};
  if (name === 'Bash') {
    return `Bash: ${(input.command || '').slice(0, 300)}`;
  }
  if (name === 'Write' || name === 'Edit') {
    return `${name}: ${input.file_path || input.path || '(unknown path)'}`;
  }
  if (name === 'Read') {
    return `Read: ${input.file_path || input.path || '(unknown path)'}`;
  }
  return `${name} tool event`;
}

function append(projectDir, payload) {
  const logPath = ensureLog(projectDir);
  const now = new Date().toISOString();
  const raw = readFileSync(logPath, 'utf-8');
  const data = JSON.parse(raw);

  if (!Array.isArray(data.interactions)) data.interactions = [];
  if (!Array.isArray(data.userPrompts)) data.userPrompts = [];
  if (!Array.isArray(data.conversation)) data.conversation = [];
  if (!Array.isArray(data.systemTrace)) data.systemTrace = [];
  if (!Array.isArray(data.timeline)) data.timeline = [];

  const entry = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
    timestamp: now,
    kind: payload.kind,
    source: payload.source || 'hook',
    text: payload.text || '',
    agent: payload.agent || null,
    taskId: payload.taskId || null,
    provider: payload.provider || 'claude',
    model: payload.model || null,
    metadata: payload.metadata || null,
  };

  data.interactions.push(entry);

  if (payload.kind === 'user_prompt') {
    data.userPrompts.push({
      timestamp: now,
      text: payload.text || '',
      source: payload.source || 'hook',
    });
    data.conversation.push({
      timestamp: now,
      role: 'user',
      source: payload.source || 'hook',
      text: payload.text || '',
    });
  } else if (payload.kind === 'assistant_response') {
    data.conversation.push({
      timestamp: now,
      role: 'assistant',
      source: payload.source || 'hook',
      text: payload.text || '',
    });
  } else {
    data.systemTrace.push({
      timestamp: now,
      kind: payload.kind,
      source: payload.source || 'hook',
      text: payload.text || '',
      metadata: payload.metadata || null,
    });
  }

  data.timeline.push({
    timestamp: now,
    kind: payload.kind,
    source: payload.source || 'hook',
    preview: (payload.text || '').replace(/\s+/g, ' ').trim().slice(0, 160),
  });

  data.updatedAt = now;
  writeFileSync(logPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

async function main() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  try {
    const event = JSON.parse(input);
    const projectDir = event.cwd || process.cwd();
    const hookEvent = event.hook_event_name || '';

    if (hookEvent === 'UserPromptSubmit' && event.prompt) {
      append(projectDir, {
        kind: 'user_prompt',
        source: 'claude-hook:user-prompt-submit',
        text: event.prompt,
      });
    } else if (hookEvent === 'Stop' && event.last_assistant_message) {
      append(projectDir, {
        kind: 'assistant_response',
        source: 'claude-hook:stop',
        text: event.last_assistant_message,
      });
    } else if (hookEvent === 'SessionStart') {
      append(projectDir, {
        kind: 'system_event',
        source: 'claude-hook:session-start',
        text: `Session started (${event.source || 'startup'})`,
        metadata: {
          source: event.source || null,
          model: event.model || null,
          sessionId: event.session_id || null,
        },
      });
    } else if (hookEvent === 'SessionEnd') {
      append(projectDir, {
        kind: 'system_event',
        source: 'claude-hook:session-end',
        text: `Session ended (${event.reason || 'other'})`,
        metadata: {
          reason: event.reason || null,
          sessionId: event.session_id || null,
        },
      });
    } else if (hookEvent === 'PreToolUse' || hookEvent === 'PostToolUse' || hookEvent === 'PostToolUseFailure') {
      append(projectDir, {
        kind: 'tool_event',
        source: `claude-hook:${hookEvent.toLowerCase()}`,
        text: summarizeToolEvent(event),
        metadata: {
          toolName: event.tool_name || null,
          toolUseId: event.tool_use_id || null,
          phase: hookEvent,
          error: event.error || null,
        },
      });
    }
  } catch {
    // Ignore logging failures and always allow flow to continue.
  }

  process.stdout.write(JSON.stringify({ result: 'allow' }));
}

// Guard
import { fileURLToPath } from 'url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
