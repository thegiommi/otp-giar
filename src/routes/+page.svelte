<script lang="ts">
	import CopyButton from '$lib/components/CopyButton.svelte';
	import {
		DEFAULT_TTL_SECONDS,
		DEFAULT_VIEWS,
		MAX_SECRET_BYTES,
		MAX_VIEWS,
		MIN_VIEWS,
		TTL_PRESETS
	} from '$lib/config';
	import { OtpClient, type CreatedSecret } from '$lib/crypto';
	import { dateTime, fromNow, kib } from '$lib/format';
	import { autofocus, describeError, prefersReducedMotion, wait } from '$lib/ui';

	const client = new OtpClient({ baseUrl: '' });
	const encoder = new TextEncoder();

	let secret = $state('');
	let ttl = $state(DEFAULT_TTL_SECONDS);
	let maxViews = $state<number | null>(DEFAULT_VIEWS);
	let password = $state('');
	let showPassword = $state(false);

	let phase = $state<'compose' | 'sealing' | 'sealed' | 'burned'>('compose');
	let busy = $state(false);
	let error = $state('');
	let created = $state<CreatedSecret | null>(null);
	let hadPassword = $state(false);
	let confirmBurn = $state(false);

	const bytes = $derived(encoder.encode(secret).length);
	const tooLarge = $derived(bytes > MAX_SECRET_BYTES);
	const views = $derived(clampViews(maxViews));

	function clampViews(n: number | null) {
		return Math.min(MAX_VIEWS, Math.max(MIN_VIEWS, Math.round(n || MIN_VIEWS)));
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (busy || !secret.trim() || tooLarge) return;
		busy = true;
		error = '';
		try {
			const result = await client.create(secret, {
				expiresIn: ttl,
				maxViews: views,
				password: password || undefined
			});
			hadPassword = password.length > 0;
			phase = 'sealing';
			await wait(prefersReducedMotion() ? 0 : 600);
			created = result;
			secret = '';
			password = '';
			phase = 'sealed';
		} catch (err) {
			error = describeError(err);
			phase = 'compose';
		} finally {
			busy = false;
		}
	}

	async function burn() {
		if (!created) return;
		busy = true;
		try {
			await client.burn(created.id, created.deleteToken);
			phase = 'burned';
		} catch (err) {
			// Already opened or expired: either way the link no longer works.
			if ((err as { status?: number }).status === 404) phase = 'burned';
			else error = describeError(err);
		} finally {
			busy = false;
			confirmBurn = false;
		}
	}

	function reset() {
		created = null;
		error = '';
		confirmBurn = false;
		maxViews = DEFAULT_VIEWS;
		ttl = DEFAULT_TTL_SECONDS;
		showPassword = false;
		phase = 'compose';
	}
</script>

<svelte:head>
	<title>Geheimnis teilen · giar otp</title>
	<meta
		name="description"
		content="Passwörter und Zugangsdaten über einen Link teilen, der sich nach dem Öffnen selbst löscht. Ende-zu-Ende verschlüsselt."
	/>
</svelte:head>

