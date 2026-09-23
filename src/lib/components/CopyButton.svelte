<script lang="ts">
	interface Props {
		text: string;
		label?: string;
		copiedLabel?: string;
		variant?: 'primary' | 'quiet';
		class?: string;
	}

	let { text, label = 'Kopieren', copiedLabel = 'Kopiert', variant = 'primary', class: className = '' }: Props =
		$props();

	let copied = $state(false);
	let failed = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	async function copy() {
		failed = false;
		try {
			await navigator.clipboard.writeText(text);
		} catch {
			// Clipboard API unavailable (e.g. plain http on a LAN address): fall back to a hidden textarea.
			const area = document.createElement('textarea');
			area.value = text;
			area.setAttribute('readonly', '');
			area.style.position = 'fixed';
			area.style.opacity = '0';
			document.body.append(area);
			area.select();
			const ok = document.execCommand('copy');
			area.remove();
			if (!ok) {
				failed = true;
				return;
			}
		}
		copied = true;
		clearTimeout(timer);
		timer = setTimeout(() => (copied = false), 2200);
	}
</script>

<button type="button" class="btn btn-{variant} {className}" onclick={copy}>
	{#if copied}
		<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
			<path d="M3 8.5l3 3 7-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
		</svg>
		{copiedLabel}
	{:else}
		<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
			<rect x="5.25" y="5.25" width="8" height="8" rx="1.25" stroke="currentColor" stroke-width="1.5" />
			<path d="M10.75 3.5v-.25c0-.69-.56-1.25-1.25-1.25h-5.5c-.69 0-1.25.56-1.25 1.25v5.5c0 .69.56 1.25 1.25 1.25h.25" stroke="currentColor" stroke-width="1.5" />
		</svg>
		{label}
	{/if}
</button>
<span class="sr-only" aria-live="polite">{copied ? copiedLabel : failed ? 'Kopieren fehlgeschlagen – bitte manuell markieren' : ''}</span>
