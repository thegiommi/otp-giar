<script lang="ts">
	import CopyButton from './CopyButton.svelte';

	interface Props {
		code: string;
		label?: string;
	}

	let { code, label }: Props = $props();
</script>

<div class="overflow-hidden rounded-md border border-rule bg-sheet">
	{#if label}
		<div class="flex items-center justify-between border-b border-rule py-1 pr-1 pl-4">
			<span class="label">{label}</span>
			<CopyButton text={code} variant="quiet" class="min-h-8 border-0 px-2.5 text-sm" />
		</div>
	{/if}
	<pre class="overflow-x-auto p-4 font-mono text-[0.84rem] leading-relaxed"><code>{code}</code></pre>
</div>
