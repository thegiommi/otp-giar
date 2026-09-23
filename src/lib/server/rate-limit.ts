import { dev } from '$app/environment';
import { ApiError } from './http';

interface Bucket {
	count: number;
	resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Fixed-window limiter, in memory. Good enough for a single Node process. */
export function rateLimit(key: string, limit: number, windowMs: number): void {
	const now = Date.now();
	let bucket = buckets.get(key);
	if (!bucket || bucket.resetAt <= now) {
		bucket = { count: 0, resetAt: now + windowMs };
		buckets.set(key, bucket);
	}
	bucket.count++;
	if (bucket.count > (dev ? limit * 100 : limit)) {
		const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
		throw new ApiError(
			429,
			'rate_limited',
			'Too many requests, try again later',
			{ retryAfter },
			{ 'Retry-After': String(retryAfter) }
		);
	}
}

export function sweepRateLimits(): void {
	const now = Date.now();
	for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
}

const MINUTE = 60_000;

export const limits = {
	createAnonymous: { limit: 20, windowMs: 10 * MINUTE },
	createWithKey: { limit: 1000, windowMs: 10 * MINUTE },
	reveal: { limit: 30, windowMs: 10 * MINUTE },
	read: { limit: 300, windowMs: 10 * MINUTE }
} as const;
