const relative = new Intl.RelativeTimeFormat('de', { numeric: 'auto' });
const absolute = new Intl.DateTimeFormat('de-CH', {
	weekday: 'short',
	day: 'numeric',
	month: 'numeric',
	hour: '2-digit',
	minute: '2-digit'
});

/** "in 3 Tagen", "in 2 Stunden", "in 14 Minuten". */
export function fromNow(iso: string, now = Date.now()): string {
	const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
	const abs = Math.abs(seconds);
	if (abs < 60) return relative.format(seconds, 'second');
	if (abs < 3600) return relative.format(Math.round(seconds / 60), 'minute');
	if (abs < 48 * 3600) return relative.format(Math.round(seconds / 3600), 'hour');
	return relative.format(Math.round(seconds / 86400), 'day');
}

/** "Fr., 25.9., 14:32" */
export function dateTime(iso: string): string {
	return absolute.format(new Date(iso));
}

export function views(n: number): string {
	return n === 1 ? '1 Öffnung' : `${n} Öffnungen`;
}

export function kib(bytes: number): string {
	return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
}
