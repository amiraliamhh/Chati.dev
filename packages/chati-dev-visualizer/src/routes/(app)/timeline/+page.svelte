<script>
	import { goto } from '$app/navigation';
	import { theme, log, selectedEvent } from '$lib/store.js';
	import { kindLabel, kindBadgeCls, kindBorderCls, formatTime } from '$lib/ui.js';
	import { filterInteractions, uniqueValues } from '$lib/visualizer.js';

	let isDark = $derived($theme === 'dark');

	let filters = $state({ kind: 'all', agent: 'all', provider: 'all', model: 'all', query: '' });

	let kinds = $derived(uniqueValues($log.interactions, 'kind'));
	let agents = $derived(uniqueValues($log.interactions, 'agent'));
	let providers = $derived(uniqueValues($log.interactions, 'provider'));
	let models = $derived(uniqueValues($log.interactions, 'model'));
	let filtered = $derived(filterInteractions($log.interactions, filters));

	function handleSelectEvent(item) {
		selectedEvent.set(item);
		goto('/inspector');
	}
</script>

<!-- Filter bar -->
<div class="mb-4 flex flex-wrap gap-2 rounded-xl border p-3 {isDark ? 'border-slate-800 bg-[#0d1117]' : 'border-slate-200 bg-white'}">
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
						onclick={() => handleSelectEvent(item)}
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
