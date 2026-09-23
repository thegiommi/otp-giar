<script lang="ts">
	import { onMount } from 'svelte';
	import { replaceState } from '$app/navigation';
	import CopyButton from '$lib/components/CopyButton.svelte';
	import { OtpClient, OtpError } from '$lib/crypto';
	import { dateTime, fromNow } from '$lib/format';
	import { autofocus, describeError } from '$lib/ui';

	let { data } = $props();
	const info = $derived(data.info);

	const client = new OtpClient({ baseUrl: '' });

	let phase = $state<'sealed' | 'opened' | 'gone' | 'incomplete'>('sealed');
	let goneReason = $state<'missing' | 'destroyed'>('missing');
	let password = $state('');
	let busy = $state(false);
	let error = $state('');
	let secret = $state('');
	let viewsRemaining = $state(0);
	let unsealing = $state(false);

	onMount(() => {
		// The key lives in the fragment, which the browser never sends to the server.
		if (info && !/^#[A-Za-z0-9_-]{43}$/.test(location.hash)) phase = 'incomplete';
	});

	async function open(event: SubmitEvent) {
		event.preventDefault();
		if (!info || busy) return;
		if (info.passwordRequired && !password) {
			error = 'Gib das Passwort ein, das du separat bekommen hast.';
			return;
		}
		busy = true;
		error = '';
		try {
			const result = await client.reveal(location.href, { password: password || undefined });
			secret = result.secret;
			viewsRemaining = result.viewsRemaining;
			password = '';
			unsealing = true;
			phase = 'opened';
			// Drop the key from the address bar and history.
			replaceState(location.pathname, {});
		} catch (err) {
			if (err instanceof OtpError && err.code === 'invalid_credentials') {
				const left = Number(err.details.attemptsRemaining ?? 0);
				error = info.passwordRequired
					? `Das Passwort stimmt nicht. Noch ${left} ${left === 1 ? 'Versuch' : 'Versuche'}, danach wird das Geheimnis gelöscht.`
					: 'Der Link ist beschädigt. Kopiere den kompletten Link noch einmal aus der Nachricht.';
			} else if (err instanceof OtpError && (err.status === 404 || err.status === 410)) {
				goneReason = err.status === 410 ? 'destroyed' : 'missing';
				phase = 'gone';
			} else {
				error = describeError(err);
			}
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>Geheimnis öffnen · giar otp</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

{#if phase === 'sealed' && info}
	<section aria-labelledby="title">
		<h1 id="title" class="display max-w-[40rem] text-[clamp(2.1rem,6vw,3.3rem)]">
			Jemand hat dir ein Geheimnis geschickt.
		</h1>
		<p class="mt-5 max-w-[34rem] text-[1.05rem] leading-relaxed text-muted">
			{info.viewsRemaining === 1
				? 'Es lässt sich einmal öffnen und wird danach vom Server gelöscht.'
				: `Es lässt sich noch ${info.viewsRemaining}-mal öffnen.`}
			Läuft {fromNow(info.expiresAt)} ab.
		</p>

		<form class="liner mt-10 grid min-h-72 place-items-center rounded-md p-5 sm:p-10" onsubmit={open}>
			<!-- The envelope window. -->
			<div class="w-full max-w-sm rounded bg-sheet p-6 shadow-[0_1px_0_var(--color-rule)] sm:p-7">
				<span class="stamp">Versiegelt</span>
				{#if info.passwordRequired}
					<label for="password" class="label mt-6 block">Passwort</label>
					<!-- svelte-ignore a11y_autofocus -->
					<input
						id="password"
						type="password"
						bind:value={password}
						autocomplete="off"
						autofocus
						class="field mt-2"
						aria-describedby={error ? 'open-error' : undefined}
					/>
				{/if}
				<button type="submit" class="btn btn-primary mt-6 w-full" disabled={busy}>
					{busy ? 'Wird entschlüsselt …' : 'Geheimnis öffnen'}
				</button>
				{#if error}
					<p id="open-error" class="mt-3 text-sm leading-snug text-void" role="alert">{error}</p>
				{/if}
			</div>
		</form>
		<p class="mt-4 text-sm text-muted">
			Das Öffnen passiert erst mit dem Klick. Link-Vorschauen in Chats verbrauchen keine Öffnung.
		</p>
	</section>
{:else if phase === 'opened'}
	<section aria-labelledby="opened-title">
		<span class="stamp">Geöffnet</span>
		<h1 id="opened-title" tabindex="-1" use:autofocus class="display mt-6 text-[clamp(2rem,6vw,3rem)] outline-none">
			Dein Geheimnis.
		</h1>

		<div class="relative mt-8 overflow-hidden rounded-md border border-rule bg-sheet">
			<pre
				class="max-h-[60vh] min-h-32 overflow-auto p-5 font-mono text-[0.95rem] leading-relaxed break-all whitespace-pre-wrap sm:p-6">{secret}</pre>
			{#if unsealing}
				<div
					class="liner unsealing pointer-events-none absolute inset-0"
					aria-hidden="true"
					onanimationend={() => (unsealing = false)}
				></div>
			{/if}
		</div>

		<div class="mt-4 flex flex-wrap items-center gap-3">
			<CopyButton text={secret} label="Kopieren" copiedLabel="Kopiert" />
		</div>

		{#if viewsRemaining === 0}
			<p class="mt-8 max-w-[34rem] border-l-2 border-void pl-4 text-sm leading-relaxed">
				<strong class="font-semibold text-void">Vom Server gelöscht.</strong>
				Kopiere es jetzt. Wenn du diese Seite verlässt oder neu lädst, ist es weg.
			</p>
		{:else if info}
			<p class="mt-8 max-w-[34rem] border-l-2 border-tint pl-4 text-sm leading-relaxed">
				Der Link lässt sich noch {viewsRemaining === 1 ? 'einmal' : `${viewsRemaining}-mal`} öffnen, längstens bis
				{dateTime(info.expiresAt)}.
			</p>
		{/if}
	</section>
{:else if phase === 'incomplete' && info}
	<section aria-labelledby="incomplete-title">
		<span class="stamp stamp-void">Link unvollständig</span>
		<h1 id="incomplete-title" class="display mt-6 text-[clamp(2rem,6vw,3rem)]">Dem Link fehlt der Schlüssel.</h1>
		<p class="mt-4 max-w-[34rem] leading-relaxed text-muted">
			Der Teil nach dem <span class="font-mono text-ink">#</span> fehlt oder ist beschädigt. Kopiere den kompletten
			Link aus der Nachricht und öffne ihn erneut. Das Geheimnis ist weiterhin versiegelt.
		</p>
	</section>
{:else}
	<section aria-labelledby="gone-title">
		<span class="stamp stamp-void">Nicht verfügbar</span>
		<h1 id="gone-title" class="display mt-6 text-[clamp(2rem,6vw,3rem)]">Dieses Geheimnis gibt es nicht mehr.</h1>
		<p class="mt-4 max-w-[34rem] leading-relaxed text-muted">
			{goneReason === 'destroyed'
				? 'Nach zu vielen falschen Passwörtern wurde es gelöscht.'
				: 'Es wurde bereits geöffnet, ist abgelaufen oder der Link ist falsch.'}
			Bitte die Person, die es dir geschickt hat, um einen neuen Link.
		</p>
		<a href="/" class="btn btn-quiet mt-8">Selbst ein Geheimnis teilen</a>
	</section>
{/if}
