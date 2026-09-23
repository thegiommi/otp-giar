import type { DatabaseSync } from 'node:sqlite';
import { openDatabase } from './database';

let instance: DatabaseSync | undefined;

export function db(): DatabaseSync {
	instance ??= openDatabase();
	return instance;
}

/** Runs `fn` inside an IMMEDIATE transaction (write lock taken up front). */
export function transaction<T>(fn: (db: DatabaseSync) => T): T {
	const conn = db();
	conn.exec('BEGIN IMMEDIATE');
	try {
		const result = fn(conn);
		conn.exec('COMMIT');
		return result;
	} catch (err) {
		conn.exec('ROLLBACK');
		throw err;
	}
}
