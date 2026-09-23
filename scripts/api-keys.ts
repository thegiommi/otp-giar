// Manage API keys. Run with Node >= 22.18 (native TypeScript):
//   npm run apikey -- create "GitHub Actions"
//   npm run apikey -- list
//   npm run apikey -- revoke <id>
import { randomBytes, randomUUID } from 'node:crypto';
import { openDatabase } from '../src/lib/server/database.ts';
import { sha256Hex } from '../src/lib/server/tokens.ts';

const [command, ...args] = process.argv.slice(2);
const db = openDatabase();

switch (command) {
	case 'create': {
		const name = args.join(' ').trim();
		if (!name) exit('Usage: npm run apikey -- create "<name>"');
		const key = `ogk_${randomBytes(32).toString('base64url')}`;
		const id = randomUUID();
		db.prepare('INSERT INTO api_keys (id, name, prefix, key_hash, created_at) VALUES (?, ?, ?, ?, ?)').run(
			id,
			name,
			key.slice(0, 10),
			sha256Hex(key),
			Date.now()
		);
		console.log(`Created API key "${name}" (${id})\n\n  ${key}\n\nStore it now – it is not shown again.`);
		break;
	}
	case 'list': {
		const rows = db
			.prepare('SELECT id, name, prefix, created_at, last_used_at, revoked_at FROM api_keys ORDER BY created_at')
			.all() as { id: string; name: string; prefix: string; created_at: number; last_used_at: number | null; revoked_at: number | null }[];
		if (rows.length === 0) console.log('No API keys.');
		for (const r of rows) {
			const status = r.revoked_at ? 'revoked' : 'active';
			const used = r.last_used_at ? new Date(r.last_used_at).toISOString() : 'never';
			console.log(`${r.id}  ${r.prefix}…  ${status.padEnd(7)}  last used: ${used}  ${r.name}`);
		}
		break;
	}
	case 'revoke': {
		const { changes } = db
			.prepare('UPDATE api_keys SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL')
			.run(Date.now(), args[0] ?? '');
		if (!changes) exit('No active key with that id.');
		console.log('Revoked.');
		break;
	}
	default:
		exit('Usage: npm run apikey -- <create "name" | list | revoke <id>>');
}

function exit(message: string): never {
	console.error(message);
	process.exit(1);
}
