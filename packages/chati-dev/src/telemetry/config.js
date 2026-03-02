/**
 * @fileoverview Telemetry configuration reader/writer.
 *
 * Reads and writes telemetry preferences from chati.dev/config.yaml.
 * Manages the anonymous UUID for tracking.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import yaml from 'js-yaml';

// ---------------------------------------------------------------------------
// Config Management
// ---------------------------------------------------------------------------

/**
 * Read telemetry config from project's config.yaml.
 *
 * @param {string} targetDir - Project root directory
 * @returns {{ enabled: boolean, anonymousId: string | null, endpoint: string }}
 */
export function getTelemetryConfig(targetDir) {
  const configPath = join(targetDir, 'chati.dev', 'config.yaml');

  const defaults = {
    enabled: false,
    anonymousId: null,
    endpoint: 'https://chati-telemetry.vercel.app/api/events',
    apiKey: '10b0b54ba4f392fa46379ba778062ab0af5ca61e79609a7dce4aadd660104b56',
  };

  if (!existsSync(configPath)) return defaults;

  try {
    const content = readFileSync(configPath, 'utf-8');
    const config = yaml.load(content);
    const telemetry = config?.telemetry || {};

    return {
      enabled: telemetry.enabled === true,
      anonymousId: telemetry.anonymous_id || null,
      endpoint: telemetry.endpoint || defaults.endpoint,
      apiKey: telemetry.api_key || defaults.apiKey,
    };
  } catch {
    return defaults;
  }
}

/**
 * Check if telemetry is enabled.
 *
 * @param {string} targetDir
 * @returns {boolean}
 */
export function isEnabled(targetDir) {
  return getTelemetryConfig(targetDir).enabled;
}

/**
 * Set telemetry enabled/disabled in config.yaml.
 * Generates anonymous UUID on first enable.
 *
 * @param {string} targetDir
 * @param {boolean} enabled
 */
export function setEnabled(targetDir, enabled) {
  const configPath = join(targetDir, 'chati.dev', 'config.yaml');

  if (!existsSync(configPath)) return;

  try {
    const content = readFileSync(configPath, 'utf-8');
    const config = yaml.load(content) || {};

    if (!config.telemetry) config.telemetry = {};
    config.telemetry.enabled = enabled;

    // Generate UUID on first enable
    if (enabled && !config.telemetry.anonymous_id) {
      config.telemetry.anonymous_id = randomUUID();
    }

    writeFileSync(configPath, yaml.dump(config, { lineWidth: -1 }), 'utf-8');
  } catch {
    // Silently fail — telemetry config is non-critical
  }
}

/**
 * Get or generate the anonymous tracking ID.
 *
 * @param {string} targetDir
 * @returns {string}
 */
export function getAnonymousId(targetDir) {
  const config = getTelemetryConfig(targetDir);

  if (config.anonymousId) return config.anonymousId;

  // Generate and persist
  const id = randomUUID();
  const configPath = join(targetDir, 'chati.dev', 'config.yaml');

  if (existsSync(configPath)) {
    try {
      const content = readFileSync(configPath, 'utf-8');
      const parsed = yaml.load(content) || {};
      if (!parsed.telemetry) parsed.telemetry = {};
      parsed.telemetry.anonymous_id = id;
      writeFileSync(configPath, yaml.dump(parsed, { lineWidth: -1 }), 'utf-8');
    } catch {
      // Return generated ID even if persistence fails
    }
  }

  return id;
}