{#if phase === 'compose' || phase === 'sealing'}
	<section aria-labelledby="title">
		<h1 id="title" class="display text-[clamp(2.7rem,9vw,5rem)]">
			Einmal lesen.<br /><span class="text-liner">Dann weg.</span>
		</h1>
		<p class="mt-6 max-w-[35rem] text-[1.075rem] leading-relaxed text-muted">
			Teile Passwörter und Zugangsdaten über einen Link, der sich nach dem Öffnen selbst löscht. Verschlüsselt
			wird in deinem Browser, der Schlüssel steht nur im Link.
		</p>

		<form class="mt-11" onsubmit={submit}>
			<label for="secret" class="label">Geheimnis</label>
			<div class="liner relative mt-2 rounded-md p-2.5">
				<!-- No name attribute: the plain text is never part of a form submission. -->
				<textarea
					id="secret"
					bind:value={secret}
					required
					rows="6"
					spellcheck="false"
					autocomplete="off"
					autocapitalize="off"
					placeholder="Passwort, API-Key, Inhalt einer .env-Datei …"
					aria-describedby="secret-size"
					disabled={phase === 'sealing'}
					class="block min-h-40 w-full resize-y rounded-[3px] bg-sheet p-4 font-mono text-[0.95rem] leading-relaxed text-ink outline-none placeholder:text-muted/70 focus-visible:ring-2 focus-visible:ring-tint"
				></textarea>
				{#if phase === 'sealing'}
					<div class="liner sealing absolute inset-0 rounded-md" aria-hidden="true"></div>
				{/if}
			</div>
			<p id="secret-size" class="mt-1.5 text-right font-mono text-xs {tooLarge ? 'text-void' : 'text-muted'}">
				{kib(bytes)} von 64 KB
			</p>

			<div class="mt-5 grid gap-x-8 gap-y-6 sm:grid-cols-[7.5rem_1fr] sm:items-center">
				<span id="ttl-label" class="label">Gültig</span>
				<div role="radiogroup" aria-labelledby="ttl-label" class="flex flex-wrap gap-1.5">
					{#each TTL_PRESETS as preset (preset.seconds)}
						<label
							class="flex min-h-10 cursor-pointer items-center rounded border px-3.5 text-[0.93rem] transition-colors has-checked:border-tint has-checked:bg-tint has-checked:text-on-tint has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-tint {ttl ===
							preset.seconds
								? ''
								: 'border-rule bg-sheet hover:border-tint hover:text-tint'}"
						>
							<input type="radio" name="ttl" value={preset.seconds} bind:group={ttl} class="sr-only" />
							{preset.label}
						</label>
					{/each}
				</div>

				<label for="views" class="label">Öffnungen</label>
				<div class="flex flex-wrap items-center gap-x-4 gap-y-2">
					<div class="inline-flex h-10 items-stretch overflow-hidden rounded border border-rule bg-sheet">
						<button
							type="button"
							class="w-10 text-lg text-muted hover:bg-tint-pale hover:text-ink disabled:opacity-40"
							aria-label="Eine Öffnung weniger"
							disabled={views <= MIN_VIEWS}
							onclick={() => (maxViews = views - 1)}>−</button
						>
						<input
							id="views"
							type="number"
							inputmode="numeric"
							min={MIN_VIEWS}
							max={MAX_VIEWS}
							bind:value={maxViews}
							onblur={() => (maxViews = views)}
							class="w-12 border-x border-rule bg-transparent text-center font-mono [appearance:textfield] focus-visible:outline-offset-[-2px] [&::-webkit-inner-spin-button]:appearance-none"
						/>
						<button
							type="button"
							class="w-10 text-lg text-muted hover:bg-tint-pale hover:text-ink disabled:opacity-40"
							aria-label="Eine Öffnung mehr"
							disabled={views >= MAX_VIEWS}
							onclick={() => (maxViews = views + 1)}>+</button
						>
					</div>
					<span class="text-sm text-muted">
						{views === 1 ? 'Nach dem ersten Öffnen gelöscht.' : `Nach ${views} Öffnungen gelöscht.`}
					</span>
				</div>

				<label for="password" class="label self-start sm:pt-3">Passwort</label>
				<div>
					<div class="relative max-w-sm">
						<input
							id="password"
							type={showPassword ? 'text' : 'password'}
							bind:value={password}
							autocomplete="new-password"
							placeholder="Optional"
							aria-describedby="password-hint"
							class="field pr-24"
						/>
						<button
							type="button"
							class="absolute inset-y-0 right-0 px-3 text-sm text-tint hover:underline"
							aria-pressed={showPassword}
							onclick={() => (showPassword = !showPassword)}>{showPassword ? 'Verbergen' : 'Anzeigen'}</button
						>
					</div>
					<p id="password-hint" class="mt-1.5 text-sm text-muted">
						Schick das Passwort über einen anderen Kanal als den Link.
					</p>
				</div>
			</div>

			<div class="mt-10 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-rule pt-6">
				<button type="submit" class="btn btn-primary" disabled={busy || !secret.trim() || tooLarge}>
					{busy ? 'Wird verschlüsselt …' : 'Link erstellen'}
				</button>
				{#if error}
					<p class="text-sm text-void" role="alert">{error}</p>
				{/if}
			</div>
		</form>
	</section>
{:else if phase === 'sealed' && created}
	<section aria-labelledby="done-title">
		<div class="liner rounded-md p-2.5">
			<div class="rounded-[3px] bg-sheet p-6 sm:p-9">
				<span class="stamp">Versiegelt</span>
				<h1 id="done-title" tabindex="-1" use:autofocus class="display mt-6 text-[clamp(2rem,6vw,3rem)] outline-none">
					Link erstellt.
				</h1>
				<p class="mt-3 max-w-[34rem] leading-relaxed text-muted">
					{created.maxViews === 1
						? 'Der Link öffnet das Geheimnis genau einmal.'
						: `Der Link öffnet das Geheimnis ${created.maxViews}-mal.`}
					Danach, spätestens aber {fromNow(created.expiresAt)}, ist es gelöscht.
				</p>

				<div class="mt-7 rounded border border-rule bg-paper p-4 font-mono text-[0.9rem] leading-relaxed break-all select-all">
					{created.link}
				</div>
				<div class="mt-4 flex flex-wrap gap-3">
					<CopyButton text={created.link} label="Link kopieren" copiedLabel="Link kopiert" />
					<button type="button" class="btn btn-quiet" onclick={reset}>Neues Geheimnis</button>
				</div>

				<dl class="mt-9 grid gap-5 border-t border-rule pt-6 sm:grid-cols-3">
					<div>
						<dt class="label">Läuft ab</dt>
						<dd class="mt-1.5">{dateTime(created.expiresAt)}</dd>
					</div>
					<div>
						<dt class="label">Öffnungen</dt>
						<dd class="mt-1.5">{created.maxViews}×</dd>
					</div>
					<div>
						<dt class="label">Passwort</dt>
						<dd class="mt-1.5">{hadPassword ? 'Ja, separat mitteilen' : 'Keins'}</dd>
					</div>
				</dl>

				<p class="mt-8 text-sm leading-relaxed text-muted">
					Der Link wird nur jetzt angezeigt. Der Server kennt den Schlüssel nicht und kann den Link nicht
					wiederherstellen.
				</p>

				<div class="mt-5 flex min-h-11 flex-wrap items-center gap-x-3 gap-y-2 text-sm">
					{#if confirmBurn}
						<span>Link sofort ungültig machen?</span>
						<button type="button" class="btn btn-void font-semibold" disabled={busy} onclick={burn}>Ja, löschen</button>
						<button type="button" class="btn btn-quiet min-h-9" onclick={() => (confirmBurn = false)}>Abbrechen</button>
					{:else}
						<button type="button" class="btn btn-void -ml-2" onclick={() => (confirmBurn = true)}>
							Link jetzt löschen
						</button>
					{/if}
					{#if error}<span class="text-void" role="alert">{error}</span>{/if}
				</div>
			</div>
		</div>
	</section>
{:else if phase === 'burned'}
	<section aria-labelledby="burned-title">
		<span class="stamp stamp-void">Gelöscht</span>
		<h1 id="burned-title" tabindex="-1" use:autofocus class="display mt-6 text-[clamp(2rem,6vw,3rem)] outline-none">
			Link gelöscht.
		</h1>
		<p class="mt-3 max-w-[34rem] leading-relaxed text-muted">
			Das Geheimnis ist vom Server entfernt. Wer den Link jetzt öffnet, sieht nur noch, dass es nicht mehr
			existiert.
		</p>
		<button type="button" class="btn btn-primary mt-8" onclick={reset}>Neues Geheimnis</button>
	</section>
{/if}
