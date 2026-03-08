<script>
	import { goto } from '$app/navigation';
	import { theme, session, handoffFiles, artifacts, summary, handoffSummary, log, selectedEvent } from '$lib/store.js';
	import { statusDotCls, statusBadgeCls, kindDotCls, kindLabel, formatTime, formatDate, phaseHeaderCls, phaseLeftBorderCls } from '$lib/ui.js';
	import { PHASES } from '$lib/ui.js';

	let isDark = $derived($theme === 'dark');

	let artifactGroups = $derived(
		$artifacts.reduce((groups, doc) => {
			const last = groups[groups.length - 1];
			if (last && last.folder === doc.folder) {
				last.docs.push(doc);
			} else {
				groups.push({ folder: doc.folder, agent: doc.agent || doc.folder, docs: [doc] });
			}
			return groups;
		}, [])
	);

	function handleSelectEvent(item) {
		selectedEvent.set(item);
		goto('/inspector');
	}
</script>

<div class="space-y-6">

	<!-- State hero -->
	<div class="grid gap-3 sm:grid-cols-3">
		<div class="rounded-2xl border p-4 {$session.currentAgent ? isDark ? 'border-sky-500/30 bg-sky-500/10' : 'border-sky-300 bg-sky-50' : isDark ? 'border-slate-800 bg-[#0d1117]' : 'border-slate-200 bg-white'}">
			<p class="mb-1 text-[10px] font-semibold uppercase tracking-wider {isDark ? 'text-sky-400' : 'text-sky-600'}">Current Agent</p>
			<p class="text-2xl font-bold">{$session.currentAgent || '—'}</p>
			<p class="mt-1 text-xs {isDark ? 'text-slate-400' : 'text-slate-500'}">{$session.projectState || 'unknown state'}</p>
		</div>
		<div class="rounded-2xl border p-4 {isDark ? 'border-slate-800 bg-[#0d1117]' : 'border-slate-200 bg-white'}">
			<p class="mb-1 text-[10px] font-semibold uppercase tracking-wider {isDark ? 'text-slate-400' : 'text-slate-500'}">Project</p>
			<p class="truncate text-lg font-bold">{$session.projectName || '—'}</p>
			<p class="mt-1 text-xs {isDark ? 'text-slate-400' : 'text-slate-500'}">{$session.projectType || '—'} · {$session.workflow || 'standard'}</p>
		</div>
		<div class="rounded-2xl border p-4 {isDark ? 'border-slate-800 bg-[#0d1117]' : 'border-slate-200 bg-white'}">
			<p class="mb-1 text-[10px] font-semibold uppercase tracking-wider {isDark ? 'text-slate-400' : 'text-slate-500'}">Mode</p>
			<p class="text-lg font-bold capitalize">{$session.executionMode || '—'}</p>
			<p class="mt-1 text-xs {isDark ? 'text-slate-400' : 'text-slate-500'}">Language: {$session.language || '—'}</p>
		</div>
	</div>

	<!-- Handoffs -->
	{#if $handoffFiles.length > 0}
		<div>
			<h2 class="mb-3 text-sm font-semibold {isDark ? 'text-slate-200' : 'text-slate-800'}">Agent Handoffs</h2>
			<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
				{#each $handoffFiles as h (h.id)}
					<a
						href="/handoff/{h.fromAgent}"
						class="group flex flex-col rounded-2xl border transition-colors {isDark ? 'border-slate-800 bg-[#0d1117] hover:border-slate-700' : 'border-slate-200 bg-white hover:border-slate-300'}"
					>
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
						<div class="flex-1 px-4 py-3">
							{#if h.summary}
								<p class="line-clamp-3 text-xs leading-relaxed {isDark ? 'text-slate-400' : 'text-slate-500'}">{h.summary}</p>
							{:else}
								<p class="text-xs {isDark ? 'text-slate-600' : 'text-slate-400'}">No summary available.</p>
							{/if}
						</div>
						<div class="flex items-center justify-between border-t px-4 py-2.5 text-[10px] {isDark ? 'border-slate-800 text-slate-500' : 'border-slate-100 text-slate-400'}">
							<div class="flex items-center gap-3">
								{#if h.to}<span>→ {h.to}</span>{/if}
								{#if h.criteriaCount}<span>{h.criteriaCount} criteria</span>{/if}
								{#if h.timestamp}<span>{h.timestamp}</span>{/if}
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

	<!-- Agent Documents — pipeline timeline -->
	{#if artifactGroups.length > 0}
		<div>
			<h2 class="mb-4 text-sm font-semibold {isDark ? 'text-slate-200' : 'text-slate-800'}">Agent Documents</h2>
			<div class="flex flex-wrap gap-y-4">
				{#each artifactGroups as group, i (group.folder)}
					{@const phase = PHASES.find((p) => p.agents.includes(group.agent))}
					<div class="flex items-center">
						<div class="flex w-44 flex-col rounded-xl border border-l-4 {phaseLeftBorderCls(group.agent)} {isDark ? 'border-slate-800 bg-[#0d1117]' : 'border-slate-200 bg-white'}">
							<div class="border-b px-3 pt-2.5 pb-2 {isDark ? 'border-slate-800' : 'border-slate-100'}">
								{#if phase}
									<p class="mb-0.5 text-[9px] font-bold uppercase tracking-widest {phaseHeaderCls(phase.color, isDark)}">{phase.name}</p>
								{/if}
								<p class="text-sm font-semibold leading-snug">{group.agent}</p>
							</div>
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
						{#if i < artifactGroups.length - 1}
							<div class="flex w-10 shrink-0 items-center justify-center {isDark ? 'text-slate-600' : 'text-slate-300'}">
								<svg width="34" height="14" viewBox="0 0 34 14" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
									<rect x="0" y="6" width="24" height="2" rx="1"/>
									<polygon points="22,1 34,7 22,13"/>
								</svg>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Recent Events + breakdown -->
	<div class="grid gap-4 lg:grid-cols-[1fr,260px]">
		<div class="rounded-2xl border {isDark ? 'border-slate-800 bg-[#0d1117]' : 'border-slate-200 bg-white'}">
			<div class="border-b px-4 py-3 {isDark ? 'border-slate-800' : 'border-slate-200'}">
				<h2 class="text-sm font-semibold">Recent Events</h2>
			</div>
			{#if $log.timeline.length === 0}
				<div class="flex flex-col items-center justify-center py-12 text-center">
					<p class="text-2xl">📭</p>
					<p class="mt-2 text-sm font-medium {isDark ? 'text-slate-300' : 'text-slate-600'}">No events yet</p>
					<p class="mt-1 text-xs {isDark ? 'text-slate-500' : 'text-slate-400'}">Start a Chati.dev session to see activity here.</p>
				</div>
			{:else}
				<ul class="divide-y {isDark ? 'divide-slate-800/60' : 'divide-slate-100'}">
					{#each $log.timeline.slice(-12).reverse() as row, i (`${row.timestamp}-${row.kind}-${i}`)}
						<li>
							<button onclick={() => handleSelectEvent(row)} class="flex w-full gap-3 px-4 py-3 text-left transition-colors {isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'}">
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
			{#if Object.keys($summary.byKind).length === 0}
				<div class="px-4 py-8 text-center text-xs {isDark ? 'text-slate-500' : 'text-slate-400'}">No events to break down.</div>
			{:else}
				<ul class="divide-y {isDark ? 'divide-slate-800/60' : 'divide-slate-100'}">
					{#each Object.entries($summary.byKind).sort((a, b) => b[1] - a[1]) as [kind, count] (kind)}
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
