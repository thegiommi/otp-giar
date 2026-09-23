import { OtpError } from '$lib/crypto';

export const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const prefersReducedMotion = () =>
	typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Svelte action: move focus to an element when it appears (announces state changes). */
export function autofocus(node: HTMLElement) {
	node.focus({ preventScroll: false });
}

/** German, user-facing text for API errors. */
export function describeError(err: unknown): string {
	if (err instanceof OtpError) {
		switch (err.code) {
			case 'rate_limited': {
				const minutes = Math.max(1, Math.ceil(Number(err.details.retryAfter ?? 60) / 60));
				return `Zu viele Anfragen von deiner Verbindung. Versuch es in ${minutes} Min. erneut.`;
			}
			case 'secret_too_large':
			case 'payload_too_large':
				return 'Das Geheimnis ist zu lang. Erlaubt sind 64 KB.';
			case 'not_found':
				return 'Dieses Geheimnis existiert nicht mehr.';
			default:
				return `Der Server hat die Anfrage abgelehnt (${err.code}). Lade die Seite neu und versuch es noch einmal.`;
		}
	}
	if (err instanceof TypeError) return 'Keine Verbindung zum Server. Prüf deine Internetverbindung.';
	return 'Etwas ist schiefgelaufen. Lade die Seite neu und versuch es noch einmal.';
}
