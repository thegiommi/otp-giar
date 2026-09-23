<script lang="ts">
	import { page } from '$app/state';
	import Code from '$lib/components/Code.svelte';
	import CodeTabs from '$lib/components/CodeTabs.svelte';
	import { MAX_FAILED_ATTEMPTS } from '$lib/config';

	const base = $derived(page.url.origin);

	const quickstart = $derived([
		{
			label: 'JavaScript',
			code: `import { OtpClient } from 'otp-giar';

const otp = new OtpClient({ baseUrl: '${base}', apiKey: process.env.OTP_API_KEY });

// Verschlüsselt lokal, der Server bekommt nur den Ciphertext.
const { link, deleteToken } = await otp.create('DB_PASSWORD=hunter2', {
  expiresIn: 3600, // Sekunden, maximal 7 Tage
  maxViews: 1,
  password: 'optional'
});

// Öffnen (verbraucht eine Öffnung) und lokal entschlüsseln.
const { secret, viewsRemaining } = await otp.reveal(link, { password: 'optional' });`
		},
		{
			label: 'Python',
			code: `import os
from otp_giar import OtpClient

otp = OtpClient("${base}", api_key=os.environ.get("OTP_API_KEY"))

created = otp.create("DB_PASSWORD=hunter2", expires_in=3600, max_views=1)
print(created.link)

revealed = otp.reveal(created.link)
print(revealed.secret)`
		},
		{
			label: 'CLI',
			code: `export OTP_BASE_URL=${base}

# Geheimnis kommt über stdin, der Link auf stdout.
printf '%s' "$DB_PASSWORD" | npx otp-giar create --ttl 1h --views 1

# Öffnen
npx otp-giar reveal "${base}/s/<id>#<key>"

# Mit Passwort (aus einer Umgebungsvariable, nie als Argument)
printf '%s' "$TOKEN" | npx otp-giar create --password-env SHARE_PW

# Alternativ in Python-Umgebungen: pip install otp-giar`
		},
		{
			label: 'cURL',
			code: `# Klartext-Modus: der Server verschlüsselt und gibt den Link einmalig zurück.
curl -s -X POST ${base}/api/v1/secrets \\
  -H 'Content-Type: application/json' \\
  -d '{"secret": "DB_PASSWORD=hunter2", "expiresIn": 3600, "maxViews": 1}'

# Öffnen mit dem Schlüssel aus dem Link (Teil nach dem #)
curl -s -X POST ${base}/api/v1/secrets/<id>/reveal \\
  -H 'Content-Type: application/json' \\
  -d '{"key": "<key>"}'`
		}
	]);

	const createResponse = $derived(`{
  "id": "vN4MP8Hdk0rjKY06fWMxVVZDA-OPAkLI",
  "url": "${base}/s/vN4MP8Hdk0rjKY06fWMxVVZDA-OPAkLI",
  "expiresAt": "2026-09-25T14:32:00.000Z",
  "maxViews": 1,
  "deleteToken": "lnNzBFYmszeV1pnADnKpmYuSVKJ6IIZTG2GZI3P3yxg",

  // nur im Klartext-Modus:
  "key": "hbEP-kstB6NdtzT_E86eOgH5iOt2oM1m-vedLUx469I",
  "link": "${base}/s/vN4MP8Hdk0rjKY06fWMxVVZDA-OPAkLI#hbEP-kstB6N…"
}`);

	const e2eBody = `{
  "version": 1,
  "ciphertext": "<base64url>",
  "iv": "<base64url, 12 Bytes>",
  "salt": "<base64url, 16 Bytes>",
  "kdf": null,               // oder { "name": "pbkdf2-sha256", "iterations": 600000 }
  "authToken": "<base64url, 32 Bytes>",
  "expiresIn": 3600,
  "maxViews": 1
}`;

	const protocol = `key        = 32 Zufallsbytes              → steht nur im Link nach dem #
salt, iv   = 16 / 12 Zufallsbytes
ikm        = key                           ohne Passwort
           = key ‖ PBKDF2-SHA256(Passwort, salt, 600 000)
encKey     = HKDF-SHA256(ikm, salt, "otp-giar:v1:enc")
authToken  = HKDF-SHA256(ikm, salt, "otp-giar:v1:auth")
ciphertext = AES-256-GCM(encKey, iv, Text, aad = "otp-giar:v1")`;

	const githubActions = $derived(`- name: Staging-Zugang an QA schicken
  env:
    OTP_BASE_URL: ${base}
    OTP_API_KEY: \${{ secrets.OTP_API_KEY }}
    STAGING_PASSWORD: \${{ secrets.STAGING_PASSWORD }}
    SLACK_WEBHOOK: \${{ secrets.SLACK_WEBHOOK }}
  run: |
    LINK=$(printf '%s' "$STAGING_PASSWORD" | npx -y otp-giar create --ttl 1d --views 1)
    echo "::add-mask::$LINK"
    curl -s -X POST "$SLACK_WEBHOOK" -H 'Content-Type: application/json' \\
      -d "{\\"text\\": \\"Staging-Zugang (einmal lesbar): $LINK\\"}"`);

	const endpoints = [
		{ method: 'POST', path: '/api/v1/secrets', text: 'Geheimnis anlegen', anchor: 'create' },
		{ method: 'GET', path: '/api/v1/secrets/{id}', text: 'Metadaten lesen, verbraucht keine Öffnung', anchor: 'info' },
		{ method: 'POST', path: '/api/v1/secrets/{id}/reveal', text: 'Öffnen, verbraucht eine Öffnung', anchor: 'reveal' },
		{ method: 'DELETE', path: '/api/v1/secrets/{id}', text: 'Vorzeitig löschen', anchor: 'burn' },
		{ method: 'GET', path: '/api/v1/openapi.json', text: 'OpenAPI-3.1-Spezifikation', anchor: 'openapi' }
	];

	const errors = [
		['400', 'invalid_request', 'Feld fehlt oder ist ungültig, siehe field'],
		['400', 'password_required', 'Geheimnis ist passwortgeschützt, password fehlt'],
		['401', 'invalid_api_key', 'API-Key unbekannt oder widerrufen'],
		['401', 'invalid_credentials', 'Passwort oder Schlüssel falsch, siehe attemptsRemaining'],
		['403', 'invalid_delete_token', 'Lösch-Token passt nicht'],
		['404', 'not_found', 'Existiert nicht, abgelaufen oder schon geöffnet'],
		['410', 'destroyed', `Nach ${MAX_FAILED_ATTEMPTS} Fehlversuchen gelöscht`],
		['413', 'secret_too_large', 'Mehr als 64 KB'],
		['415', 'unsupported_media_type', 'Body muss application/json sein'],
		['429', 'rate_limited', 'Zu viele Anfragen, siehe Retry-After']
	];

	const methodClass: Record<string, string> = {
		GET: 'text-tint border-tint',
		POST: 'bg-tint text-on-tint border-tint',
		DELETE: 'text-void border-void'
	};
