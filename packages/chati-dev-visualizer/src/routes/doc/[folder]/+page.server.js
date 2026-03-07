import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { error } from '@sveltejs/kit';
import { parseArtifactDoc } from '$lib/visualizer.js';
import { resolveArtifactsDir, resolveProjectDir } from '$lib/server/paths.js';

export async function load({ params }) {
	const { folder } = params;
	const projectDir = resolveProjectDir();
	const artifactsDir = resolveArtifactsDir(projectDir);

	if (!artifactsDir) {
		throw error(404, 'Artifacts directory not found. Set CHATI_PROJECT_DIR or run from your project root.');
	}

	const folderPath = join(artifactsDir, folder);
	if (!existsSync(folderPath) || !statSync(folderPath).isDirectory()) {
		throw error(404, `No artifact folder found: "${folder}".`);
	}

	const mdFiles = readdirSync(folderPath).filter((f) => f.endsWith('.md'));
	if (mdFiles.length === 0) {
		throw error(404, `No markdown documents found in folder "${folder}".`);
	}

	// Return all docs in this folder (usually one, but handle multiple)
	const docs = mdFiles.map((fileName) => {
		const raw = readFileSync(join(folderPath, fileName), 'utf-8');
		return { ...parseArtifactDoc(raw, fileName, folder), rawContent: raw };
	});

	return { folder, docs };
}
