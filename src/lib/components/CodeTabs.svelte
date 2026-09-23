<script lang="ts">
	import CopyButton from './CopyButton.svelte';

	interface Props {
		tabs: { label: string; code: string }[];
		id: string;
	}

	let { tabs, id }: Props = $props();
	let active = $state(0);
	const buttons: HTMLButtonElement[] = [];

	function onkeydown(event: KeyboardEvent) {
		const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
		if (!step) return;
		event.preventDefault();
		active = (active + step + tabs.length) % tabs.length;
		buttons[active]?.focus();
	}
</script>

<div class="overflow-hidden rounded-md border border-rule bg-sheet">
	<div class="flex items-center justify-between border-b border-rule pr-1">
		<div role="tablist" class="flex overflow-x-auto" tabindex="-1" {onkeydown}>
			{#each tabs as tab, i (tab.label)}
				<button
					bind:this={buttons[i]}
					type="button"
					role="tab"
					id="{id}-tab-{i}"
					aria-selected={active === i}
					aria-controls="{id}-panel"
					tabindex={active === i ? 0 : -1}
					class="border-b-2 px-4 py-2.5 text-sm whitespace-nowrap {active === i
						? 'border-tint font-semibold text-ink'
						: 'border-transparent text-muted hover:text-ink'}"
					onclick={() => (active = i)}>{tab.label}</button
				>
			{/each}
		</div>
		<CopyButton text={tabs[active].code} variant="quiet" class="min-h-8 border-0 px-2.5 text-sm" />
	</div>
	<div id="{id}-panel" role="tabpanel" aria-labelledby="{id}-tab-{active}">
		<pre class="overflow-x-auto p-4 font-mono text-[0.84rem] leading-relaxed"><code>{tabs[active].code}</code></pre>
	</div>
</div>
