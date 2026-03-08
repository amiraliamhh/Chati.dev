import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { json } from '@sveltejs/kit';
import { parseArtifactDoc, parseHandoffMarkdown, parseJson, parseSessionYaml } from '$lib/visualizer.js';
import { resolveArtifactsDir, resolveProjectDir } from '$lib/server/paths.js';

function readUtf8(path) {
	if (!existsSync(path)) return null;
	try {
		return readFileSync(path, 'utf-8');
	} catch {
		return null;
	}
}

export async function GET() {
	const projectDir = resolveProjectDir();
	const logPath = join(projectDir, '.chati', 'interaction-log.json');
	const sessionPath = join(projectDir, '.chati', 'session.yaml');
	const artifactsDir = resolveArtifactsDir(projectDir);
	const handoffDir = artifactsDir ? join(artifactsDir, 'handoffs') : null;

	const logRaw = readUtf8(logPath);
	const sessionRaw = readUtf8(sessionPath);

	// ── Handoffs ──────────────────────────────────────────────────────────────
	let handoffs = [];
	if (handoffDir && existsSync(handoffDir)) {
		try {
			const files = readdirSync(handoffDir).filter((name) => name.endsWith('.md'));
			handoffs = files
				.map((fileName) => {
					const raw = readUtf8(join(handoffDir, fileName));
					if (!raw) return null;
					return parseHandoffMarkdown(raw, fileName);
				})
				.filter(Boolean);
		} catch {
			handoffs = [];
		}
	}

	// ── Artifact documents ────────────────────────────────────────────────────
	let artifacts = [];
	if (artifactsDir && existsSync(artifactsDir)) {
		try {
			const entries = readdirSync(artifactsDir);
			for (const entry of entries) {
				if (entry === 'handoffs') continue;
				const entryPath = join(artifactsDir, entry);
				if (!statSync(entryPath).isDirectory()) continue;
				const mdFiles = readdirSync(entryPath).filter((f) => f.endsWith('.md'));
				for (const mdFile of mdFiles) {
					const raw = readUtf8(join(entryPath, mdFile));
					if (!raw) continue;
					const parsed = parseArtifactDoc(raw, mdFile, entry);
					if (parsed) artifacts.push(parsed);
				}
			}
			// Sort by folder name (0-WU, 1-Brief, ...) to preserve pipeline order
			artifacts.sort((a, b) => a.folder.localeCompare(b.folder, undefined, { numeric: true }));
		} catch {
			artifacts = [];
		}
	}

	return json({
		projectDir,
		paths: {
			logPath,
			sessionPath,
			artifactsDir: artifactsDir || null,
			handoffDir: handoffDir || null
		},
		found: {
			log: !!logRaw,
			session: !!sessionRaw,
			handoffs: handoffs.length,
			artifacts: artifacts.length
		},
		data: {
			interactionLog: logRaw ? parseJson(logRaw) : null,
			sessionRaw,
			sessionParsed: sessionRaw ? parseSessionYaml(sessionRaw) : null,
			handoffs,
			artifacts
		}
	});
}
