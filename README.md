# giar otp

Passwörter, API-Keys und Zugangsdaten über einen Link teilen, der sich nach dem Öffnen selbst löscht.
SvelteKit 5 + SQLite, Ende-zu-Ende verschlüsselt, mit REST-API und SDKs für JavaScript/TypeScript und Python.

- **Verschlüsselung im Browser** mit AES-256-GCM. Der Schlüssel steht nur im Link nach dem `#` und erreicht den Server nie.
- **Lebensdauer** 1 Minute bis 7 Tage (serverseitig erzwungen), **Öffnungen** 1 bis 100.
- **Optionales Passwort** zusätzlich zum Link. Falsche Passwörter verbrauchen keine Öffnung; nach 10 Fehlversuchen wird das Geheimnis gelöscht.
- **Nicht erratbare Links**: 192-Bit-ID + 256-Bit-Schlüssel aus dem CSPRNG. Wer nur die ID kennt (z. B. aus Server-Logs), kann das Geheimnis weder lesen noch verbrauchen.
- **Kopieren-Buttons** für den Link nach dem Erstellen und für das Geheimnis nach dem Öffnen.
- **Entwickler-API** unter `/docs`, OpenAPI unter `/api/v1/openapi.json`.

## Entwicklung

```sh
npm install
npm run dev
```

Voraussetzung: Node.js ≥ 22.18 (nutzt das eingebaute `node:sqlite`, keine nativen Abhängigkeiten).

| Befehl | Zweck |
| --- | --- |
| `npm run check` | Typen prüfen |
| `npm run build && npm start` | Produktions-Build starten |
| `npm run test:e2e` | JS-SDK-Tests gegen eine laufende Instanz (`OTP_BASE_URL`) |
| `npm run apikey -- create "Name"` | API-Key anlegen (`list`, `revoke <id>`) |

## Konfiguration

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `DATABASE_PATH` | `data/otp.sqlite` | SQLite-Datei |
| `ORIGIN` | – | Öffentliche URL, z. B. `https://otp.giar.digital` (adapter-node) |
| `ADDRESS_HEADER`, `XFF_DEPTH` | – | Hinter einem Reverse-Proxy auf `X-Forwarded-For` / `1` setzen, damit die Rate-Limits die echte Client-IP sehen |
| `PORT` | `3000` | |

## Deployment

```sh
docker build -t giar-otp .
docker run -p 3000:3000 -v otp-data:/data -e ORIGIN=https://otp.giar.digital giar-otp
```

Die App braucht einen dauerhaft laufenden Node-Prozess (SQLite + In-Memory-Rate-Limits), also keine Serverless-Plattform. Eine Instanz, ein Volume für `/data`.

## Aufbau

```
sdks/js/src/crypto.ts        Protokoll (einzige Quelle, auch von der Web-App genutzt)
sdks/js/src/client.ts        JS/TS-SDK        sdks/js/src/cli.ts   CLI (otp-giar)
sdks/python/otp_giar/        Python-SDK + CLI (python -m otp_giar)
src/lib/server/secrets.ts    Anlegen, Öffnen, Löschen, Ablauf
src/lib/server/database.ts   Schema + Migrationen
src/routes/api/v1/           REST-API
src/routes/s/[id]/           Seite zum Öffnen
src/hooks.server.ts          Security-Header, CORS, Aufräum-Job
```
