// Device clocks drift; server-checked deadlines and expiries use this offset,
// learned from API response `Date` headers. Cross-origin browsers only see the
// header when the API lists `Date` in Access-Control-Expose-Headers.
let serverOffsetMs = 0;

/** Learns the server clock offset from an HTTP `Date` response header. */
export function observeServerDate(value: string | null): void {
    if (!value) return;
    const serverMs = Date.parse(value);
    if (!Number.isNaN(serverMs)) serverOffsetMs = serverMs - Date.now();
}

/** Current time in epoch milliseconds, corrected to the last observed server clock. */
export function serverNowMs(): number {
    return Date.now() + serverOffsetMs;
}
