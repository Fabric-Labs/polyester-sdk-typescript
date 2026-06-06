export function isJwt(token: string): boolean {
	const parts = token.split(".");
	return parts.length === 3 && !!parts[0] && !!parts[1] && !!parts[2];
}

export function getJwtExpiration(token: string): number | null {
	try {
		const [_, rawPayload] = token.split(".");
		if (!rawPayload) return null;
		const payload = JSON.parse(atob(rawPayload));
		return typeof payload.exp === "number" ? payload.exp : null;
	} catch {
		return null;
	}
}

export function isJwtExpired(token: string): boolean {
	const exp = getJwtExpiration(token);
	if (exp === null) return true;
	const currentTime = Math.floor(Date.now() / 1000);
	return exp < currentTime;
}

export function isJwtValid(token: string | null): token is string {
	if (!token) return false;
	if (!isJwt(token)) return false;
	if (isJwtExpired(token)) return false;
	return true;
}

/**
 * Returns the number of milliseconds until the JWT expires.
 * Returns 0 if already expired or invalid.
 */
export function getJwtTimeToExpiry(token: string): number {
	const exp = getJwtExpiration(token);
	if (exp === null) return 0;
	const nowMs = Date.now();
	const expiresAtMs = exp * 1000;
	return Math.max(0, expiresAtMs - nowMs);
}
