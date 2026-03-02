/**
 * @fileoverview Provider Overlay Generator for multi-CLI continuity.
 *
 * When multiple CLI providers are selected (e.g. Claude Code + Gemini CLI),
 * the primary provider's adapted files go in chati.dev/ (main). For each
 * secondary provider, this module generates an overlay directory at
 * chati.dev/.adapted/<provider>/ with the ADAPTABLE_FILES adapted for
 * that provider. Each CLI reads only its own files — zero runtime translation.
 *
 * Constitution Article XIX — multi-CLI governance.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { adaptFrameworkFile, ADAPTABLE_FILES } from '../config/framework-adapter.js';

/**
 * Generate adapted framework overlays for secondary providers.
 *
 * For each non-primary CLI provider, creates chati.dev/.adapted/<provider>/
 * with provider-adapted copies of all ADAPTABLE_FILES.
 *
 * Reads CANONICAL (Claude) content from frameworkSource, then adapts for
 * each secondary provider. This avoids double-adaptation issues when the
 * primary provider is not Claude.
 *
 * @param {string} targetDir - Project root directory
 * @param {string} frameworkSource - Source directory with canonical framework files
 * @param {string} primaryProvider - Primary provider name ('claude', 'gemini', 'codex')
 * @param {string[]} allProviders - All CLI provider names
 * @returns {{ generated: string[], skipped: string[] }}
 */
export function generateProviderOverlays(targetDir, frameworkSource, primaryProvider, allProviders) {
  const result = { generated: [], skipped: [] };
  const frameworkDir = join(targetDir, 'chati.dev');

  for (const provider of allProviders) {
    if (provider === primaryProvider) {
      result.skipped.push(provider);
      continue;
    }

    const overlayDir = join(frameworkDir, '.adapted', provider);

    for (const file of ADAPTABLE_FILES) {
      const srcPath = join(frameworkSource, file);
      if (!existsSync(srcPath)) continue;

      // Read CANONICAL (Claude) content from source, then adapt for target provider
      const canonicalContent = readFileSync(srcPath, 'utf-8');
      const adapted = adaptFrameworkFile(canonicalContent, file, provider);

      const destPath = join(overlayDir, file);
      mkdirSync(dirname(destPath), { recursive: true });
      writeFileSync(destPath, adapted, 'utf-8');
    }

    result.generated.push(provider);
  }

  return result;
}

/**
 * Resolve the correct framework file path for a given provider.
 *
 * Returns the overlay path for secondary providers (if it exists),
 * otherwise falls back to the main chati.dev/ path.
 *
 * @param {string} projectDir - Project root directory
 * @param {string} relativePath - Path relative to chati.dev/ (e.g. 'agents/build/dev.md')
 * @param {string} provider - Target provider name
 * @returns {string} Absolute path to the adapted file
 */
export function resolveOverlayPath(projectDir, relativePath, provider) {
  // Check overlay first
  const overlayPath = join(projectDir, 'chati.dev', '.adapted', provider, relativePath);
  if (existsSync(overlayPath)) return overlayPath;

  // Fallback to main chati.dev/
  return join(projectDir, 'chati.dev', relativePath);
}
