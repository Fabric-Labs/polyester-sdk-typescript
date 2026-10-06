// Device clocks drift; server-checked deadlines and expiries use this offset,
// learned from API response `Date` headers. Cross-origin browsers only see the
// header when the API lists `Date` in Access-Control-Expose-Headers.
let serverOffsetMs: number | undefined;

/** Learns the server clock offset from an HTTP `Date` response header. */
export function observeServerDate(value: string | null): void {
    if (!value) return;
    const serverMs = Date.parse(value);
    if (!Number.isNaN(serverMs)) serverOffsetMs = serverMs - Date.now();
}

/** Current time in epoch milliseconds, corrected to the last observed server clock. */
export function serverNowMs(): number {
    return Date.now() + (serverOffsetMs ?? 0);
}

/**
 * Server time in epoch milliseconds, or `undefined` before any `Date` header has
 * been seen. Use this to compare against server-issued timestamps, where an
 * uncorrected device clock would give false expiries.
 */
export function knownServerNowMs(): number | undefined {
    return serverOffsetMs === undefined ? undefined : Date.now() + serverOffsetMs;
}

/** Forgets the observed offset. For tests. */
export function resetServerClock(): void {
    serverOffsetMs = undefined;
}
