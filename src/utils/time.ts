// Time helpers for gRPC/Connect models.

/**
 * Convert epoch nanoseconds (bigint or number) to ISO8601 string for display.
 * @param ts - The timestamp to convert to ISO8601 string.
 * @returns The ISO8601 string.
 */
export function tsNsToISO(ts: bigint | number | undefined): string {
    if (ts === undefined || ts === null) return "";
    if (typeof ts === "bigint") {
        // Convert ns -> ms for JS Date; risk of overflow is acceptable for display
        try {
            return new Date(Number(ts / 1000000n)).toISOString();
        } catch {
            return ts.toString();
        }
    }
    if (typeof ts === "number") {
        // If value looks like ns, downscale to ms
        const ms = ts > 1e12 ? Math.floor(ts / 1e6) : ts;
        return new Date(ms).toISOString();
    }
    return "";
}

/**
 * Convert epoch nanoseconds (bigint or number) to milliseconds since epoch.
 * @param ts - The timestamp to convert to milliseconds since epoch.
 * @returns The milliseconds since epoch.
 */
export function tsNsToMs(ts: bigint | number | undefined): number {
    if (ts === undefined || ts === null) return 0;
    if (typeof ts === "bigint") return Number(ts / 1000000n);
    if (typeof ts === "number") {
        // Treat as ns for consistency with tsNsToISO.
        return Math.floor(ts / 1e6);
    }
    return 0;
}

/**
 * Convert epoch nanoseconds (bigint or number) to whole seconds since epoch.
 * @param ts - The timestamp to convert to seconds since epoch.
 * @returns The seconds since epoch.
 */
export function tsNsToSeconds(ts: bigint | number | undefined): number {
    if (ts === undefined || ts === null) return 0;
    if (typeof ts === "bigint") return Number(ts / 1_000_000_000n);
    if (typeof ts === "number") {
        // Treat as ns for consistency with tsNsToISO.
        return Math.floor(ts / 1e9);
    }
    return 0;
}

/**
 * Converts a proto timestamp object to epoch milliseconds.
 */
export function tsObjToMs(ts?: { seconds?: bigint; nanos?: number }): number | undefined {
    if (ts === undefined) return undefined;
    if (ts.seconds === undefined) return undefined;
    const nanos = ts.nanos ?? 0;
    return Number(ts.seconds) * 1000 + Math.floor(nanos / 1_000_000);
}

/**
 * Normalize a timestamp to milliseconds since epoch.
 * @param input - The timestamp to normalize.
 * @returns The normalized timestamp in milliseconds since epoch.
 */
export function normalizeToMillis(input: number): number {
    if (!Number.isFinite(input)) return Date.now();
    // Heuristics: ns -> /1e6, µs -> /1e3, ms -> as-is
    if (input > 1e16) return Math.floor(input / 1e6);
    if (input > 1e13) return Math.floor(input / 1e3);
    return Math.floor(input);
}
