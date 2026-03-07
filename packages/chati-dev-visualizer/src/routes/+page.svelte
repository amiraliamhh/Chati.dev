<script>
	import { onMount } from 'svelte';
	import {
		aggregateHandoffs,
		buildEventSummary,
		filterInteractions,
		getActivePipeline,
		getAgentStats,
		normalizeLog,
		parseSessionYaml,
		uniqueValues
	} from '$lib/visualizer.js';

	const TABS = [
		{ id: 'Overview', label: 'Overview' },
		{ id: 'Conversation', label: 'Conversation' },
		{ id: 'Timeline', label: 'Timeline' },
		{ id: 'Agents', label: 'Agents' },
		{ id: 'Pipeline', label: 'Pipeline' },
		{ id: 'LLM Trace', label: 'LLM Trace' },
		{ id: 'Inspector', label: 'Inspector' }
	];

	const PHASES = [
		{ name: 'DISCOVER', color: 'violet', agents: ['greenfield-wu', 'brownfield-wu'] },
		{
			name: 'PLAN',
			color: 'indigo',
			agents: ['brief', 'detail', 'architect', 'ux', 'phases', 'tasks', 'qa-planning']
		},
		{ name: 'BUILD', color: 'emerald', agents: ['dev', 'qa-implementation'] },
		{ name: 'DEPLOY', color: 'sky', agents: ['devops'] }
	];

	const TABS_WITH_FILTERS = new Set(['Timeline', 'LLM Trace']);

	function kindLabel(kind) {
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

	function kindBadgeCls(kind, dark) {
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
		const fb = dark ? 'bg-slate-700/60 text-slate-400 border-slate-600' : 'bg-slate-100 text-slate-600 border-slate-200';
		return (dark ? d[kind] : l[kind]) || fb;
	}

	function kindDotCls(kind) {
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

	function kindBorderCls(kind) {
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

	function statusBadgeCls(status, dark) {
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

	function statusDotCls(status) {
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

	function pipelineNodeStatus(agent, session, handoffSummary, agentStats) {
		if (session.currentAgent === agent) return 'current';
		const handoff = handoffSummary.byAgent?.[agent];
		if (handoff?.status === 'complete') return 'complete';
		if (handoff?.status === 'partial') return 'partial';
		// Fall back to agentStats which now incorporates artifacts as evidence
		const stat = agentStats.find((x) => x.agent === agent);
		if (stat?.status === 'completed') return 'complete';
		if (stat?.status === 'observed') return 'observed';
		return 'pending';
	}

	function pipelineNodeCls(status, dark) {
		const d = {
			current: 'border-blue-400 bg-blue-500/20 text-blue-200 ring-1 ring-blue-400/30 shadow-blue-500/20 shadow-lg',
			complete: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300',
			partial: 'border-amber-500/50 bg-amber-500/10 text-amber-300',
			observed: 'border-indigo-500/50 bg-indigo-500/10 text-indigo-300',
			pending: 'border-slate-700 bg-slate-900/60 text-slate-600'
		};
		const l = {
			current: 'border-blue-400 bg-blue-100 text-blue-700 ring-1 ring-blue-400/30 shadow-blue-200/50 shadow-lg',
			complete: 'border-emerald-400 bg-emerald-100 text-emerald-700',
			partial: 'border-amber-400 bg-amber-100 text-amber-700',
			observed: 'border-indigo-400 bg-indigo-100 text-indigo-700',
			pending: 'border-slate-200 bg-white text-slate-400'
		};
		return (dark ? d[status] : l[status]) || (dark ? d.pending : l.pending);
	}

	function phaseHeaderCls(color, dark) {
		const d = { violet: 'text-violet-300', indigo: 'text-indigo-300', emerald: 'text-emerald-300', sky: 'text-sky-300' };
		const l = { violet: 'text-violet-700', indigo: 'text-indigo-700', emerald: 'text-emerald-700', sky: 'text-sky-700' };
		return dark ? (d[color] || 'text-slate-300') : (l[color] || 'text-slate-700');
	}

	function phaseBorderCls(color, dark) {
		const d = { violet: 'border-violet-500/30', indigo: 'border-indigo-500/30', emerald: 'border-emerald-500/30', sky: 'border-sky-500/30' };
		const l = { violet: 'border-violet-200', indigo: 'border-indigo-200', emerald: 'border-emerald-200', sky: 'border-sky-200' };
		return dark ? (d[color] || 'border-slate-700') : (l[color] || 'border-slate-200');
	}

	function phaseChipCls(color, dark) {
		const d = {
			violet: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
			indigo: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
			emerald: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
			sky: 'bg-sky-500/15 text-sky-300 border-sky-500/30'
		};
		const l = {
			violet: 'bg-violet-50 text-violet-700 border-violet-200',
			indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
			emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
			sky: 'bg-sky-50 text-sky-700 border-sky-200'
		};
		return dark ? (d[color] || '') : (l[color] || '');
	}

	function formatTime(ts) {
		if (!ts) return '—';
		try {
			const d = new Date(ts);
			if (isNaN(d.getTime())) return ts;
			return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
		} catch {
			return ts;
		}
	}

	function formatLastSeen(ts) {
		if (!ts) return '—';
		// Date-only strings from handoff frontmatter (e.g. "2026-03-04") — show as-is
		if (/^\d{4}-\d{2}-\d{2}$/.test(String(ts))) return String(ts);
		return formatTime(ts);
	}

	function formatDate(ts) {
		if (!ts) return '—';
		try {
			const d = new Date(ts);
			if (isNaN(d.getTime())) return ts;
			return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
		} catch {
			return ts;
		}
	}

	let activeTab = $state('Overview');
	let loadError = $state('');
	let sessionRaw = $state('');
	let session = $state({});
	let logRaw = $state('');
	let log = $state(normalizeLog(null));
	let handoffFiles = $state([]);
	let artifacts = $state([]);
	let apiInfo = $state(null);
	let selectedEvent = $state(null);
	let theme = $state('dark');
	let loading = $state(false);
	let copied = $state(false);

	let filters = $state({
		kind: 'all',
		agent: 'all',
		provider: 'all',
		model: 'all',
		query: ''
	});

	let summary = $derived(buildEventSummary(log));
	let pipeline = $derived(getActivePipeline(session));
	let agentStats = $derived(getAgentStats(log, session, handoffFiles, artifacts, pipeline));
	// In-pipeline agents sorted by pipeline order, then not-applicable agents at the end
	let sortedAgentStats = $derived(
		(() => {
			const pipelineOrder = new Map(pipeline.map((a, i) => [a, i]));
			const inPipeline = agentStats
				.filter((a) => a.status !== 'not-applicable')
				.sort(
					(a, b) => (pipelineOrder.get(a.agent) ?? 999) - (pipelineOrder.get(b.agent) ?? 999)
				);
			const notApplicable = agentStats.filter((a) => a.status === 'not-applicable');
			return [...inPipeline, ...notApplicable];
		})()
	);
	let notApplicableStart = $derived(
		sortedAgentStats.findIndex((a) => a.status === 'not-applicable')
	);
	let handoffSummary = $derived(aggregateHandoffs(handoffFiles));
	let kinds = $derived(uniqueValues(log.interactions, 'kind'));
	let agents = $derived(uniqueValues(log.interactions, 'agent'));
	let providers = $derived(uniqueValues(log.interactions, 'provider'));
	let models = $derived(uniqueValues(log.interactions, 'model'));
	let filtered = $derived(filterInteractions(log.interactions, filters));
	let isDark = $derived(theme === 'dark');
	let llmTrace = $derived(
		filtered.filter((x) =>
			['generated_prompt', 'llm_response', 'llm_stderr', 'system_event', 'tool_event'].includes(x.kind)
		)
	);

	onMount(() => {
		const storedTheme = localStorage.getItem('chati-visualizer-theme');
		if (storedTheme === 'light' || storedTheme === 'dark') {
			theme = storedTheme;
		} else if (window.matchMedia('(prefers-color-scheme: light)').matches) {
			theme = 'light';
		}
		loadFromApi();
	});

	function toggleTheme() {
		theme = theme === 'dark' ? 'light' : 'dark';
		localStorage.setItem('chati-visualizer-theme', theme);
	}

	async function loadFromApi() {
		loadError = '';
		loading = true;
		try {
			const response = await fetch('/api/logs');
			if (!response.ok) {
				loadError = `Could not load from server: ${response.status}`;
				return;
			}
			const payload = await response.json();
			apiInfo = payload;

			const interactionLog = payload?.data?.interactionLog;
			if (interactionLog) {
				log = normalizeLog(interactionLog);
				logRaw = JSON.stringify(interactionLog, null, 2);
			}

			if (payload?.data?.sessionRaw) {
				sessionRaw = payload.data.sessionRaw;
				session = payload.data.sessionParsed || parseSessionYaml(payload.data.sessionRaw);
			}

			if (Array.isArray(payload?.data?.handoffs)) {
				handoffFiles = payload.data.handoffs;
			}

			if (Array.isArray(payload?.data?.artifacts)) {
				artifacts = payload.data.artifacts;
			}
		} catch (err) {
			loadError = `Could not load from server: ${err.message}`;
		} finally {
			loading = false;
		}
	}

	function selectEvent(item) {
		selectedEvent = item;
		activeTab = 'Inspector';
	}

	function getPhaseForAgent(agentName) {
		return PHASES.find((p) => p.agents.includes(agentName)) || null;
	}

	function phaseLeftBorderCls(agentName) {
		const phase = getPhaseForAgent(agentName);
		if (!phase) return 'border-l-slate-500';
		const map = { violet: 'border-l-violet-500', indigo: 'border-l-indigo-500', emerald: 'border-l-emerald-500', sky: 'border-l-sky-500' };
		return map[phase.color] || 'border-l-slate-500';
	}

	// Group artifacts by folder (pipeline order already preserved by API sort)
	let artifactGroups = $derived(
		artifacts.reduce((groups, doc) => {
			const last = groups[groups.length - 1];
			if (last && last.folder === doc.folder) {
				last.docs.push(doc);
			} else {
				groups.push({ folder: doc.folder, agent: doc.agent || doc.folder, docs: [doc] });
			}
			return groups;
		}, [])
	);

	async function copyJson() {
		if (!selectedEvent) return;
		await navigator.clipboard.writeText(JSON.stringify(selectedEvent, null, 2));
		copied = true;
		setTimeout(() => { copied = false; }, 2000);
	}
</script>

<div class="flex min-h-screen {isDark ? 'bg-[#080b11] text-slate-100' : 'bg-slate-100 text-slate-900'}">

	<!-- ── Sidebar (desktop) ── -->
	<aside class="fixed inset-y-0 left-0 z-20 hidden w-56 flex-col border-r lg:flex {isDark ? 'border-slate-800 bg-[#0d1117]' : 'border-slate-200 bg-white'}">
		<!-- Logo -->
		<div class="flex items-center gap-3 border-b px-4 py-4 {isDark ? 'border-slate-800' : 'border-slate-200'}">
			<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-500 shadow-sm">
				<svg class="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<polyline points="16 18 22 12 16 6"></polyline>
					<polyline points="8 6 2 12 8 18"></polyline>
				</svg>
			</div>
			<div>
				<p class="text-sm font-bold leading-tight tracking-tight">Chati.dev</p>
				<p class="text-[10px] leading-tight {isDark ? 'text-slate-500' : 'text-slate-400'}">Visualizer</p>
			</div>
		</div>

		<!-- Nav -->
		<nav class="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
			{#each TABS as tab (tab.id)}
				<button
					onclick={() => (activeTab = tab.id)}
					class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors {activeTab === tab.id
						? isDark
							? 'bg-sky-500/15 font-medium text-sky-300'
							: 'bg-sky-50 font-medium text-sky-700'
						: isDark
							? 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100'
							: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}"
				>
					{#if tab.id === 'Overview'}
						<svg class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
					{:else if tab.id === 'Timeline'}
						<svg class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 12"/></svg>
					{:else if tab.id === 'Conversation'}
						<svg class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
					{:else if tab.id === 'Agents'}
						<svg class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
					{:else if tab.id === 'Pipeline'}
						<svg class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
					{:else if tab.id === 'LLM Trace'}
						<svg class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
					{:else if tab.id === 'Inspector'}
						<svg class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
					{/if}
					{tab.label}
				</button>
			{/each}
		</nav>

		<!-- Bottom actions -->
		<div class="space-y-1 border-t px-2 py-3 {isDark ? 'border-slate-800' : 'border-slate-200'}">
			<button
				onclick={toggleTheme}
				class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors {isDark ? 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}"
			>
				{#if isDark}
					<svg class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
					Light mode
				{:else}
					<svg class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
					Dark mode
				{/if}
			</button>
			<button
				onclick={loadFromApi}
				class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors {isDark ? 'text-sky-400 hover:bg-sky-500/10 hover:text-sky-300' : 'text-sky-600 hover:bg-sky-50 hover:text-sky-700'}"
			>
				<svg class="h-4 w-4 shrink-0 {loading ? 'animate-spin' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
				{loading ? 'Loading…' : 'Reload data'}
			</button>
		</div>
	</aside>

	<!-- ── Main content ── -->
	<div class="flex min-h-screen flex-1 flex-col lg:pl-56">

		<!-- Sticky header -->
		<header class="sticky top-0 z-10 flex h-12 items-center gap-4 border-b px-4 {isDark ? 'border-slate-800 bg-[#080b11]/90 backdrop-blur-sm' : 'border-slate-200 bg-white/90 backdrop-blur-sm'}">
			<!-- Project name -->
			<div class="min-w-0 flex-1">
				<p class="truncate text-sm font-semibold">
					{session.projectName || 'Chati.dev Visualizer'}
				</p>
			</div>

			<!-- Data status chips -->
			{#if apiInfo}
				<div class="hidden items-center gap-3 text-[11px] sm:flex">
					<span class="flex items-center gap-1.5 {apiInfo.found.log ? isDark ? 'text-emerald-400' : 'text-emerald-600' : isDark ? 'text-red-400' : 'text-red-600'}">
						<span class="h-1.5 w-1.5 rounded-full {apiInfo.found.log ? 'bg-emerald-400' : 'bg-red-400'}"></span>
						Log
					</span>
					<span class="flex items-center gap-1.5 {apiInfo.found.session ? isDark ? 'text-emerald-400' : 'text-emerald-600' : isDark ? 'text-red-400' : 'text-red-600'}">
						<span class="h-1.5 w-1.5 rounded-full {apiInfo.found.session ? 'bg-emerald-400' : 'bg-red-400'}"></span>
						Session
					</span>
					<span class="{isDark ? 'text-slate-500' : 'text-slate-400'}">{apiInfo.found.handoffs} handoffs</span>
				</div>
			{/if}

			<!-- Mobile actions -->
			<div class="flex items-center gap-1 lg:hidden">
				<button onclick={toggleTheme} class="rounded-lg p-2 {isDark ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-100' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}">
					{#if isDark}
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
					{:else}
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
					{/if}
				</button>
				<button aria-label="Reload data" onclick={loadFromApi} class="rounded-lg p-2 {isDark ? 'text-sky-400 hover:bg-sky-500/10' : 'text-sky-600 hover:bg-sky-50'}">
					<svg class="h-4 w-4 {loading ? 'animate-spin' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
				</button>
			</div>
		</header>

		<!-- Mobile tab bar -->
		<nav class="sticky top-12 z-10 flex overflow-x-auto border-b lg:hidden {isDark ? 'border-slate-800 bg-[#080b11]/95 backdrop-blur-sm' : 'border-slate-200 bg-white/95 backdrop-blur-sm'}">
			{#each TABS as tab (tab.id)}
				<button
					onclick={() => (activeTab = tab.id)}
					class="shrink-0 border-b-2 px-3 py-2.5 text-xs font-medium transition-colors {activeTab === tab.id
						? isDark
							? 'border-sky-400 text-sky-300'
							: 'border-sky-600 text-sky-700'
						: 'border-transparent ' + (isDark ? 'text-slate-500 hover:text-slate-300' : 'text-slate-500 hover:text-slate-700')}"
				>
					{tab.label}
				</button>
			{/each}
		</nav>

		<!-- Stats strip -->
		<div class="flex flex-wrap items-center gap-x-6 gap-y-2 border-b px-4 py-2.5 {isDark ? 'border-slate-800/60 bg-[#0d1117]' : 'border-slate-200 bg-white'}">
			{#each [
				{ label: 'Interactions', value: summary.totalInteractions, color: isDark ? 'text-sky-300' : 'text-sky-700' },
				{ label: 'User Prompts', value: summary.totalUserPrompts, color: isDark ? 'text-violet-300' : 'text-violet-700' },
				{ label: 'Conv. Turns', value: summary.totalConversationTurns, color: isDark ? 'text-emerald-300' : 'text-emerald-700' },
				{ label: 'Sys. Trace', value: summary.totalSystemTrace, color: isDark ? 'text-indigo-300' : 'text-indigo-700' },
				{ label: 'Handoffs', value: handoffSummary.total, color: isDark ? 'text-cyan-300' : 'text-cyan-700' },
				{ label: 'Docs', value: artifacts.length, color: isDark ? 'text-teal-300' : 'text-teal-700' },
				{ label: 'Blockers', value: handoffSummary.blockers, color: isDark ? 'text-amber-300' : 'text-amber-700' }
			] as stat (stat.label)}
				<div class="flex items-baseline gap-1.5">
					<span class="text-base font-bold tabular-nums {stat.color}">{stat.value}</span>
					<span class="text-[11px] {isDark ? 'text-slate-500' : 'text-slate-400'}">{stat.label}</span>
				</div>
			{/each}
		</div>

		<!-- Error banner -->
		{#if loadError}
			<div class="m-4 rounded-xl border px-4 py-3 text-sm {isDark ? 'border-red-900/60 bg-red-950/40 text-red-300' : 'border-red-200 bg-red-50 text-red-700'}">
				{loadError}
			</div>
		{/if}

		<!-- Filter bar (contextual) -->
		{#if TABS_WITH_FILTERS.has(activeTab)}
			<div class="flex flex-wrap gap-2 border-b px-4 py-2.5 {isDark ? 'border-slate-800/60 bg-[#0d1117]' : 'border-slate-200 bg-slate-50'}">
				{#each [
					{ key: 'kind', label: 'All kinds', options: kinds },
					{ key: 'agent', label: 'All agents', options: agents },
					{ key: 'provider', label: 'All providers', options: providers },
					{ key: 'model', label: 'All models', options: models }
				] as sel}
					<select
						bind:value={filters[sel.key]}
						class="rounded-lg border px-2.5 py-1.5 text-xs transition-colors {isDark ? 'border-slate-700 bg-slate-900 text-slate-200 focus:border-sky-500 focus:outline-none' : 'border-slate-300 bg-white text-slate-800 focus:border-sky-400 focus:outline-none'}"
					>
						<option value="all">{sel.label}</option>
						{#each sel.options as value (value)}<option {value}>{value}</option>{/each}
					</select>
				{/each}
				<input
					placeholder="Search…"
					bind:value={filters.query}
					class="flex-1 rounded-lg border px-2.5 py-1.5 text-xs transition-colors {isDark ? 'border-slate-700 bg-slate-900 text-slate-200 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none' : 'border-slate-300 bg-white text-slate-800 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none'}"
				/>
			</div>
		{/if}

		<!-- ── Tab content ── -->
		<main class="flex-1 p-4 lg:p-6">

			<!-- ─── OVERVIEW ─── -->
			{#if activeTab === 'Overview'}
				<div class="space-y-6">

					<!-- ── State hero ── -->
					<div class="grid gap-3 sm:grid-cols-3">
						<div class="rounded-2xl border p-4 {session.currentAgent ? isDark ? 'border-sky-500/30 bg-sky-500/10' : 'border-sky-300 bg-sky-50' : isDark ? 'border-slate-800 bg-[#0d1117]' : 'border-slate-200 bg-white'}">
							<p class="mb-1 text-[10px] font-semibold uppercase tracking-wider {isDark ? 'text-sky-400' : 'text-sky-600'}">Current Agent</p>
							<p class="text-2xl font-bold">{session.currentAgent || '—'}</p>
							<p class="mt-1 text-xs {isDark ? 'text-slate-400' : 'text-slate-500'}">{session.projectState || 'unknown state'}</p>
						</div>
						<div class="rounded-2xl border p-4 {isDark ? 'border-slate-800 bg-[#0d1117]' : 'border-slate-200 bg-white'}">
							<p class="mb-1 text-[10px] font-semibold uppercase tracking-wider {isDark ? 'text-slate-400' : 'text-slate-500'}">Project</p>
							<p class="truncate text-lg font-bold">{session.projectName || '—'}</p>
							<p class="mt-1 text-xs {isDark ? 'text-slate-400' : 'text-slate-500'}">{session.projectType || '—'} · {session.workflow || 'standard'}</p>
						</div>
						<div class="rounded-2xl border p-4 {isDark ? 'border-slate-800 bg-[#0d1117]' : 'border-slate-200 bg-white'}">
							<p class="mb-1 text-[10px] font-semibold uppercase tracking-wider {isDark ? 'text-slate-400' : 'text-slate-500'}">Mode</p>
							<p class="text-lg font-bold capitalize">{session.executionMode || '—'}</p>
							<p class="mt-1 text-xs {isDark ? 'text-slate-400' : 'text-slate-500'}">Language: {session.language || '—'}</p>
						</div>
					</div>

					<!-- ── Handoffs ── -->
					{#if handoffFiles.length > 0}
						<div>
							<h2 class="mb-3 text-sm font-semibold {isDark ? 'text-slate-200' : 'text-slate-800'}">Agent Handoffs</h2>
							<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
							{#each handoffFiles as h (h.id)}
								<a
									href="/handoff/{h.fromAgent}"
									class="group flex flex-col rounded-2xl border transition-colors {isDark ? 'border-slate-800 bg-[#0d1117] hover:border-slate-700' : 'border-slate-200 bg-white hover:border-slate-300'}"
								>
									<!-- Header -->
									<div class="flex items-center justify-between gap-2 border-b px-4 py-3 {isDark ? 'border-slate-800' : 'border-slate-100'}">
										<div class="flex min-w-0 items-center gap-2">
											<span class="h-2 w-2 shrink-0 rounded-full {statusDotCls(h.status)}"></span>
											<span class="truncate text-sm font-semibold">{h.fromAgent || 'Unknown'}</span>
										</div>
										<div class="flex shrink-0 items-center gap-2">
											{#if h.score !== null && h.score !== undefined}
												<span class="text-xs font-bold tabular-nums {h.score >= 80 ? isDark ? 'text-emerald-400' : 'text-emerald-600' : h.score >= 60 ? isDark ? 'text-amber-400' : 'text-amber-600' : isDark ? 'text-red-400' : 'text-red-600'}">{h.score}/100</span>
											{/if}
											<span class="rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize {statusBadgeCls(h.status, isDark)}">{h.status}</span>
										</div>
									</div>

									<!-- Summary snippet -->
									<div class="flex-1 px-4 py-3">
										{#if h.summary}
											<p class="line-clamp-3 text-xs leading-relaxed {isDark ? 'text-slate-400' : 'text-slate-500'}">{h.summary}</p>
										{:else}
											<p class="text-xs {isDark ? 'text-slate-600' : 'text-slate-400'}">No summary available.</p>
										{/if}
									</div>

									<!-- Footer / CTA -->
									<div class="flex items-center justify-between border-t px-4 py-2.5 text-[10px] {isDark ? 'border-slate-800 text-slate-500' : 'border-slate-100 text-slate-400'}">
										<div class="flex items-center gap-3">
											{#if h.to}
												<span>→ {h.to}</span>
											{/if}
											{#if h.criteriaCount}
												<span>{h.criteriaCount} criteria</span>
											{/if}
											{#if h.timestamp}
												<span>{h.timestamp}</span>
											{/if}
										</div>
										<span class="flex items-center gap-1 transition-colors {isDark ? 'text-sky-500 group-hover:text-sky-400' : 'text-sky-600 group-hover:text-sky-700'}">
											View handoff
											<svg class="h-3 w-3 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
										</span>
									</div>
								</a>
							{/each}
							</div>
						</div>
					{/if}

					<!-- ── Agent Documents — pipeline timeline ── -->
					{#if artifactGroups.length > 0}
						<div>
							<h2 class="mb-4 text-sm font-semibold {isDark ? 'text-slate-200' : 'text-slate-800'}">Agent Documents</h2>

							<!--
								Each flex child is [Box + Arrow] paired together so that when
								the row wraps, the arrow always stays attached to its preceding
								box and never hangs alone at the start of a new row.
							-->
							<div class="flex flex-wrap gap-y-4">
								{#each artifactGroups as group, i (group.folder)}
									{@const phase = getPhaseForAgent(group.agent)}

									<div class="flex items-center">
										<!-- Agent box -->
										<div class="flex w-44 flex-col rounded-xl border border-l-4 {phaseLeftBorderCls(group.agent)} {isDark ? 'border-slate-800 bg-[#0d1117]' : 'border-slate-200 bg-white'}">
											<!-- Box header: phase label + agent name -->
											<div class="border-b px-3 pt-2.5 pb-2 {isDark ? 'border-slate-800' : 'border-slate-100'}">
												{#if phase}
													<p class="mb-0.5 text-[9px] font-bold uppercase tracking-widest {phaseHeaderCls(phase.color, isDark)}">{phase.name}</p>
												{/if}
												<p class="text-sm font-semibold leading-snug">{group.agent}</p>
											</div>

											<!-- Document links -->
											<div class="flex-1 space-y-1 px-3 py-2.5">
												{#each group.docs as doc (doc.fileName)}
													<a
														href="/doc/{doc.folder}"
														class="flex items-start gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors {isDark ? 'text-slate-300 hover:bg-slate-800 hover:text-sky-300' : 'text-slate-600 hover:bg-slate-50 hover:text-sky-700'}"
													>
														<svg class="mt-0.5 h-3.5 w-3.5 shrink-0 {isDark ? 'text-slate-500' : 'text-slate-400'}" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
															<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
														</svg>
														<span class="leading-snug">{doc.title}</span>
													</a>
												{/each}
											</div>
										</div>

										<!-- Graphic arrow (shaft + filled head) — hidden after last box -->
										{#if i < artifactGroups.length - 1}
											<div class="flex w-10 shrink-0 items-center justify-center {isDark ? 'text-slate-600' : 'text-slate-300'}">
												<svg width="34" height="14" viewBox="0 0 34 14" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
													<!-- Shaft -->
													<rect x="0" y="6" width="24" height="2" rx="1"/>
													<!-- Arrowhead triangle -->
													<polygon points="22,1 34,7 22,13"/>
												</svg>
											</div>
										{/if}
									</div>
								{/each}
							</div>
						</div>
					{/if}

					<!-- ── Recent events + breakdown ── -->
					<div class="grid gap-4 lg:grid-cols-[1fr,260px]">
						<div class="rounded-2xl border {isDark ? 'border-slate-800 bg-[#0d1117]' : 'border-slate-200 bg-white'}">
							<div class="border-b px-4 py-3 {isDark ? 'border-slate-800' : 'border-slate-200'}">
								<h2 class="text-sm font-semibold">Recent Events</h2>
							</div>
							{#if log.timeline.length === 0}
								<div class="flex flex-col items-center justify-center py-12 text-center">
									<p class="text-2xl">📭</p>
									<p class="mt-2 text-sm font-medium {isDark ? 'text-slate-300' : 'text-slate-600'}">No events yet</p>
									<p class="mt-1 text-xs {isDark ? 'text-slate-500' : 'text-slate-400'}">Start a Chati.dev session to see activity here.</p>
								</div>
							{:else}
								<ul class="divide-y {isDark ? 'divide-slate-800/60' : 'divide-slate-100'}">
									{#each log.timeline.slice(-12).reverse() as row, i (`${row.timestamp}-${row.kind}-${i}`)}
										<li>
											<button onclick={() => selectEvent(row)} class="flex w-full gap-3 px-4 py-3 text-left transition-colors {isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'}">
												<span class="mt-0.5 h-2 w-2 shrink-0 rounded-full {kindDotCls(row.kind)}"></span>
												<div class="min-w-0 flex-1">
													<div class="flex items-center justify-between gap-2">
														<span class="text-xs font-medium {isDark ? 'text-slate-200' : 'text-slate-700'}">{kindLabel(row.kind)}</span>
														<span class="shrink-0 text-[10px] tabular-nums {isDark ? 'text-slate-500' : 'text-slate-400'}">{formatTime(row.timestamp)}</span>
													</div>
													<p class="mt-0.5 line-clamp-1 text-xs {isDark ? 'text-slate-400' : 'text-slate-500'}">{row.preview || '—'}</p>
												</div>
											</button>
										</li>
									{/each}
								</ul>
							{/if}
						</div>

						<div class="rounded-2xl border {isDark ? 'border-slate-800 bg-[#0d1117]' : 'border-slate-200 bg-white'}">
							<div class="border-b px-4 py-3 {isDark ? 'border-slate-800' : 'border-slate-200'}">
								<h2 class="text-sm font-semibold">Event Breakdown</h2>
							</div>
							{#if Object.keys(summary.byKind).length === 0}
								<div class="px-4 py-8 text-center text-xs {isDark ? 'text-slate-500' : 'text-slate-400'}">No events to break down.</div>
							{:else}
								<ul class="divide-y {isDark ? 'divide-slate-800/60' : 'divide-slate-100'}">
									{#each Object.entries(summary.byKind).sort((a, b) => b[1] - a[1]) as [kind, count] (kind)}
										<li class="flex items-center gap-3 px-4 py-2.5">
											<span class="h-2 w-2 shrink-0 rounded-full {kindDotCls(kind)}"></span>
											<span class="flex-1 text-xs {isDark ? 'text-slate-300' : 'text-slate-600'}">{kindLabel(kind)}</span>
											<span class="text-xs font-bold tabular-nums {isDark ? 'text-slate-200' : 'text-slate-800'}">{count}</span>
										</li>
									{/each}
								</ul>
							{/if}
						</div>
					</div>
				</div>

			<!-- ─── TIMELINE ─── -->
			{:else if activeTab === 'Timeline'}
				<div class="rounded-2xl border {isDark ? 'border-slate-800 bg-[#0d1117]' : 'border-slate-200 bg-white'}">
					{#if filtered.length === 0}
						<div class="flex flex-col items-center justify-center py-16 text-center">
							<p class="text-3xl">🔍</p>
							<p class="mt-3 text-sm font-medium {isDark ? 'text-slate-300' : 'text-slate-600'}">No events match your filters</p>
							<p class="mt-1 text-xs {isDark ? 'text-slate-500' : 'text-slate-400'}">Try adjusting the filters above.</p>
						</div>
					{:else}
						<ul class="divide-y {isDark ? 'divide-slate-800/40' : 'divide-slate-100'}">
							{#each filtered.slice().reverse() as item, i (`${item.timestamp}-${item.kind}-${item.taskId || ''}-${i}`)}
								<li>
									<button
										onclick={() => selectEvent(item)}
										class="flex w-full gap-3 border-l-2 px-4 py-3 text-left transition-colors {kindBorderCls(item.kind)} {isDark ? 'hover:bg-slate-800/30' : 'hover:bg-slate-50'}"
									>
										<div class="min-w-0 flex-1 space-y-1.5">
											<div class="flex flex-wrap items-center gap-2">
												<span class="inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold {kindBadgeCls(item.kind, isDark)}">
													{kindLabel(item.kind)}
												</span>
												{#if item.agent}
													<span class="text-[10px] {isDark ? 'text-slate-400' : 'text-slate-500'}">{item.agent}</span>
												{/if}
												{#if item.provider || item.model}
													<span class="text-[10px] {isDark ? 'text-slate-500' : 'text-slate-400'}">{item.provider || ''}{item.model ? '/' + item.model : ''}</span>
												{/if}
												<span class="ml-auto shrink-0 text-[10px] tabular-nums {isDark ? 'text-slate-500' : 'text-slate-400'}">{formatTime(item.timestamp)}</span>
											</div>
											{#if item.text}
												<p class="line-clamp-2 text-xs {isDark ? 'text-slate-300' : 'text-slate-600'}">{item.text.slice(0, 300)}</p>
											{/if}
										</div>
									</button>
								</li>
							{/each}
						</ul>
					{/if}
				</div>

			<!-- ─── CONVERSATION ─── -->
			{:else if activeTab === 'Conversation'}
				<div class="mx-auto max-w-3xl space-y-4">
					{#if log.conversation.length === 0}
						<div class="flex flex-col items-center justify-center py-16 text-center">
							<p class="text-3xl">💬</p>
							<p class="mt-3 text-sm font-medium {isDark ? 'text-slate-300' : 'text-slate-600'}">No conversation yet</p>
							<p class="mt-1 text-xs {isDark ? 'text-slate-500' : 'text-slate-400'}">Conversation turns will appear here once a session starts.</p>
						</div>
					{:else}
						{#each log.conversation as turn, i (`${turn.timestamp}-${turn.role}-${i}`)}
							{#if turn.role === 'user'}
								<div class="flex justify-end">
									<div class="max-w-[78%]">
										<div class="mb-1 flex items-center justify-end gap-2">
											<span class="text-[10px] tabular-nums {isDark ? 'text-slate-500' : 'text-slate-400'}">{formatTime(turn.timestamp)}</span>
											<span class="text-[10px] font-semibold {isDark ? 'text-violet-400' : 'text-violet-600'}">You</span>
										</div>
										<div class="whitespace-pre-wrap wrap-break-word rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed {isDark ? 'bg-violet-500/20 text-slate-100' : 'bg-violet-100 text-violet-950'}">
											{turn.text}
										</div>
										{#if turn.source && turn.source !== 'unknown'}
											<p class="mt-1 text-right text-[10px] {isDark ? 'text-slate-600' : 'text-slate-400'}">{turn.source}</p>
										{/if}
									</div>
								</div>
							{:else}
								<div class="flex justify-start">
									<div class="max-w-[78%]">
										<div class="mb-1 flex items-center gap-2">
											<span class="text-[10px] font-semibold {isDark ? 'text-sky-400' : 'text-sky-600'}">System</span>
											<span class="text-[10px] tabular-nums {isDark ? 'text-slate-500' : 'text-slate-400'}">{formatTime(turn.timestamp)}</span>
										</div>
										<div class="whitespace-pre-wrap wrap-break-word rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed {isDark ? 'bg-slate-800 text-slate-100' : 'bg-slate-100 text-slate-800'}">
											{turn.text}
										</div>
										{#if turn.source && turn.source !== 'unknown'}
											<p class="mt-1 text-[10px] {isDark ? 'text-slate-600' : 'text-slate-400'}">{turn.source}</p>
										{/if}
									</div>
								</div>
							{/if}
						{/each}
					{/if}
				</div>

			<!-- ─── AGENTS ─── -->
			{:else if activeTab === 'Agents'}
				<div class="space-y-4">
					<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
						{#each sortedAgentStats as a, i (a.agent)}
							<!-- Separator label before the first not-applicable agent -->
							{#if i === notApplicableStart && notApplicableStart > 0}
								<div class="col-span-full mt-2 flex items-center gap-3">
									<span class="text-xs font-medium {isDark ? 'text-slate-500' : 'text-slate-400'}">Not used in this pipeline</span>
									<div class="h-px flex-1 {isDark ? 'bg-slate-800' : 'bg-slate-200'}"></div>
								</div>
							{/if}

							{#if a.status === 'not-applicable'}
								<!-- Dimmed card for agents not part of the active pipeline -->
								<article class="rounded-2xl border p-4 opacity-40 {isDark ? 'border-slate-800 bg-[#0d1117]' : 'border-slate-200 bg-white'}">
									<header class="mb-3 flex items-center justify-between gap-2">
										<h3 class="truncate text-sm font-semibold {isDark ? 'text-slate-400' : 'text-slate-500'}">{a.agent}</h3>
										<span class="shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium {isDark ? 'border-slate-700 text-slate-500' : 'border-slate-300 text-slate-400'}">
											Not used
										</span>
									</header>
									<p class="text-[11px] {isDark ? 'text-slate-600' : 'text-slate-400'}">
										Not part of the {session.projectType === 'brownfield' ? 'brownfield' : 'greenfield'} pipeline for this project.
									</p>
								</article>
							{:else if a.status === 'skipped'}
								<!-- Amber-tinted card for explicitly skipped agents -->
								<article class="rounded-2xl border p-4 transition-colors {isDark ? 'border-amber-900/40 bg-[#0d1117]' : 'border-amber-200 bg-amber-50/30'}">
									<header class="mb-3 flex items-center justify-between gap-2">
										<div class="flex items-center gap-2 min-w-0">
											<span class="h-2 w-2 shrink-0 rounded-full bg-amber-500"></span>
											<h3 class="truncate text-sm font-semibold">{a.agent}</h3>
										</div>
										<span class="shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium {isDark ? 'border-amber-800 bg-amber-900/30 text-amber-400' : 'border-amber-300 bg-amber-100 text-amber-700'}">
											Skipped
										</span>
									</header>
									<p class="text-[11px] {isDark ? 'text-slate-500' : 'text-slate-400'}">
										This agent was part of the pipeline but was skipped during the run.
									</p>
								</article>
							{:else}
								<!-- Regular agent card -->
								<article class="rounded-2xl border p-4 transition-colors {isDark ? 'border-slate-800 bg-[#0d1117] hover:border-slate-700' : 'border-slate-200 bg-white hover:border-slate-300'}">
									<header class="mb-3 flex items-center justify-between gap-2">
										<div class="flex items-center gap-2 min-w-0">
											<span class="h-2 w-2 shrink-0 rounded-full {statusDotCls(a.status)}"></span>
											<h3 class="truncate text-sm font-semibold">{a.agent}</h3>
										</div>
										<span class="shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize {statusBadgeCls(a.status, isDark)}">
											{a.status}
										</span>
									</header>
									<dl class="space-y-1.5 text-xs">
										{#if a.events === 0 && a.status !== 'pending'}
											<dd class="rounded-lg border px-2 py-1.5 text-[10px] leading-snug {isDark ? 'border-slate-700/60 bg-slate-800/40 text-slate-500' : 'border-slate-200 bg-slate-50 text-slate-400'}">
												Status inferred from {a.handoffStatus ? 'handoff file' : 'artifact documents'} — no interaction log available.
											</dd>
										{:else}
											<div class="flex items-center justify-between">
												<dt class="{isDark ? 'text-slate-500' : 'text-slate-400'}">Events</dt>
												<dd class="font-semibold tabular-nums">{a.events}</dd>
											</div>
											<div class="flex items-center justify-between">
												<dt class="{isDark ? 'text-slate-500' : 'text-slate-400'}">User prompts</dt>
												<dd class="font-semibold tabular-nums">{a.userPrompts}</dd>
											</div>
											<div class="flex items-center justify-between">
												<dt class="{isDark ? 'text-slate-500' : 'text-slate-400'}">LLM responses</dt>
												<dd class="font-semibold tabular-nums">{a.llmResponses}</dd>
											</div>
										{/if}
										{#if a.lastSeen}
											<div class="flex items-center justify-between">
												<dt class="{isDark ? 'text-slate-500' : 'text-slate-400'}">Last seen</dt>
												<dd class="tabular-nums {isDark ? 'text-slate-400' : 'text-slate-500'}">{formatLastSeen(a.lastSeen)}</dd>
											</div>
										{/if}
										{#if a.providers.length > 0}
											<div class="flex items-start justify-between gap-2 pt-1">
												<dt class="{isDark ? 'text-slate-500' : 'text-slate-400'}">Models</dt>
												<dd class="flex flex-wrap justify-end gap-1">
													{#each a.providers as p (p)}
														<span class="rounded border px-1.5 py-0.5 text-[10px] {isDark ? 'border-slate-700 text-slate-400' : 'border-slate-200 text-slate-500'}">{p}</span>
													{/each}
												</dd>
											</div>
										{/if}
									</dl>
									{#if handoffSummary.byAgent?.[a.agent]}
										{@const h = handoffSummary.byAgent[a.agent]}
										<div class="mt-3 border-t pt-3 {isDark ? 'border-slate-800' : 'border-slate-100'}">
											<div class="flex items-center justify-between text-xs">
												<span class="{isDark ? 'text-slate-500' : 'text-slate-400'}">Handoff</span>
												<div class="flex items-center gap-2">
													<span class="capitalize {isDark ? 'text-slate-300' : 'text-slate-700'}">{h.status}</span>
													{#if h.score !== null && h.score !== undefined}
														<span class="font-bold tabular-nums {h.score >= 80 ? isDark ? 'text-emerald-400' : 'text-emerald-600' : h.score >= 60 ? isDark ? 'text-amber-400' : 'text-amber-600' : isDark ? 'text-red-400' : 'text-red-600'}">{h.score}/100</span>
													{/if}
												</div>
											</div>
											{#if h.blockers?.length > 0}
												<p class="mt-1 text-[10px] {isDark ? 'text-amber-400' : 'text-amber-600'}">{h.blockers.length} blocker{h.blockers.length > 1 ? 's' : ''}</p>
											{/if}
										</div>
									{/if}
								</article>
							{/if}
						{/each}
					</div>

					<!-- Handoff list -->
					{#if handoffFiles.length > 0}
						<div class="rounded-2xl border {isDark ? 'border-slate-800 bg-[#0d1117]' : 'border-slate-200 bg-white'}">
							<div class="border-b px-4 py-3 {isDark ? 'border-slate-800' : 'border-slate-200'}">
								<h3 class="text-sm font-semibold">Agent Handoffs</h3>
							</div>
							<ul class="divide-y {isDark ? 'divide-slate-800/40' : 'divide-slate-100'}">
								{#each handoffFiles as h, i (h.id || `${h.fromAgent}-${i}`)}
									<li>
										<button onclick={() => selectEvent(h)} class="flex w-full gap-3 px-4 py-3 text-left transition-colors {isDark ? 'hover:bg-slate-800/30' : 'hover:bg-slate-50'}">
											<div class="min-w-0 flex-1">
												<div class="flex flex-wrap items-center gap-2">
													<span class="text-xs font-semibold {isDark ? 'text-sky-300' : 'text-sky-700'}">{h.fromAgent || 'unknown'}</span>
													<span class="{isDark ? 'text-slate-500' : 'text-slate-400'}">→</span>
													<span class="text-xs {isDark ? 'text-slate-300' : 'text-slate-600'}">{h.to || 'orchestrator'}</span>
													<span class="rounded border px-1.5 py-0.5 text-[10px] capitalize {statusBadgeCls(h.status, isDark)}">{h.status}</span>
													{#if h.score !== null && h.score !== undefined}
														<span class="text-xs font-bold tabular-nums {isDark ? 'text-slate-300' : 'text-slate-700'}">{h.score}/100</span>
													{/if}
													<span class="ml-auto text-[10px] tabular-nums {isDark ? 'text-slate-500' : 'text-slate-400'}">{formatDate(h.timestamp)}</span>
												</div>
												{#if h.summary}
													<p class="mt-1 line-clamp-2 text-xs {isDark ? 'text-slate-400' : 'text-slate-500'}">{h.summary}</p>
												{/if}
											</div>
										</button>
									</li>
								{/each}
							</ul>
						</div>
					{/if}
				</div>

			<!-- ─── PIPELINE ─── -->
			{:else if activeTab === 'Pipeline'}
				<div class="space-y-4">
					<div class="flex flex-wrap items-center gap-3 text-xs {isDark ? 'text-slate-400' : 'text-slate-500'}">
						<span>Active path:</span>
						<span class="rounded-full border px-2.5 py-1 font-medium {isDark ? 'border-slate-700 bg-slate-800 text-slate-200' : 'border-slate-300 bg-white text-slate-700'}">
							{session.workflow === 'quick-flow' ? 'Quick Flow' : session.workflow === 'standard' ? 'Standard Flow' : session.projectType === 'brownfield' ? 'Brownfield' : 'Greenfield'}
						</span>
						<span class="flex items-center gap-3 text-[10px]">
							{#each [['current', 'Active'], ['complete', 'Complete'], ['partial', 'Partial'], ['observed', 'Observed'], ['pending', 'Pending']] as [status, label]}
								<span class="flex items-center gap-1.5">
									<span class="h-2 w-2 rounded-full {statusDotCls(status)}"></span>
									{label}
								</span>
							{/each}
						</span>
					</div>

					<!-- Phase columns -->
					<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
						{#each PHASES as phase (phase.name)}
							{@const phaseAgents = phase.agents.filter((a) => pipeline.includes(a))}
							{#if phaseAgents.length > 0}
								<div class="rounded-2xl border {isDark ? 'border-slate-800 bg-[#0d1117]' : 'border-slate-200 bg-white'}">
									<div class="border-b px-3 py-2.5 {isDark ? 'border-slate-800' : 'border-slate-200'}">
										<span class="text-[10px] font-bold uppercase tracking-wider {phaseHeaderCls(phase.color, isDark)}">{phase.name}</span>
									</div>
									<div class="space-y-2 p-2">
										{#each phaseAgents as agent (agent)}
											{@const status = pipelineNodeStatus(agent, session, handoffSummary, agentStats)}
											{@const stat = agentStats.find((x) => x.agent === agent)}
											<div class="rounded-lg border px-3 py-2.5 {pipelineNodeCls(status, isDark)}">
												<div class="flex items-center justify-between gap-2">
													<span class="text-xs font-medium">{agent}</span>
													{#if status === 'current'}
														<span class="h-2 w-2 shrink-0 animate-pulse rounded-full bg-blue-400"></span>
													{:else if status === 'complete'}
														<svg class="h-3.5 w-3.5 shrink-0 {isDark ? 'text-emerald-400' : 'text-emerald-600'}" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
													{:else if status === 'partial'}
														<span class="text-[10px] font-semibold">~</span>
													{/if}
												</div>
												{#if stat && stat.events > 0}
													<p class="mt-1 text-[10px] opacity-70">{stat.events} events</p>
												{/if}
											</div>
										{/each}
									</div>
								</div>
							{/if}
						{/each}
					</div>
				</div>

			<!-- ─── LLM TRACE ─── -->
			{:else if activeTab === 'LLM Trace'}
				<div class="rounded-2xl border {isDark ? 'border-slate-800 bg-[#0d1117]' : 'border-slate-200 bg-white'}">
					{#if llmTrace.length === 0}
						<div class="flex flex-col items-center justify-center py-16 text-center">
							<p class="text-3xl">🖥️</p>
							<p class="mt-3 text-sm font-medium {isDark ? 'text-slate-300' : 'text-slate-600'}">No LLM trace events</p>
							<p class="mt-1 text-xs {isDark ? 'text-slate-500' : 'text-slate-400'}">Internal prompts and responses will appear here.</p>
						</div>
					{:else}
						<ul class="divide-y {isDark ? 'divide-slate-800/40' : 'divide-slate-100'}">
							{#each llmTrace.slice().reverse() as item, i (`${item.timestamp}-${item.kind}-${item.taskId || ''}-${i}`)}
								<li>
									<button onclick={() => selectEvent(item)} class="flex w-full gap-3 px-4 py-3 text-left transition-colors {isDark ? 'hover:bg-slate-800/30' : 'hover:bg-slate-50'}">
										<span class="mt-0.5 h-2 w-2 shrink-0 rounded-full {kindDotCls(item.kind)}"></span>
										<div class="min-w-0 flex-1 space-y-1.5">
											<!-- Metadata ribbon -->
											<div class="flex flex-wrap items-center gap-2">
												<span class="inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold {kindBadgeCls(item.kind, isDark)}">
													{kindLabel(item.kind)}
												</span>
												{#if item.agent}
													<span class="rounded border px-1.5 py-0.5 text-[10px] {isDark ? 'border-slate-700 text-slate-400' : 'border-slate-200 text-slate-500'}">{item.agent}</span>
												{/if}
												{#if item.taskId}
													<span class="rounded border px-1.5 py-0.5 text-[10px] font-mono {isDark ? 'border-slate-700 text-slate-500' : 'border-slate-200 text-slate-400'}">{item.taskId}</span>
												{/if}
												{#if item.provider || item.model}
													<span class="text-[10px] {isDark ? 'text-slate-500' : 'text-slate-400'}">{[item.provider, item.model].filter(Boolean).join('/')}</span>
												{/if}
												<span class="ml-auto shrink-0 text-[10px] tabular-nums {isDark ? 'text-slate-500' : 'text-slate-400'}">{formatTime(item.timestamp)}</span>
											</div>
											<!-- Preview -->
											{#if item.text}
												<p class="line-clamp-3 font-mono text-[11px] leading-relaxed {isDark ? 'text-slate-300' : 'text-slate-600'}">{item.text.slice(0, 400)}</p>
											{/if}
										</div>
									</button>
								</li>
							{/each}
						</ul>
					{/if}
				</div>

			<!-- ─── INSPECTOR ─── -->
			{:else if activeTab === 'Inspector'}
				<div class="space-y-4">
					<div class="rounded-2xl border {isDark ? 'border-slate-800 bg-[#0d1117]' : 'border-slate-200 bg-white'}">
						<div class="flex items-center justify-between border-b px-4 py-3 {isDark ? 'border-slate-800' : 'border-slate-200'}">
							<h2 class="text-sm font-semibold">Event Inspector</h2>
							{#if selectedEvent}
								<button
									onclick={copyJson}
									class="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors {copied ? isDark ? 'border-emerald-600 bg-emerald-500/15 text-emerald-300' : 'border-emerald-400 bg-emerald-50 text-emerald-700' : isDark ? 'border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-600 hover:text-slate-100' : 'border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100'}"
								>
									{#if copied}
										<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
										Copied!
									{:else}
										<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
										Copy JSON
									{/if}
								</button>
							{/if}
						</div>
						{#if selectedEvent}
							<pre class="overflow-auto p-4 text-[11px] leading-relaxed {isDark ? 'text-slate-300' : 'text-slate-700'}" style="max-height: 32rem; font-family: 'JetBrains Mono', 'Cascadia Code', 'Fira Code', monospace;">{JSON.stringify(selectedEvent, null, 2)}</pre>
						{:else}
							<div class="flex flex-col items-center justify-center py-16 text-center">
								<p class="text-3xl">🔬</p>
								<p class="mt-3 text-sm font-medium {isDark ? 'text-slate-300' : 'text-slate-600'}">No event selected</p>
								<p class="mt-1 text-xs {isDark ? 'text-slate-500' : 'text-slate-400'}">Click any event in Timeline, Conversation, or LLM Trace to inspect its raw data.</p>
							</div>
						{/if}
					</div>

					<!-- Raw files -->
					{#if logRaw || sessionRaw}
						<div class="space-y-2">
							{#if logRaw}
								<details class="rounded-2xl border {isDark ? 'border-slate-800 bg-[#0d1117]' : 'border-slate-200 bg-white'}">
									<summary class="cursor-pointer px-4 py-3 text-sm font-medium {isDark ? 'text-slate-300 hover:text-slate-100' : 'text-slate-700 hover:text-slate-900'}">
										Raw <code class="rounded px-1.5 py-0.5 text-[11px] {isDark ? 'bg-slate-800 text-sky-300' : 'bg-slate-100 text-sky-700'}">interaction-log.json</code>
									</summary>
									<pre class="border-t p-4 text-[11px] leading-relaxed overflow-auto {isDark ? 'border-slate-800 text-slate-400' : 'border-slate-100 text-slate-600'}" style="max-height: 20rem; font-family: 'JetBrains Mono', 'Cascadia Code', monospace;">{logRaw}</pre>
								</details>
							{/if}
							{#if sessionRaw}
								<details class="rounded-2xl border {isDark ? 'border-slate-800 bg-[#0d1117]' : 'border-slate-200 bg-white'}">
									<summary class="cursor-pointer px-4 py-3 text-sm font-medium {isDark ? 'text-slate-300 hover:text-slate-100' : 'text-slate-700 hover:text-slate-900'}">
										Raw <code class="rounded px-1.5 py-0.5 text-[11px] {isDark ? 'bg-slate-800 text-sky-300' : 'bg-slate-100 text-sky-700'}">session.yaml</code>
									</summary>
									<pre class="border-t p-4 text-[11px] leading-relaxed overflow-auto {isDark ? 'border-slate-800 text-slate-400' : 'border-slate-100 text-slate-600'}" style="max-height: 20rem; font-family: 'JetBrains Mono', 'Cascadia Code', monospace;">{sessionRaw}</pre>
								</details>
							{/if}
						</div>
					{/if}
				</div>
			{/if}
		</main>
	</div>
</div>
