import { writable, derived } from 'svelte/store';
import {
	normalizeLog,
	parseSessionYaml,
	buildEventSummary,
	aggregateHandoffs,
	getActivePipeline,
	getAgentStats
} from './visualizer.js';

// ── Raw / primitive stores ──────────────────────────────────────────────────
export const loading = writable(false);
export const loadError = writable('');
export const apiInfo = writable(null);
export const sessionRaw = writable('');
export const logRaw = writable('');
export const handoffFiles = writable([]);
export const artifacts = writable([]);
export const selectedEvent = writable(null);
export const theme = writable('dark');

// ── Parsed stores ───────────────────────────────────────────────────────────
export const log = writable(normalizeLog(null));
export const session = writable({});

// ── Derived stores ──────────────────────────────────────────────────────────
export const summary = derived(log, ($log) => buildEventSummary($log));
export const handoffSummary = derived(handoffFiles, ($h) => aggregateHandoffs($h));
export const pipeline = derived(session, ($s) => getActivePipeline($s));
export const agentStats = derived(
	[log, session, handoffFiles, artifacts, pipeline],
	([$log, $session, $handoffs, $artifacts, $pipeline]) =>
		getAgentStats($log, $session, $handoffs, $artifacts, $pipeline)
);

// ── Actions ─────────────────────────────────────────────────────────────────
export async function loadFromApi() {
	loadError.set('');
	loading.set(true);
	try {
		const response = await fetch('/api/logs');
		if (!response.ok) {
			loadError.set(`Could not load from server: ${response.status}`);
			return;
		}
		const payload = await response.json();
		apiInfo.set(payload);

		const interactionLog = payload?.data?.interactionLog;
		if (interactionLog) {
			log.set(normalizeLog(interactionLog));
			logRaw.set(JSON.stringify(interactionLog, null, 2));
		}

		if (payload?.data?.sessionRaw) {
			sessionRaw.set(payload.data.sessionRaw);
			session.set(payload.data.sessionParsed || parseSessionYaml(payload.data.sessionRaw));
		}

		if (Array.isArray(payload?.data?.handoffs)) {
			handoffFiles.set(payload.data.handoffs);
		}

		if (Array.isArray(payload?.data?.artifacts)) {
			artifacts.set(payload.data.artifacts);
		}
	} catch (err) {
		loadError.set(`Could not load from server: ${err.message}`);
	} finally {
		loading.set(false);
	}
}

export function toggleTheme() {
	theme.update((t) => {
		const next = t === 'dark' ? 'light' : 'dark';
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem('chati-visualizer-theme', next);
		}
		return next;
	});
}

export function selectEvent(item) {
	selectedEvent.set(item);
}
