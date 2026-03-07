const KNOWN_AGENTS = [
	'greenfield-wu',
	'brownfield-wu',
	'brief',
	'detail',
	'architect',
	'ux',
	'phases',
	'tasks',
	'qa-planning',
	'dev',
	'qa-implementation',
	'devops'
];

const PIPELINES = {
	greenfield: [
		'greenfield-wu',
		'brief',
		'detail',
		'architect',
		'ux',
		'phases',
		'tasks',
		'qa-planning',
		'dev',
		'qa-implementation',
		'devops'
	],
	brownfield: [
		'brownfield-wu',
		'brief',
		'architect',
		'detail',
		'ux',
		'phases',
		'tasks',
		'qa-planning',
		'dev',
		'qa-implementation',
		'devops'
	],
	// Standard flow skips WU, ux, and phases (mid-complexity projects)
	standard: ['brief', 'detail', 'architect', 'tasks', 'qa-planning', 'dev', 'qa-implementation', 'devops'],
	'quick-flow': ['brief', 'dev', 'qa-implementation', 'devops']
};

export function getPipelines() {
	return PIPELINES;
}

export function getKnownAgents() {
	return KNOWN_AGENTS;
}

export function parseJson(text) {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

export function parseSessionYaml(yamlText) {
	if (!yamlText) return {};
	const extract = (pattern) => {
		const match = yamlText.match(pattern);
		return match ? match[1].trim().replace(/^['"]|['"]$/g, '') : null;
	};

	// project_type is a top-level key; fall back to nested project.type
	const projectType =
		extract(/^project_type:\s*(greenfield|brownfield)/m) ||
		extract(/^\s*type:\s*(greenfield|brownfield)/m);

	return {
		projectName: extract(/^\s*name:\s*(.+)$/m),
		projectType,
		projectState: extract(/^\s*state:\s*(\w+)/m),
		workflow: extract(/^\s*workflow:\s*([-\w]+)/m),
		currentAgent: extract(/^\s*current_agent:\s*([-\w]+)/m),
		language: extract(/^\s*language:\s*([-\w]+)/m),
		executionMode: extract(/^\s*execution_mode:\s*([-\w]+)/m),
		completedAgents: parseCompletedAgents(yamlText),
		agentStatuses: parseAgentSessionStatuses(yamlText)
	};
}

/**
 * Parses the `completed_agents` list from session.yaml.
 * Handles both block form (- agent) and inline form ([a, b, c]).
 */
function parseCompletedAgents(yamlText) {
	if (!yamlText) return [];

	// Inline: completed_agents: [greenfield-wu, brief, ...]
	const inlineMatch = yamlText.match(/^completed_agents:\s*\[([^\]]*)\]/m);
	if (inlineMatch && inlineMatch[1].trim()) {
		return inlineMatch[1]
			.split(',')
			.map((s) => s.trim().replace(/['"]/g, ''))
			.filter(Boolean);
	}

	// Block:
	// completed_agents:
	//   - greenfield-wu
	//   - brief
	const blockMatch = yamlText.match(/^completed_agents:\s*\n((?:[ \t]+-[ \t]+\S+\n?)+)/m);
	if (blockMatch) {
		return blockMatch[1]
			.split('\n')
			.map((line) => line.trim().replace(/^-\s*/, '').trim())
			.filter(Boolean);
	}

	return [];
}

/**
 * Parses per-agent statuses from the `agents:` block in session.yaml.
 * Returns { 'agent-name': 'completed' | 'skipped' | 'pending' | ... }
 * Handles both block and inline YAML styles.
 */
function parseAgentSessionStatuses(yamlText) {
	if (!yamlText) return {};
	const statuses = {};

	// Block style:
	//   greenfield-wu:
	//     status: completed
	const blockRe = /^[ \t]+([\w-]+):\s*\n[ \t]+status:\s*['"]*(\w+)/gm;
	let m;
	while ((m = blockRe.exec(yamlText)) !== null) {
		if (KNOWN_AGENTS.includes(m[1])) statuses[m[1]] = m[2];
	}

	// Inline style:
	//   greenfield-wu: {status: completed, score: 100, ...}
	const inlineRe = /^[ \t]+([\w-]+):\s*\{[^}]*status:\s*['"]*(\w+)/gm;
	while ((m = inlineRe.exec(yamlText)) !== null) {
		if (KNOWN_AGENTS.includes(m[1]) && !statuses[m[1]]) statuses[m[1]] = m[2];
	}

	return statuses;
}

export function normalizeLog(log) {
	const safe = log || {};
	return {
		createdAt: safe.createdAt || null,
		updatedAt: safe.updatedAt || null,
		interactions: Array.isArray(safe.interactions) ? safe.interactions : [],
		conversation: Array.isArray(safe.conversation) ? safe.conversation : [],
		userPrompts: Array.isArray(safe.userPrompts) ? safe.userPrompts : [],
		systemTrace: Array.isArray(safe.systemTrace) ? safe.systemTrace : [],
		timeline: Array.isArray(safe.timeline) ? safe.timeline : []
	};
}

export function buildEventSummary(log) {
	const byKind = {};
	for (const item of log.interactions) {
		byKind[item.kind] = (byKind[item.kind] || 0) + 1;
	}

	return {
		totalInteractions: log.interactions.length,
		totalConversationTurns: log.conversation.length,
		totalUserPrompts: log.userPrompts.length,
		totalSystemTrace: log.systemTrace.length,
		byKind
	};
}

export function getAgentStats(log, session, handoffs = [], artifacts = [], activePipeline = null) {
	const pipelineSet = activePipeline ? new Set(activePipeline) : null;

	const statsMap = new Map();
	for (const name of KNOWN_AGENTS) {
		statsMap.set(name, {
			agent: name,
			status: 'pending',
			events: 0,
			userPrompts: 0,
			llmResponses: 0,
			lastSeen: null,
			providers: new Set(),
			models: new Set(),
			handoffStatus: null,
			handoffScore: null,
			hasArtifacts: false
		});
	}

	// 1. Interaction log events (most detailed source)
	for (const event of log.interactions) {
		const agent = event.agent;
		if (!agent || !statsMap.has(agent)) continue;
		const stat = statsMap.get(agent);
		stat.events += 1;
		if (event.kind === 'user_prompt') stat.userPrompts += 1;
		if (event.kind === 'llm_response' || event.kind === 'assistant_response')
			stat.llmResponses += 1;
		stat.lastSeen =
			!stat.lastSeen || event.timestamp > stat.lastSeen ? event.timestamp : stat.lastSeen;
		if (event.provider) stat.providers.add(event.provider);
		if (event.model) stat.models.add(event.model);
	}

	// 2. Handoff files — agent ran even when no interaction log is present
	for (const handoff of handoffs) {
		const agent = handoff.fromAgent;
		if (!agent || !statsMap.has(agent)) continue;
		const stat = statsMap.get(agent);
		stat.handoffStatus = handoff.status;
		stat.handoffScore = handoff.score ?? null;
		if (handoff.timestamp) {
			const ts = String(handoff.timestamp);
			if (!stat.lastSeen || ts > stat.lastSeen) stat.lastSeen = ts;
		}
	}

	// 3. Artifact documents — agent produced output even without handoff/log
	for (const artifact of artifacts) {
		const agent = artifact.agent;
		if (!agent || !statsMap.has(agent)) continue;
		statsMap.get(agent).hasArtifacts = true;
	}

	// 4. Session-level completed_agents list (authoritative list of finished agents)
	const sessionCompleted = new Set(session.completedAgents || []);

	// 5. Session per-agent statuses (includes 'skipped')
	const sessionStatuses = session.agentStatuses || {};

	// 6. Resolve final status from all available evidence
	for (const stat of statsMap.values()) {
		// Not in the active pipeline — definitively not used
		if (pipelineSet && !pipelineSet.has(stat.agent)) {
			stat.status = 'not-applicable';
			stat.providers = Array.from(stat.providers);
			stat.models = Array.from(stat.models);
			continue;
		}

		// Explicitly skipped in session
		if (sessionStatuses[stat.agent] === 'skipped') {
			stat.status = 'skipped';
		} else if (
			stat.events > 0 ||
			stat.handoffStatus === 'complete' ||
			sessionCompleted.has(stat.agent) ||
			sessionStatuses[stat.agent] === 'completed'
		) {
			stat.status = 'completed';
		} else if (stat.handoffStatus === 'partial') {
			stat.status = 'partial';
		} else if (stat.hasArtifacts) {
			stat.status = 'observed';
		}

		// Active agent always overrides
		if (session.currentAgent === stat.agent) {
			stat.status = 'active';
		}

		stat.providers = Array.from(stat.providers);
		stat.models = Array.from(stat.models);
	}

	return Array.from(statsMap.values());
}

export function getActivePipeline(session) {
	if (session.workflow === 'quick-flow') return PIPELINES['quick-flow'];
	if (session.workflow === 'standard') return PIPELINES.standard;
	if (session.projectType === 'brownfield') return PIPELINES.brownfield;
	return PIPELINES.greenfield;
}

export function filterInteractions(interactions, filters) {
	return interactions.filter((event) => {
		if (filters.kind !== 'all' && event.kind !== filters.kind) return false;
		if (filters.agent !== 'all' && event.agent !== filters.agent) return false;
		if (filters.provider !== 'all' && event.provider !== filters.provider) return false;
		if (filters.model !== 'all' && event.model !== filters.model) return false;
		if (filters.query) {
			const blob = `${event.text || ''} ${event.source || ''} ${event.taskId || ''}`.toLowerCase();
			if (!blob.includes(filters.query.toLowerCase())) return false;
		}
		return true;
	});
}

export function uniqueValues(items, key) {
	const set = new Set();
	for (const item of items) {
		if (item[key]) set.add(item[key]);
	}
	return Array.from(set).sort();
}

const ARTIFACT_FOLDER_TO_AGENT = {
	'0-WU': 'greenfield-wu',
	'0-BWU': 'brownfield-wu',
	'1-Brief': 'brief',
	'2-PRD': 'detail',
	'3-Architecture': 'architect',
	'4-UX': 'ux',
	'5-Phases': 'phases',
	'6-Tasks': 'tasks',
	'7-QA-Planning': 'qa-planning',
	'8-Dev': 'dev',
	'9-QA': 'qa-implementation',
	'10-DevOps': 'devops'
};

function normalizeHandoffStatus(raw) {
	if (!raw) return 'unknown';
	const s = raw.toLowerCase().trim();
	if (s === 'completed' || s === 'complete') return 'complete';
	if (s === 'partial') return 'partial';
	if (s === 'error' || s === 'failed') return 'error';
	return s;
}

export function parseHandoffMarkdown(content, filename = '') {
	if (!content) return null;
	const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
	const meta = {};
	let body = content;

	if (frontmatterMatch) {
		const yamlPart = frontmatterMatch[1];
		body = frontmatterMatch[2];
		for (const line of yamlPart.split('\n')) {
			const match = line.match(/^([\w_-]+):\s*(.+)$/);
			if (match) {
				meta[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
			}
		}
	}

	const getSection = (name) => {
		const regex = new RegExp(`##\\s+${name}\\n([\\s\\S]*?)(\\n##\\s+|$)`, 'i');
		const match = body.match(regex);
		return match ? match[1].trim() : '';
	};

	const parseBullets = (sectionText) =>
		sectionText
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line.startsWith('- '))
			.map((line) => line.replace(/^- (\[[x ]\]\s*)?/, '').trim());

	// Support both `agent:` (newer format) and `from_agent:` (older format)
	const fromAgent = meta.from_agent || meta.agent || null;
	const status = normalizeHandoffStatus(meta.status);
	const summary = getSection('Summary') || getSection('Layer 1 — Summary') || getSection('Layer 1');

	return {
		id: filename || `${fromAgent || 'unknown'}-${meta.timestamp || Date.now()}`,
		fileName: filename || null,
		fromAgent,
		fromTask: meta.from_task || null,
		fromPhase: meta.from_phase || null,
		to: meta.to || meta.next_agent || meta.next_agents || null,
		timestamp: meta.timestamp || null,
		status,
		score: meta.score && meta.score !== 'N/A' ? parseInt(meta.score, 10) || null : null,
		criteriaCount: meta.criteria_count ? parseInt(meta.criteria_count, 10) || null : null,
		summary,
		outputs: parseBullets(getSection('Outputs')),
		decisions: parseBullets(getSection('Key Decisions') || getSection('Decisions')),
		blockers: parseBullets(getSection('Blockers')),
		criteriaMet: parseBullets(getSection('Criteria Met')),
		criteriaUnmet: parseBullets(getSection('Criteria Unmet'))
	};
}

export function aggregateHandoffs(handoffs) {
	const list = Array.isArray(handoffs) ? handoffs : [];
	const byAgent = {};
	let completed = 0;
	let partial = 0;
	let blockers = 0;
	for (const item of list) {
		if (item.status === 'complete') completed += 1;
		if (item.status === 'partial') partial += 1;
		blockers += item.blockers?.length || 0;
		if (item.fromAgent) byAgent[item.fromAgent] = item;
	}
	return { total: list.length, completed, partial, blockers, byAgent };
}

export function parseArtifactDoc(content, fileName, folder) {
	if (!content) return null;
	const titleMatch = content.match(/^#\s+(.+)$/m);
	const title = titleMatch ? titleMatch[1].trim() : fileName.replace(/\.md$/, '');

	// Extract the first block of prose before any ## section as the intro
	const withoutH1 = content.replace(/^#[^#][^\n]*\n?/, '');
	const introMatch = withoutH1.match(/^([\s\S]*?)(?=\n##\s|$)/);
	const intro = introMatch ? introMatch[1].trim().slice(0, 600) : '';

	const agent = ARTIFACT_FOLDER_TO_AGENT[folder] || null;

	return { folder, fileName, title, agent, intro, content };
}

export function compareLogs(baseLog, compareLog) {
	const a = normalizeLog(baseLog);
	const b = normalizeLog(compareLog);
	const byKindA = buildEventSummary(a).byKind;
	const byKindB = buildEventSummary(b).byKind;
	const allKinds = Array.from(new Set([...Object.keys(byKindA), ...Object.keys(byKindB)])).sort();

	return {
		base: {
			interactions: a.interactions.length,
			userPrompts: a.userPrompts.length,
			conversation: a.conversation.length,
			systemTrace: a.systemTrace.length
		},
		compare: {
			interactions: b.interactions.length,
			userPrompts: b.userPrompts.length,
			conversation: b.conversation.length,
			systemTrace: b.systemTrace.length
		},
		delta: {
			interactions: b.interactions.length - a.interactions.length,
			userPrompts: b.userPrompts.length - a.userPrompts.length,
			conversation: b.conversation.length - a.conversation.length,
			systemTrace: b.systemTrace.length - a.systemTrace.length
		},
		byKind: allKinds.map((kind) => ({
			kind,
			base: byKindA[kind] || 0,
			compare: byKindB[kind] || 0,
			delta: (byKindB[kind] || 0) - (byKindA[kind] || 0)
		}))
	};
}

export function toCsv(events) {
	const rows = [['timestamp', 'kind', 'agent', 'taskId', 'provider', 'model', 'source', 'text']];
	for (const e of events) {
		rows.push([
			e.timestamp || '',
			e.kind || '',
			e.agent || '',
			e.taskId || '',
			e.provider || '',
			e.model || '',
			e.source || '',
			(e.text || '').replace(/\n/g, ' ')
		]);
	}
	return rows
		.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
		.join('\n');
}

export function toMarkdownReport({ session, summary, handoffSummary, comparison = null }) {
	const lines = [
		'# Chati.dev Visualizer Report',
		'',
		'## Session',
		`- Project: ${session.projectName || 'Unknown'}`,
		`- Type: ${session.projectType || 'Unknown'}`,
		`- State: ${session.projectState || 'Unknown'}`,
		`- Current Agent: ${session.currentAgent || 'Unknown'}`,
		'',
		'## Event Summary',
		`- Total interactions: ${summary.totalInteractions}`,
		`- User prompts: ${summary.totalUserPrompts}`,
		`- Conversation turns: ${summary.totalConversationTurns}`,
		`- System trace events: ${summary.totalSystemTrace}`,
		'',
		'## Handoff Summary',
		`- Total handoffs loaded: ${handoffSummary.total}`,
		`- Complete: ${handoffSummary.completed}`,
		`- Partial: ${handoffSummary.partial}`,
		`- Blockers: ${handoffSummary.blockers}`,
		''
	];

	if (comparison) {
		lines.push('## Session Comparison');
		lines.push(`- Interaction delta: ${comparison.delta.interactions}`);
		lines.push(`- User prompt delta: ${comparison.delta.userPrompts}`);
		lines.push(`- Conversation delta: ${comparison.delta.conversation}`);
		lines.push(`- System trace delta: ${comparison.delta.systemTrace}`);
		lines.push('');
	}

	return lines.join('\n');
}
