<script>
	import { theme, session, pipeline, agentStats, handoffSummary } from '$lib/store.js';
	import { PHASES, statusDotCls, phaseHeaderCls, pipelineNodeStatus, pipelineNodeCls } from '$lib/ui.js';

	let isDark = $derived($theme === 'dark');
</script>

<div class="space-y-4">
	<div class="flex flex-wrap items-center gap-3 text-xs {isDark ? 'text-slate-400' : 'text-slate-500'}">
		<span>Active path:</span>
		<span class="rounded-full border px-2.5 py-1 font-medium {isDark ? 'border-slate-700 bg-slate-800 text-slate-200' : 'border-slate-300 bg-white text-slate-700'}">
			{$session.workflow === 'quick-flow' ? 'Quick Flow' : $session.workflow === 'standard' ? 'Standard Flow' : $session.projectType === 'brownfield' ? 'Brownfield' : 'Greenfield'}
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
			{@const phaseAgents = phase.agents.filter((a) => $pipeline.includes(a))}
			{#if phaseAgents.length > 0}
				<div class="rounded-2xl border {isDark ? 'border-slate-800 bg-[#0d1117]' : 'border-slate-200 bg-white'}">
					<div class="border-b px-3 py-2.5 {isDark ? 'border-slate-800' : 'border-slate-200'}">
						<span class="text-[10px] font-bold uppercase tracking-wider {phaseHeaderCls(phase.color, isDark)}">{phase.name}</span>
					</div>
					<div class="space-y-2 p-2">
						{#each phaseAgents as agent (agent)}
							{@const status = pipelineNodeStatus(agent, $session, $handoffSummary, $agentStats)}
							{@const stat = $agentStats.find((x) => x.agent === agent)}
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
