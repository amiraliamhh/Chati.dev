/**
 * @fileoverview Telemetry event sender.
 *
 * Sends batched events to the telemetry endpoint via HTTP POST.
 * Fire-and-forget: never blocks the user workflow, fails silently.
 */

// ---------------------------------------------------------------------------
// Default Endpoint
// ---------------------------------------------------------------------------

export const DEFAULT_ENDPOINT = 'https://chati-telemetry.vercel.app/api/events';

// ---------------------------------------------------------------------------
// Sender
// ---------------------------------------------------------------------------

/**
 * Send telemetry events to the remote endpoint.
 *
 * Fire-and-forget with 5s timeout. Never throws, never blocks.
 *
 * @param {Array<{ type: string, properties: object, timestamp: string }>} events
 * @param {{ anonymousId: string, version: string, endpoint?: string }} config
 * @returns {Promise<boolean>} true if sent successfully, false otherwise
 */
export async function sendEvents(events, config) {
  if (!config || !config.anonymousId || events.length === 0) return false;

  const endpoint = config.endpoint || DEFAULT_ENDPOINT;

  const payload = {
    anonymousId: config.anonymousId,
    chatiVersion: config.version || 'unknown',
    nodeVersion: process.version,
    os: process.platform,
    events,
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { 'X-Telemetry-Key': config.apiKey } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    return true;
  } catch {
    // Silently fail — never block user workflow
    return false;
  }
}
