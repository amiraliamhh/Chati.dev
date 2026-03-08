// ── Navigation ───────────────────────────────────────────────────────────────
export const TABS = [
	{ id: 'overview', label: 'Overview', route: '/' },
	{ id: 'conversation', label: 'Conversation', route: '/conversation' },
	{ id: 'timeline', label: 'Timeline', route: '/timeline' },
	{ id: 'agents', label: 'Agents', route: '/agents' },
	{ id: 'pipeline', label: 'Pipeline', route: '/pipeline' },
	{ id: 'llm-trace', label: 'LLM Trace', route: '/llm-trace' },
	{ id: 'inspector', label: 'Inspector', route: '/inspector' }
];

export const PHASES = [
	{ name: 'DISCOVER', color: 'violet', agents: ['greenfield-wu', 'brownfield-wu'] },
	{
		name: 'PLAN',
		color: 'indigo',
		agents: ['brief', 'detail', 'architect', 'ux', 'phases', 'tasks', 'qa-planning']
	},
	{ name: 'BUILD', color: 'emerald', agents: ['dev', 'qa-implementation'] },
	{ name: 'DEPLOY', color: 'sky', agents: ['devops'] }
];

// ── Label helpers ─────────────────────────────────────────────────────────────
export function kindLabel(kind) {
	const map = {
		user_prompt: 'User Prompt',
		assistant_response: 'System Reply',
		generated_prompt: 'Internal Prompt',
		llm_response: 'LLM Response',
		llm_stderr: 'LLM Error',
		tool_event: 'Tool Event',
		system_event: 'System Event'
	};
	return map[kind] || kind;
}

// ── CSS class helpers ─────────────────────────────────────────────────────────
export function kindBadgeCls(kind, dark) {
	const d = {
		user_prompt: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
		assistant_response: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
		generated_prompt: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
		llm_response: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
		llm_stderr: 'bg-red-500/15 text-red-300 border-red-500/30',
		tool_event: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
		system_event: 'bg-slate-700/60 text-slate-400 border-slate-600'
	};
	const l = {
		user_prompt: 'bg-violet-50 text-violet-700 border-violet-200',
		assistant_response: 'bg-sky-50 text-sky-700 border-sky-200',
		generated_prompt: 'bg-indigo-50 text-indigo-700 border-indigo-200',
		llm_response: 'bg-emerald-50 text-emerald-700 border-emerald-200',
		llm_stderr: 'bg-red-50 text-red-700 border-red-200',
		tool_event: 'bg-amber-50 text-amber-700 border-amber-200',
		system_event: 'bg-slate-100 text-slate-600 border-slate-200'
	};
	const fb = dark
		? 'bg-slate-700/60 text-slate-400 border-slate-600'
		: 'bg-slate-100 text-slate-600 border-slate-200';
	return (dark ? d[kind] : l[kind]) || fb;
}

export function kindDotCls(kind) {
	const map = {
		user_prompt: 'bg-violet-400',
		assistant_response: 'bg-sky-400',
		generated_prompt: 'bg-indigo-400',
		llm_response: 'bg-emerald-400',
		llm_stderr: 'bg-red-400',
		tool_event: 'bg-amber-400',
		system_event: 'bg-slate-400'
	};
	return map[kind] || 'bg-slate-400';
}

export function kindBorderCls(kind) {
	const map = {
		user_prompt: 'border-l-violet-500',
		assistant_response: 'border-l-sky-500',
		generated_prompt: 'border-l-indigo-500',
		llm_response: 'border-l-emerald-500',
		llm_stderr: 'border-l-red-500',
		tool_event: 'border-l-amber-500',
		system_event: 'border-l-slate-500'
	};
	return map[kind] || 'border-l-slate-500';
}

export function statusBadgeCls(status, dark) {
	const d = {
		active: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
		completed: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
		partial: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
		observed: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
		pending: 'bg-slate-700/60 text-slate-500 border-slate-600',
		error: 'bg-red-500/15 text-red-300 border-red-500/30'
	};
	const l = {
		active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
		completed: 'bg-sky-50 text-sky-700 border-sky-200',
		partial: 'bg-amber-50 text-amber-700 border-amber-200',
		observed: 'bg-indigo-50 text-indigo-700 border-indigo-200',
		pending: 'bg-slate-100 text-slate-500 border-slate-200',
		error: 'bg-red-50 text-red-700 border-red-200'
	};
	return (dark ? d[status] : l[status]) || (dark ? d.pending : l.pending);
}

