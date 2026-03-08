import { existsSync } from 'fs';
import { join } from 'path';

export function resolveProjectDir() {
	return process.env.CHATI_PROJECT_DIR || process.cwd();
}

/**
 * Resolves the artifacts root.
 * Prefers `{projectDir}/chati.dev/artifacts` (production layout),
 * falls back to `{projectDir}/artifacts` (dev / sample layout).
 */
export function resolveArtifactsDir(projectDir) {
	const primary = join(projectDir, 'chati.dev', 'artifacts');
	if (existsSync(primary)) return primary;
	const fallback = join(projectDir, 'artifacts');
	if (existsSync(fallback)) return fallback;
	return null;
}
