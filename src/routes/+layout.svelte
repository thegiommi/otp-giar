<script lang="ts">
	import '@fontsource-variable/archivo/wdth.css';
	import '@fontsource/fragment-mono/latin.css';
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="referrer" content="no-referrer" />
</svelte:head>

<div class="flex min-h-dvh flex-col">
	<header class="mx-auto flex w-full max-w-3xl items-center justify-between px-5 pt-6 pb-2 sm:px-8">
		<a href="/" class="group flex items-baseline gap-1.5 text-ink" aria-label="giar otp – Startseite">
			<span class="text-[1.35rem] font-extrabold tracking-tight [font-stretch:125%]">giar</span>
			<span class="font-mono text-[0.95rem] text-tint">/otp</span>
		</a>
		<nav class="flex items-center gap-5 text-sm">
			<a
				href="/"
				class="text-muted hover:text-ink aria-[current=page]:text-ink"
				aria-current={page.url.pathname === '/' ? 'page' : undefined}>Teilen</a
			>
			<a
				href="/docs"
				class="text-muted hover:text-ink aria-[current=page]:text-ink"
				aria-current={page.url.pathname.startsWith('/docs') ? 'page' : undefined}>API</a
			>
		</nav>
	</header>

	<main class="mx-auto w-full max-w-3xl flex-1 px-5 pt-10 pb-20 sm:px-8 sm:pt-14">
		{@render children()}
	</main>

	<footer class="mx-auto w-full max-w-3xl px-5 pb-8 text-xs text-muted sm:px-8">
		Verschlüsselt im Browser mit AES-256-GCM. Der Schlüssel steht nur im Link und erreicht den Server nie.
	</footer>
</div>
