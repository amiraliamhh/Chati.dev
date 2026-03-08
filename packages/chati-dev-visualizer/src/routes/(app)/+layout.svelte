<script>
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import Logo from '$lib/Logo.svelte';
	import { TABS } from '$lib/ui.js';
	import {
		theme,
		loading,
		loadError,
		apiInfo,
		session,
		summary,
		handoffSummary,
		artifacts,
		loadFromApi,
		toggleTheme
	} from '$lib/store.js';

	let { children } = $props();

	let isDark = $derived($theme === 'dark');

	function isActive(tab) {
		if (tab.route === '/') return $page.url.pathname === '/';
		return $page.url.pathname.startsWith(tab.route);
	}

	onMount(() => {
		const stored = localStorage.getItem('chati-visualizer-theme');
		if (stored === 'light' || stored === 'dark') {
			theme.set(stored);
		} else if (window.matchMedia('(prefers-color-scheme: light)').matches) {
			theme.set('light');
		}
		loadFromApi();
	});
</script>

<div class="flex min-h-screen {isDark ? 'bg-[#080b11] text-slate-100' : 'bg-slate-100 text-slate-900'}">

	<!-- ── Sidebar (desktop) ── -->
	<aside class="fixed inset-y-0 left-0 z-20 hidden w-56 flex-col border-r lg:flex {isDark ? 'border-slate-800 bg-[#0d1117]' : 'border-slate-200 bg-white'}">
		<!-- Logo -->
		<div class="flex items-center gap-2.5 border-b px-4 py-3 {isDark ? 'border-slate-800' : 'border-slate-200'}">
			<Logo size={32} class="shrink-0" />
			<div>
				<p class="font-mono text-sm font-bold leading-tight tracking-tight">Chati<span class="text-sky-400">.</span>dev</p>
				<p class="text-[10px] leading-tight {isDark ? 'text-slate-500' : 'text-slate-400'}">Visualizer</p>
			</div>
		</div>

		<!-- Nav -->
		<nav class="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
			{#each TABS as tab (tab.id)}
				<a
					href={tab.route}
					class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors {isActive(tab)
						? isDark
							? 'bg-sky-500/15 font-medium text-sky-300'
							: 'bg-sky-50 font-medium text-sky-700'
						: isDark
							? 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100'
							: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}"
				>
					{#if tab.id === 'overview'}
						<svg class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
					{:else if tab.id === 'conversation'}
						<svg class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
					{:else if tab.id === 'timeline'}
						<svg class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 12"/></svg>
					{:else if tab.id === 'agents'}
						<svg class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
					{:else if tab.id === 'pipeline'}
						<svg class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
					{:else if tab.id === 'llm-trace'}
						<svg class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
					{:else if tab.id === 'inspector'}
						<svg class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
					{/if}
					{tab.label}
				</a>
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
				<svg class="h-4 w-4 shrink-0 {$loading ? 'animate-spin' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
				{$loading ? 'Loading…' : 'Reload data'}
			</button>
		</div>
	</aside>

	<!-- ── Main column ── -->
	<div class="flex min-h-screen flex-1 flex-col lg:pl-56">

		<!-- Sticky header -->
		<header class="sticky top-0 z-10 flex h-12 items-center gap-4 border-b px-4 {isDark ? 'border-slate-800 bg-[#080b11]/90 backdrop-blur-sm' : 'border-slate-200 bg-white/90 backdrop-blur-sm'}">
			<div class="min-w-0 flex-1">
				<p class="truncate text-sm font-semibold">
					{$session.projectName || 'Chati.dev Visualizer'}
				</p>
			</div>

			<!-- Data status chips -->
			{#if $apiInfo}
				<div class="hidden items-center gap-3 text-[11px] sm:flex">
					<span class="flex items-center gap-1.5 {$apiInfo.found.log ? isDark ? 'text-emerald-400' : 'text-emerald-600' : isDark ? 'text-red-400' : 'text-red-600'}">
						<span class="h-1.5 w-1.5 rounded-full {$apiInfo.found.log ? 'bg-emerald-400' : 'bg-red-400'}"></span>
						Log
					</span>
					<span class="flex items-center gap-1.5 {$apiInfo.found.session ? isDark ? 'text-emerald-400' : 'text-emerald-600' : isDark ? 'text-red-400' : 'text-red-600'}">
						<span class="h-1.5 w-1.5 rounded-full {$apiInfo.found.session ? 'bg-emerald-400' : 'bg-red-400'}"></span>
						Session
					</span>
					<span class="{isDark ? 'text-slate-500' : 'text-slate-400'}">{$apiInfo.found.handoffs} handoffs</span>
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
					<svg class="h-4 w-4 {$loading ? 'animate-spin' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
				</button>
			</div>
		</header>

		<!-- Mobile tab bar -->
		<nav class="sticky top-12 z-10 flex overflow-x-auto border-b lg:hidden {isDark ? 'border-slate-800 bg-[#080b11]/95 backdrop-blur-sm' : 'border-slate-200 bg-white/95 backdrop-blur-sm'}">
			{#each TABS as tab (tab.id)}
				<a
					href={tab.route}
					class="shrink-0 border-b-2 px-3 py-2.5 text-xs font-medium transition-colors {isActive(tab)
						? isDark
							? 'border-sky-400 text-sky-300'
							: 'border-sky-600 text-sky-700'
						: 'border-transparent ' + (isDark ? 'text-slate-500 hover:text-slate-300' : 'text-slate-500 hover:text-slate-700')}"
				>
					{tab.label}
				</a>
			{/each}
		</nav>

		<!-- Stats strip -->
		<div class="flex flex-wrap items-center gap-x-6 gap-y-2 border-b px-4 py-2.5 {isDark ? 'border-slate-800/60 bg-[#0d1117]' : 'border-slate-200 bg-white'}">
			{#each [
				{ label: 'Interactions', value: $summary.totalInteractions, color: isDark ? 'text-sky-300' : 'text-sky-700' },
				{ label: 'User Prompts', value: $summary.totalUserPrompts, color: isDark ? 'text-violet-300' : 'text-violet-700' },
				{ label: 'Conv. Turns', value: $summary.totalConversationTurns, color: isDark ? 'text-emerald-300' : 'text-emerald-700' },
				{ label: 'Sys. Trace', value: $summary.totalSystemTrace, color: isDark ? 'text-indigo-300' : 'text-indigo-700' },
				{ label: 'Handoffs', value: $handoffSummary.total, color: isDark ? 'text-cyan-300' : 'text-cyan-700' },
				{ label: 'Docs', value: $artifacts.length, color: isDark ? 'text-teal-300' : 'text-teal-700' },
				{ label: 'Blockers', value: $handoffSummary.blockers, color: isDark ? 'text-amber-300' : 'text-amber-700' }
			] as stat (stat.label)}
				<div class="flex items-baseline gap-1.5">
					<span class="text-base font-bold tabular-nums {stat.color}">{stat.value}</span>
					<span class="text-[11px] {isDark ? 'text-slate-500' : 'text-slate-400'}">{stat.label}</span>
				</div>
			{/each}
		</div>

		<!-- Error banner -->
		{#if $loadError}
			<div class="m-4 rounded-xl border px-4 py-3 text-sm {isDark ? 'border-red-900/60 bg-red-950/40 text-red-300' : 'border-red-200 bg-red-50 text-red-700'}">
				{$loadError}
			</div>
		{/if}

		<!-- Page content -->
		<main class="flex-1 p-4 lg:p-6">
			{@render children()}
		</main>
	</div>
</div>
