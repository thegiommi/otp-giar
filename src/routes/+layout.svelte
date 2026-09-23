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
			<a
				href="https://github.com/thegiommi/otp-giar"
				class="flex items-center gap-1.5 rounded border border-rule bg-sheet px-2.5 py-1 text-ink hover:border-tint hover:text-tint"
				target="_blank"
				rel="noopener noreferrer"
			>
				<svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
					<path
						d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
					/>
				</svg>
				OpenSource
			</a>
		</nav>
	</header>

	<main class="mx-auto w-full max-w-3xl flex-1 px-5 pt-10 pb-20 sm:px-8 sm:pt-14">
		{@render children()}
	</main>

	<footer class="mx-auto w-full max-w-3xl px-5 pb-8 text-xs text-muted sm:px-8">
		Verschlüsselt im Browser mit AES-256-GCM. Der Schlüssel steht nur im Link und erreicht den Server nie.
	</footer>
</div>
