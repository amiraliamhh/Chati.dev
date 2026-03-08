<script>
	import { theme, session, agentStats, handoffFiles, pipeline, handoffSummary } from '$lib/store.js';
	import { statusDotCls, statusBadgeCls, formatLastSeen, formatDate } from '$lib/ui.js';
	import { aggregateHandoffs } from '$lib/visualizer.js';

	let isDark = $derived($theme === 'dark');

	let sortedAgentStats = $derived(
		(() => {
			const pipelineOrder = new Map($pipeline.map((a, i) => [a, i]));
			const inPipeline = $agentStats
				.filter((a) => a.status !== 'not-applicable')
				.sort((a, b) => (pipelineOrder.get(a.agent) ?? 999) - (pipelineOrder.get(b.agent) ?? 999));
			const notApplicable = $agentStats.filter((a) => a.status === 'not-applicable');
			return [...inPipeline, ...notApplicable];
		})()
	);

	let notApplicableStart = $derived(
		sortedAgentStats.findIndex((a) => a.status === 'not-applicable')
	);
</script>

<div class="space-y-4">
	<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
		{#each sortedAgentStats as a, i (a.agent)}
			<!-- Separator before not-applicable agents -->
			{#if i === notApplicableStart && notApplicableStart > 0}
				<div class="col-span-full mt-2 flex items-center gap-3">
					<span class="text-xs font-medium {isDark ? 'text-slate-500' : 'text-slate-400'}">Not used in this pipeline</span>
					<div class="h-px flex-1 {isDark ? 'bg-slate-800' : 'bg-slate-200'}"></div>
				</div>
			{/if}

			{#if a.status === 'not-applicable'}
				<article class="rounded-2xl border p-4 opacity-40 {isDark ? 'border-slate-800 bg-[#0d1117]' : 'border-slate-200 bg-white'}">
					<header class="mb-3 flex items-center justify-between gap-2">
						<h3 class="truncate text-sm font-semibold {isDark ? 'text-slate-400' : 'text-slate-500'}">{a.agent}</h3>
						<span class="shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium {isDark ? 'border-slate-700 text-slate-500' : 'border-slate-300 text-slate-400'}">Not used</span>
					</header>
					<p class="text-[11px] {isDark ? 'text-slate-600' : 'text-slate-400'}">
						Not part of the {$session.projectType === 'brownfield' ? 'brownfield' : 'greenfield'} pipeline for this project.
					</p>
				</article>

			{:else if a.status === 'skipped'}
				<article class="rounded-2xl border p-4 transition-colors {isDark ? 'border-amber-900/40 bg-[#0d1117]' : 'border-amber-200 bg-amber-50/30'}">
					<header class="mb-3 flex items-center justify-between gap-2">
						<div class="flex min-w-0 items-center gap-2">
							<span class="h-2 w-2 shrink-0 rounded-full bg-amber-500"></span>
							<h3 class="truncate text-sm font-semibold">{a.agent}</h3>
						</div>
						<span class="shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium {isDark ? 'border-amber-800 bg-amber-900/30 text-amber-400' : 'border-amber-300 bg-amber-100 text-amber-700'}">Skipped</span>
					</header>
					<p class="text-[11px] {isDark ? 'text-slate-500' : 'text-slate-400'}">
						This agent was part of the pipeline but was skipped during the run.
					</p>
				</article>

			{:else}
				<article class="rounded-2xl border p-4 transition-colors {isDark ? 'border-slate-800 bg-[#0d1117] hover:border-slate-700' : 'border-slate-200 bg-white hover:border-slate-300'}">
					<header class="mb-3 flex items-center justify-between gap-2">
						<div class="flex min-w-0 items-center gap-2">
							<span class="h-2 w-2 shrink-0 rounded-full {statusDotCls(a.status)}"></span>
							<h3 class="truncate text-sm font-semibold">{a.agent}</h3>
						</div>
						<span class="shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize {statusBadgeCls(a.status, isDark)}">{a.status}</span>
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
					{#if $handoffSummary.byAgent?.[a.agent]}
						{@const h = $handoffSummary.byAgent[a.agent]}
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
	{#if $handoffFiles.length > 0}
		<div class="rounded-2xl border {isDark ? 'border-slate-800 bg-[#0d1117]' : 'border-slate-200 bg-white'}">
			<div class="border-b px-4 py-3 {isDark ? 'border-slate-800' : 'border-slate-200'}">
				<h3 class="text-sm font-semibold">Agent Handoffs</h3>
			</div>
			<ul class="divide-y {isDark ? 'divide-slate-800/40' : 'divide-slate-100'}">
				{#each $handoffFiles as h, i (h.id || `${h.fromAgent}-${i}`)}
					<li>
						<a href="/handoff/{h.fromAgent}" class="flex w-full gap-3 px-4 py-3 text-left transition-colors {isDark ? 'hover:bg-slate-800/30' : 'hover:bg-slate-50'}">
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
						</a>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</div>