export function statusDotCls(status) {
	const map = {
		active: 'bg-emerald-400 animate-pulse',
		completed: 'bg-sky-400',
		partial: 'bg-amber-400',
		observed: 'bg-indigo-400',
		pending: 'bg-slate-600',
		error: 'bg-red-400'
	};
	return map[status] || 'bg-slate-600';
}

export function pipelineNodeStatus(agent, session, handoffSummary, agentStats) {
	if (session.currentAgent === agent) return 'current';
	const handoff = handoffSummary.byAgent?.[agent];
	if (handoff?.status === 'complete') return 'complete';
	if (handoff?.status === 'partial') return 'partial';
	const stat = agentStats.find((x) => x.agent === agent);
	if (stat?.status === 'completed') return 'complete';
	if (stat?.status === 'observed') return 'observed';
	return 'pending';
}

export function pipelineNodeCls(status, dark) {
	const d = {
		current:
			'border-blue-400 bg-blue-500/20 text-blue-200 ring-1 ring-blue-400/30 shadow-blue-500/20 shadow-lg',
		complete: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300',
		partial: 'border-amber-500/50 bg-amber-500/10 text-amber-300',
		observed: 'border-indigo-500/50 bg-indigo-500/10 text-indigo-300',
		pending: 'border-slate-700 bg-slate-900/60 text-slate-600'
	};
	const l = {
		current:
			'border-blue-400 bg-blue-100 text-blue-700 ring-1 ring-blue-400/30 shadow-blue-200/50 shadow-lg',
		complete: 'border-emerald-400 bg-emerald-100 text-emerald-700',
		partial: 'border-amber-400 bg-amber-100 text-amber-700',
		observed: 'border-indigo-400 bg-indigo-100 text-indigo-700',
		pending: 'border-slate-200 bg-white text-slate-400'
	};
	return (dark ? d[status] : l[status]) || (dark ? d.pending : l.pending);
}

export function phaseHeaderCls(color, dark) {
	const d = {
		violet: 'text-violet-300',
		indigo: 'text-indigo-300',
		emerald: 'text-emerald-300',
		sky: 'text-sky-300'
	};
	const l = {
		violet: 'text-violet-700',
		indigo: 'text-indigo-700',
		emerald: 'text-emerald-700',
		sky: 'text-sky-700'
	};
	return dark ? d[color] || 'text-slate-300' : l[color] || 'text-slate-700';
}

export function phaseBorderCls(color, dark) {
	const d = {
		violet: 'border-violet-500/30',
		indigo: 'border-indigo-500/30',
		emerald: 'border-emerald-500/30',
		sky: 'border-sky-500/30'
	};
	const l = {
		violet: 'border-violet-200',
		indigo: 'border-indigo-200',
		emerald: 'border-emerald-200',
		sky: 'border-sky-200'
	};
	return dark ? d[color] || 'border-slate-700' : l[color] || 'border-slate-200';
}

export function phaseLeftBorderCls(agentName) {
	const phase = PHASES.find((p) => p.agents.includes(agentName));
	if (!phase) return 'border-l-slate-500';
	const map = {
		violet: 'border-l-violet-500',
		indigo: 'border-l-indigo-500',
		emerald: 'border-l-emerald-500',
		sky: 'border-l-sky-500'
	};
	return map[phase.color] || 'border-l-slate-500';
}

// ── Date / time formatters ────────────────────────────────────────────────────
export function formatTime(ts) {
	if (!ts) return '—';
	try {
		const d = new Date(ts);
		if (isNaN(d.getTime())) return ts;
		return d.toLocaleTimeString('en-US', {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
	} catch {
		return ts;
	}
}

export function formatLastSeen(ts) {
	if (!ts) return '—';
	if (/^\d{4}-\d{2}-\d{2}$/.test(String(ts))) return String(ts);
	return formatTime(ts);
}

export function formatDate(ts) {
	if (!ts) return '—';
	try {
		const d = new Date(ts);
		if (isNaN(d.getTime())) return ts;
		return (
			d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
			' ' +
			d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
		);
	} catch {
		return ts;
	}
}