</script>

<svelte:head>
	<title>API · giar otp</title>
	<meta
		name="description"
		content="REST-API und SDKs für JavaScript, Python und die Kommandozeile: Geheimnisse aus Skripten und CI/CD-Pipelines teilen."
	/>
</svelte:head>

{#snippet method(m: string)}
	<span
		class="inline-flex w-16 shrink-0 justify-center rounded-[3px] border py-0.5 text-[0.7rem] font-bold tracking-[0.12em] [font-stretch:70%] {methodClass[
			m
		]}">{m}</span
	>
{/snippet}

<article class="prose-docs">
	<header>
		<p class="label">Entwickler-API</p>
		<h1 class="display mt-3 text-[clamp(2.4rem,7vw,3.8rem)]">Geheimnisse aus dem Code teilen.</h1>
		<p class="mt-5 max-w-[36rem] text-[1.05rem] leading-relaxed text-muted">
			Für Skripte, CI/CD-Pipelines und interne Tools: dieselbe Verschlüsselung wie im Browser, als REST-API und als
			SDK für JavaScript/TypeScript und Python, jeweils mit Kommandozeile.
		</p>
	</header>

	<section id="quickstart" class="mt-14 scroll-mt-6">
		<h2 class="text-2xl font-extrabold tracking-tight [font-stretch:112%]">Schnellstart</h2>
		<p class="mt-3 max-w-[36rem] leading-relaxed text-muted">
			Die SDKs verschlüsseln lokal. Beim Server kommt nur Ciphertext an, der Schlüssel bleibt im Link.
		</p>
		<div class="mt-5">
			<CodeTabs id="qs" tabs={quickstart} />
		</div>
		<dl class="mt-5 grid gap-4 text-sm sm:grid-cols-2">
			<div>
				<dt class="label">npm</dt>
				<dd class="mt-1 font-mono">npm install otp-giar</dd>
			</div>
			<div>
				<dt class="label">pip</dt>
				<dd class="mt-1 font-mono">pip install otp-giar</dd>
			</div>
		</dl>
	</section>

	<section id="endpoints" class="mt-16 scroll-mt-6">
		<h2 class="text-2xl font-extrabold tracking-tight [font-stretch:112%]">Endpunkte</h2>
		<p class="mt-3 leading-relaxed text-muted">
			Basis-URL <code>{base}</code>. JSON rein, JSON raus. CORS ist für alle Ursprünge offen, die API nutzt keine
			Cookies.
		</p>
		<ul class="mt-5 divide-y divide-rule rounded-md border border-rule bg-sheet">
			{#each endpoints as e (e.method + e.path)}
				<li>
					<a href="#{e.anchor}" class="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-tint-pale/50">
						{@render method(e.method)}
						<span class="font-mono text-[0.88rem] text-ink">{e.path}</span>
						<span class="text-sm text-muted sm:ml-auto">{e.text}</span>
					</a>
				</li>
			{/each}
		</ul>

		<div id="create" class="mt-12 scroll-mt-6">
			<h3 class="flex flex-wrap items-center gap-3 text-lg font-bold">
				{@render method('POST')}<span class="font-mono text-base font-normal">/api/v1/secrets</span>
			</h3>
			<p class="mt-3 leading-relaxed">Zwei Varianten, je nachdem was im Body steht:</p>
			<ul class="mt-3 list-disc space-y-2 pl-5 leading-relaxed">
				<li>
					<strong>Ende-zu-Ende</strong> (SDKs, Web-App): der Client verschlüsselt selbst und schickt
					<code>ciphertext</code>, <code>iv</code>, <code>salt</code>, <code>kdf</code> und <code>authToken</code>. Den
					Link baut er aus <code>url</code> + <code>#</code> + Schlüssel.
				</li>
				<li>
					<strong>Klartext</strong> (schnell mit cURL): <code>secret</code> und optional <code>password</code>. Der
					Server verschlüsselt im Arbeitsspeicher, speichert nur den Ciphertext und gibt <code>key</code> und
					<code>link</code> genau einmal zurück.
				</li>
			</ul>
			<table class="mt-5 w-full text-left text-sm">
				<thead>
					<tr class="border-b border-rule"><th class="label py-2 pr-4">Feld</th><th class="label py-2">Bedeutung</th></tr>
				</thead>
				<tbody class="divide-y divide-rule">
					<tr><td class="py-2 pr-4 align-top font-mono">expiresIn</td><td class="py-2">Lebensdauer in Sekunden, 60 bis 604800 (7 Tage). Standard 86400.</td></tr>
					<tr><td class="py-2 pr-4 align-top font-mono">maxViews</td><td class="py-2">Wie oft es geöffnet werden kann, 1 bis 100. Standard 1.</td></tr>
					<tr><td class="py-2 pr-4 align-top font-mono">secret</td><td class="py-2">Klartext-Modus: der Text, maximal 64 KB.</td></tr>
					<tr><td class="py-2 pr-4 align-top font-mono">password</td><td class="py-2">Klartext-Modus: optionales Passwort zum Öffnen.</td></tr>
				</tbody>
			</table>
			<div class="mt-5 grid gap-4">
				<Code label="Body Ende-zu-Ende" code={e2eBody} />
				<Code label="Antwort 201" code={createResponse} />
			</div>
			<p class="mt-4 text-sm leading-relaxed text-muted">
				Im Klartext-Modus sieht der Server das Geheimnis kurz im Arbeitsspeicher. Wenn das nicht in Frage kommt, nimm
				ein SDK oder die CLI.
			</p>
		</div>

		<div id="info" class="mt-12 scroll-mt-6">
			<h3 class="flex flex-wrap items-center gap-3 text-lg font-bold">
				{@render method('GET')}<span class="font-mono text-base font-normal">/api/v1/secrets/{'{id}'}</span>
			</h3>
			<p class="mt-3 leading-relaxed">
				Liefert <code>expiresAt</code>, <code>maxViews</code>, <code>viewsRemaining</code>,
				<code>passwordRequired</code> sowie <code>salt</code> und <code>kdf</code>, die ein Client zum Ableiten des
				<code>authToken</code> braucht. Verbraucht keine Öffnung.
			</p>
		</div>

		<div id="reveal" class="mt-12 scroll-mt-6">
			<h3 class="flex flex-wrap items-center gap-3 text-lg font-bold">
				{@render method('POST')}<span class="font-mono text-base font-normal">/api/v1/secrets/{'{id}'}/reveal</span>
			</h3>
			<p class="mt-3 leading-relaxed">
				Öffnet das Geheimnis und zieht eine Öffnung ab. Bei der letzten Öffnung wird es sofort gelöscht.
			</p>
			<ul class="mt-3 list-disc space-y-2 pl-5 leading-relaxed">
				<li>
					<code>{'{ "authToken": "…" }'}</code> liefert <code>ciphertext</code>, <code>iv</code>,
					<code>salt</code>, <code>kdf</code>. Der Client entschlüsselt selbst.
				</li>
				<li>
					<code>{'{ "key": "…", "password": "…" }'}</code> liefert <code>secret</code> im Klartext.
				</li>
			</ul>
			<p class="mt-3 leading-relaxed">
				Ein falsches Passwort verbraucht keine Öffnung, zählt aber als Fehlversuch. Nach {MAX_FAILED_ATTEMPTS}
				Fehlversuchen wird das Geheimnis gelöscht.
			</p>
		</div>

		<div id="burn" class="mt-12 scroll-mt-6">
			<h3 class="flex flex-wrap items-center gap-3 text-lg font-bold">
				{@render method('DELETE')}<span class="font-mono text-base font-normal">/api/v1/secrets/{'{id}'}</span>
			</h3>
			<p class="mt-3 leading-relaxed">
				Löscht ein Geheimnis vor Ablauf. Erwartet den <code>deleteToken</code> aus der Antwort beim Anlegen im Header
				<code>X-Delete-Token</code>. Antwortet mit 204.
			</p>
		</div>

		<div id="openapi" class="mt-12 scroll-mt-6">
			<h3 class="flex flex-wrap items-center gap-3 text-lg font-bold">
				{@render method('GET')}<span class="font-mono text-base font-normal">/api/v1/openapi.json</span>
			</h3>
			<p class="mt-3 leading-relaxed">
				Maschinenlesbare Beschreibung für Postman, Insomnia oder Codegeneratoren:
				<a class="text-tint underline underline-offset-3" href="/api/v1/openapi.json">openapi.json</a>
			</p>
		</div>
	</section>

	<section id="security" class="mt-16 scroll-mt-6">
		<h2 class="text-2xl font-extrabold tracking-tight [font-stretch:112%]">Verschlüsselung</h2>
		<p class="mt-3 max-w-[38rem] leading-relaxed">
			Jedes Geheimnis bekommt einen eigenen Schlüssel. Browser schicken den Teil nach dem <code>#</code> nie an einen
			Server, deshalb kennt die Instanz den Schlüssel nicht.
		</p>
		<div class="mt-5"><Code label="Protokoll v1" code={protocol} /></div>
		<ul class="mt-5 list-disc space-y-2 pl-5 leading-relaxed">
			<li>
				Gespeichert werden nur Ciphertext, <code>iv</code>, <code>salt</code> und SHA-256 des
				<code>authToken</code>. Wer nur die ID kennt, kann das Geheimnis weder lesen noch eine Öffnung verbrauchen.
			</li>
			<li>
				IDs haben 192 Bit, Schlüssel 256 Bit, beides aus dem Zufallsgenerator des Betriebssystems. Raten ist
				aussichtslos; zusätzlich gibt es Rate-Limits pro IP.
			</li>
			<li>Abgelaufene und verbrauchte Geheimnisse werden sofort gelöscht, SQLite überschreibt freie Seiten.</li>
		</ul>
	</section>

	<section id="limits" class="mt-16 scroll-mt-6">
		<h2 class="text-2xl font-extrabold tracking-tight [font-stretch:112%]">API-Keys und Limits</h2>
		<p class="mt-3 max-w-[38rem] leading-relaxed">
			Ohne Key funktioniert alles, aber mit engeren Limits. Ein Key wird als
			<code>Authorization: Bearer ogk_…</code> mitgeschickt. Keys vergibt, wer die Instanz betreibt:
			<code>npm run apikey -- create "GitHub Actions"</code>.
		</p>
		<table class="mt-5 w-full text-left text-sm">
			<thead>
				<tr class="border-b border-rule"><th class="label py-2 pr-4">Aktion</th><th class="label py-2 pr-4">Ohne Key</th><th class="label py-2">Mit Key</th></tr>
			</thead>
			<tbody class="divide-y divide-rule">
				<tr><td class="py-2 pr-4">Anlegen</td><td class="py-2 pr-4">20 pro 10 Min. und IP</td><td class="py-2">1000 pro 10 Min.</td></tr>
				<tr><td class="py-2 pr-4">Öffnen</td><td class="py-2 pr-4">30 pro 10 Min. und IP</td><td class="py-2">gleich</td></tr>
				<tr><td class="py-2 pr-4">Grösse</td><td class="py-2 pr-4" colspan="2">64 KB Text</td></tr>
				<tr><td class="py-2 pr-4">Lebensdauer</td><td class="py-2 pr-4" colspan="2">1 Minute bis 7 Tage</td></tr>
				<tr><td class="py-2 pr-4">Öffnungen</td><td class="py-2 pr-4" colspan="2">1 bis 100</td></tr>
			</tbody>
		</table>
	</section>

	<section id="errors" class="mt-16 scroll-mt-6">
		<h2 class="text-2xl font-extrabold tracking-tight [font-stretch:112%]">Fehler</h2>
		<p class="mt-3 leading-relaxed">
			Immer im Format <code>{'{ "error": { "code": "…", "message": "…" } }'}</code>, teils mit Zusatzfeldern.
		</p>
		<div class="mt-5 overflow-x-auto">
			<table class="w-full min-w-[32rem] text-left text-sm">
				<thead>
					<tr class="border-b border-rule"><th class="label py-2 pr-4">Status</th><th class="label py-2 pr-4">code</th><th class="label py-2">Bedeutung</th></tr>
				</thead>
				<tbody class="divide-y divide-rule">
					{#each errors as [status, code, text] (code)}
						<tr>
							<td class="py-2 pr-4 font-mono">{status}</td>
							<td class="py-2 pr-4 font-mono">{code}</td>
							<td class="py-2">{text}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>

	<section id="ci" class="mt-16 scroll-mt-6">
		<h2 class="text-2xl font-extrabold tracking-tight [font-stretch:112%]">Beispiel: GitHub Actions</h2>
		<p class="mt-3 max-w-[38rem] leading-relaxed">
			Ein Pipeline-Schritt, der ein Staging-Passwort als Einmal-Link in Slack postet, statt es im Klartext zu
			verschicken.
		</p>
		<div class="mt-5"><Code label=".github/workflows/deploy.yml" code={githubActions} /></div>
	</section>
</article>
