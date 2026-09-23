// Kept free of SvelteKit imports so scripts/api-keys.ts can use it with plain Node.
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const MIGRATIONS = [
	`
	CREATE TABLE secrets (
		id               TEXT PRIMARY KEY,
		version          INTEGER NOT NULL,
		ciphertext       TEXT    NOT NULL,
		iv               TEXT    NOT NULL,
		salt             TEXT    NOT NULL,
		kdf_iterations   INTEGER,
		auth_hash        TEXT    NOT NULL,
		delete_hash      TEXT    NOT NULL,
		max_views        INTEGER NOT NULL,
		views_remaining  INTEGER NOT NULL,
		failed_attempts  INTEGER NOT NULL DEFAULT 0,
		created_at       INTEGER NOT NULL,
		expires_at       INTEGER NOT NULL
	);
	CREATE INDEX secrets_expires_at ON secrets (expires_at);

	CREATE TABLE api_keys (
		id           TEXT PRIMARY KEY,
		name         TEXT    NOT NULL,
		prefix       TEXT    NOT NULL,
		key_hash     TEXT    NOT NULL UNIQUE,
		created_at   INTEGER NOT NULL,
		last_used_at INTEGER,
		revoked_at   INTEGER
	);
	`
];

export function defaultDatabasePath(): string {
	return resolve(process.env.DATABASE_PATH || 'data/otp.sqlite');
}

export function openDatabase(path = defaultDatabasePath()): DatabaseSync {
	mkdirSync(dirname(path), { recursive: true });
	const db = new DatabaseSync(path);
	db.exec(`
		PRAGMA journal_mode = WAL;
		PRAGMA synchronous = NORMAL;
		PRAGMA busy_timeout = 5000;
		PRAGMA secure_delete = ON;
	`);

	const { user_version } = db.prepare('PRAGMA user_version').get() as { user_version: number };
	for (let v = user_version; v < MIGRATIONS.length; v++) {
		db.exec('BEGIN');
		try {
			db.exec(MIGRATIONS[v]);
			db.exec(`PRAGMA user_version = ${v + 1}`);
			db.exec('COMMIT');
		} catch (err) {
			db.exec('ROLLBACK');
			throw err;
		}
	}
	return db;
}
