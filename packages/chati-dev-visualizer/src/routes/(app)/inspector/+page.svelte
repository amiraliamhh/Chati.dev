<script>
	import { theme, selectedEvent, logRaw, sessionRaw } from '$lib/store.js';

	let isDark = $derived($theme === 'dark');
	let copied = $state(false);

	async function copyJson() {
		if (!$selectedEvent) return;
		await navigator.clipboard.writeText(JSON.stringify($selectedEvent, null, 2));
		copied = true;
		setTimeout(() => { copied = false; }, 2000);
	}
</script>

<div class="space-y-4">
	<div class="rounded-2xl border {isDark ? 'border-slate-800 bg-[#0d1117]' : 'border-slate-200 bg-white'}">
		<div class="flex items-center justify-between border-b px-4 py-3 {isDark ? 'border-slate-800' : 'border-slate-200'}">
			<h2 class="text-sm font-semibold">Event Inspector</h2>
			{#if $selectedEvent}
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
		{#if $selectedEvent}
			<pre class="overflow-auto p-4 text-[11px] leading-relaxed {isDark ? 'text-slate-300' : 'text-slate-700'}" style="max-height: 32rem; font-family: 'JetBrains Mono', 'Cascadia Code', 'Fira Code', monospace;">{JSON.stringify($selectedEvent, null, 2)}</pre>
		{:else}
			<div class="flex flex-col items-center justify-center py-16 text-center">
				<p class="text-3xl">🔬</p>
				<p class="mt-3 text-sm font-medium {isDark ? 'text-slate-300' : 'text-slate-600'}">No event selected</p>
				<p class="mt-1 text-xs {isDark ? 'text-slate-500' : 'text-slate-400'}">Click any event in Timeline, Conversation, or LLM Trace to inspect its raw data.</p>
			</div>
		{/if}
	</div>

	<!-- Raw files -->
	{#if $logRaw || $sessionRaw}
		<div class="space-y-2">
			{#if $logRaw}
				<details class="rounded-2xl border {isDark ? 'border-slate-800 bg-[#0d1117]' : 'border-slate-200 bg-white'}">
					<summary class="cursor-pointer px-4 py-3 text-sm font-medium {isDark ? 'text-slate-300 hover:text-slate-100' : 'text-slate-700 hover:text-slate-900'}">
						Raw <code class="rounded px-1.5 py-0.5 text-[11px] {isDark ? 'bg-slate-800 text-sky-300' : 'bg-slate-100 text-sky-700'}">interaction-log.json</code>
					</summary>
					<pre class="overflow-auto border-t p-4 text-[11px] leading-relaxed {isDark ? 'border-slate-800 text-slate-400' : 'border-slate-100 text-slate-600'}" style="max-height: 20rem; font-family: 'JetBrains Mono', 'Cascadia Code', monospace;">{$logRaw}</pre>
				</details>
			{/if}
			{#if $sessionRaw}
				<details class="rounded-2xl border {isDark ? 'border-slate-800 bg-[#0d1117]' : 'border-slate-200 bg-white'}">
					<summary class="cursor-pointer px-4 py-3 text-sm font-medium {isDark ? 'text-slate-300 hover:text-slate-100' : 'text-slate-700 hover:text-slate-900'}">
						Raw <code class="rounded px-1.5 py-0.5 text-[11px] {isDark ? 'bg-slate-800 text-sky-300' : 'bg-slate-100 text-sky-700'}">session.yaml</code>
					</summary>
					<pre class="overflow-auto border-t p-4 text-[11px] leading-relaxed {isDark ? 'border-slate-800 text-slate-400' : 'border-slate-100 text-slate-600'}" style="max-height: 20rem; font-family: 'JetBrains Mono', 'Cascadia Code', monospace;">{$sessionRaw}</pre>
				</details>
			{/if}
		</div>
	{/if}
</div>
