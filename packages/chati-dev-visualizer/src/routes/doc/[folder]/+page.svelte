<script>
	import { onMount } from 'svelte';
	import { marked } from 'marked';

	let { data } = $props();
	let { folder, docs } = $derived(data);

	let theme = $state('dark');
	let isDark = $derived(theme === 'dark');
	let activeDoc = $state(0);

	let currentDoc = $derived(docs[activeDoc] ?? docs[0]);

	// Strip YAML frontmatter before rendering
	let markdownBody = $derived(
		(currentDoc?.rawContent ?? '').replace(/^---\n[\s\S]*?\n---\n?/, '').trim()
	);
	let renderedHtml = $derived(marked(markdownBody));

	onMount(() => {
		const stored = localStorage.getItem('chati-visualizer-theme');
		if (stored === 'light' || stored === 'dark') {
			theme = stored;
		} else if (window.matchMedia('(prefers-color-scheme: light)').matches) {
			theme = 'light';
		}
	});

	function toggleTheme() {
		theme = theme === 'dark' ? 'light' : 'dark';
		localStorage.setItem('chati-visualizer-theme', theme);
	}
</script>

<svelte:head>
	<title>{currentDoc?.title ?? folder} — Chati.dev</title>
</svelte:head>

<div class="min-h-screen {isDark ? 'bg-[#080b11] text-slate-100' : 'bg-slate-100 text-slate-900'}">

	<!-- Top bar -->
	<header class="sticky top-0 z-10 border-b {isDark ? 'border-slate-800 bg-[#080b11]/90 backdrop-blur-sm' : 'border-slate-200 bg-white/90 backdrop-blur-sm'}">
		<div class="mx-auto flex max-w-4xl items-center gap-4 px-4 py-3">
			<a
				href="/"
				class="flex shrink-0 items-center gap-1.5 text-xs transition-colors {isDark ? 'text-slate-400 hover:text-slate-100' : 'text-slate-500 hover:text-slate-900'}"
			>
				<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<polyline points="15 18 9 12 15 6"></polyline>
				</svg>
				Overview
			</a>

			<span class="{isDark ? 'text-slate-700' : 'text-slate-300'}">/</span>

			<div class="flex min-w-0 flex-1 items-center gap-3">
				<h1 class="truncate text-sm font-semibold">
					{currentDoc?.agent ?? folder}
					{#if docs.length > 1}
						<span class="ml-1 text-[11px] font-normal {isDark ? 'text-slate-500' : 'text-slate-400'}">({activeDoc + 1}/{docs.length})</span>
					{/if}
				</h1>
				{#if currentDoc?.agent}
					<span class="shrink-0 text-[10px] {isDark ? 'text-slate-500' : 'text-slate-400'}">{folder}</span>
				{/if}
			</div>

			<!-- Doc tabs when multiple files in one folder -->
			{#if docs.length > 1}
				<div class="flex gap-1">
					{#each docs as doc, i}
						<button
							onclick={() => (activeDoc = i)}
							class="rounded-lg border px-2.5 py-1 text-xs transition-colors {i === activeDoc
								? isDark ? 'border-sky-500 bg-sky-500/15 text-sky-300' : 'border-sky-400 bg-sky-50 text-sky-700'
								: isDark ? 'border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200' : 'border-slate-200 text-slate-500 hover:border-slate-300'}"
						>
							{doc.title}
						</button>
					{/each}
				</div>
			{/if}

			<button
				onclick={toggleTheme}
				aria-label="Toggle theme"
				class="shrink-0 rounded-lg p-2 transition-colors {isDark ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-100' : 'text-slate-500 hover:bg-slate-200 hover:text-slate-900'}"
			>
				{#if isDark}
					<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="12" cy="12" r="5"/>
						<line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
						<line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
						<line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
						<line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
					</svg>
				{:else}
					<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
						<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
					</svg>
				{/if}
			</button>
		</div>
	</header>

	<!-- Main prose content -->
	<main class="mx-auto max-w-4xl px-4 py-10">
		<div
			class="prose max-w-none
				{isDark
					? 'prose-invert prose-headings:text-slate-100 prose-p:text-slate-300 prose-strong:text-slate-100 prose-code:text-sky-300 prose-code:bg-slate-800 prose-pre:bg-slate-900 prose-pre:border prose-pre:border-slate-700 prose-blockquote:border-slate-600 prose-blockquote:text-slate-400 prose-a:text-sky-400 prose-thead:text-slate-300 prose-td:text-slate-400 prose-hr:border-slate-700'
					: 'prose-headings:text-slate-900 prose-p:text-slate-700 prose-code:text-sky-700 prose-code:bg-sky-50 prose-a:text-sky-600'}"
		>
			{@html renderedHtml}
		</div>
	</main>
</div>
