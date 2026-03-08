import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));

function resolveMonorepoRoot() {
	return join(__dirname, '..', '..', '..', '..');
}

export async function runVisualizer(projectDir, options = {}) {
	const monorepoRoot = resolveMonorepoRoot();
	const visualizerDir = join(monorepoRoot, 'packages', 'chati-dev-visualizer');
	const port = options.port || '4179';
	const host = options.host || '127.0.0.1';

	if (!existsSync(visualizerDir)) {
		throw new Error(
			'Visualizer package not found at packages/chati-dev-visualizer. ' +
				'This command currently requires the monorepo checkout.'
		);
	}

	const args = ['run', 'dev', '--workspace', 'chati-dev-visualizer', '--', '--host', host, '--port', String(port)];

	const child = spawn('npm', args, {
		cwd: monorepoRoot,
		stdio: 'inherit',
		env: {
			...process.env,
			CHATI_PROJECT_DIR: projectDir
		}
	});

	await new Promise((resolve, reject) => {
		child.on('error', reject);
		child.on('exit', (code) => {
			if (code === 0) resolve();
			else reject(new Error(`Visualizer exited with code ${code}`));
		});
	});
}
