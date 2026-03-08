<script>
	import { theme, log } from '$lib/store.js';
	import { formatTime } from '$lib/ui.js';

	let isDark = $derived($theme === 'dark');
</script>

<div class="mx-auto max-w-3xl space-y-4">
	{#if $log.conversation.length === 0}
		<div class="flex flex-col items-center justify-center py-16 text-center">
			<p class="text-3xl">💬</p>
			<p class="mt-3 text-sm font-medium {isDark ? 'text-slate-300' : 'text-slate-600'}">No conversation yet</p>
			<p class="mt-1 text-xs {isDark ? 'text-slate-500' : 'text-slate-400'}">Conversation turns will appear here once a session starts.</p>
		</div>
	{:else}
		{#each $log.conversation as turn, i (`${turn.timestamp}-${turn.role}-${i}`)}
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
