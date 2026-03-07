import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { error } from '@sveltejs/kit';
import { parseHandoffMarkdown } from '$lib/visualizer.js';
import { resolveArtifactsDir, resolveProjectDir } from '$lib/server/paths.js';

export async function load({ params }) {
	const { agent } = params;
	const projectDir = resolveProjectDir();
	const artifactsDir = resolveArtifactsDir(projectDir);

	if (!artifactsDir) {
		throw error(404, 'Artifacts directory not found. Set CHATI_PROJECT_DIR or run from your project root.');
	}

	const handoffDir = join(artifactsDir, 'handoffs');
	if (!existsSync(handoffDir)) {
		throw error(404, 'No handoffs directory found inside artifacts.');
	}

	const files = readdirSync(handoffDir).filter((f) => f.endsWith('.md'));

	for (const fileName of files) {
		const filePath = join(handoffDir, fileName);
		let raw;
		try {
			raw = readFileSync(filePath, 'utf-8');
		} catch {
			continue;
		}
		const parsed = parseHandoffMarkdown(raw, fileName);
		if (parsed?.fromAgent === agent) {
			return { handoff: parsed, rawContent: raw };
		}
	}

	throw error(404, `No handoff file found for agent "${agent}".`);
}
