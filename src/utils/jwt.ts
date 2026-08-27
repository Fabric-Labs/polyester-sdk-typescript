/**
 * Checks whether a string has the shape of a JWT.
 */
export function isJwt(token: string): boolean {
    const parts = token.split(".");
    return parts.length === 3 && !!parts[0] && !!parts[1] && !!parts[2];
}

let textDecoder: TextDecoder | undefined;

/**
 * Gets a TextDecoder instance.
 */
function getTextDecoder(): TextDecoder {
    textDecoder ??= new TextDecoder("utf-8", { fatal: true });
    return textDecoder;
}

function decodeBase64Url(value: string): string | null {
    const remainder = value.length % 4;
    if (remainder === 1) return null;

    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const paddedBase64 =
        remainder === 0 ? base64 : base64.padEnd(base64.length + 4 - remainder, "=");
    const binary = atob(paddedBase64);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return getTextDecoder().decode(bytes);
}

/**
 * Reads a JWT expiration timestamp when present.
 */
export function getJwtExpiration(token: string): number | null {
    try {
        const [_, rawPayload] = token.split(".");
        if (!rawPayload) return null;
        const decodedPayload = decodeBase64Url(rawPayload);
        if (!decodedPayload) return null;
        const payload: unknown = JSON.parse(decodedPayload);
        if (typeof payload !== "object" || payload === null) return null;
        const exp = (payload as { exp?: unknown }).exp;
        return typeof exp === "number" && Number.isFinite(exp) ? exp : null;
    } catch {
        return null;
    }
}

/**
 * Checks whether a JWT is expired.
 */
export function isJwtExpired(token: string): boolean {
    const exp = getJwtExpiration(token);
    if (exp === null) return true;
    return Date.now() >= exp * 1000;
}

/**
 * Checks whether a value is a present, well-formed, unexpired JWT string.
 */
export function isJwtValid(token: unknown): token is string {
    if (typeof token !== "string" || !token) return false;
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
