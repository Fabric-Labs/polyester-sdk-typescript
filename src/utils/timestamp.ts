import type { Timestamp } from "@bufbuild/protobuf/wkt";

/**
 * Creates a proto Timestamp from seconds and nanos parts.
 */
export function toTimestamp({ seconds, nanos }: { seconds: bigint; nanos: number }): Timestamp {
    return { seconds, nanos } as Timestamp;
}

/**
 * Converts epoch nanoseconds to a proto Timestamp.
 */
export function tsNsToTimestamp(tsNs: bigint | undefined): Timestamp | undefined {
    if (tsNs === undefined) return undefined;

    let seconds = tsNs / 1_000_000_000n;
    let nanos = tsNs % 1_000_000_000n;
    if (nanos < 0n) {
        seconds -= 1n;
        nanos += 1_000_000_000n;
    }

    return toTimestamp({
        seconds,
        nanos: Number(nanos),
    });
}

function timestampSeconds(value: unknown): bigint | null {
    if (typeof value === "bigint") return value;
    if (typeof value === "number") {
        return Number.isSafeInteger(value) ? BigInt(value) : null;
    }
    if (typeof value !== "string") return null;

    const trimmed = value.trim();
    return /^-?\d+$/.test(trimmed) ? BigInt(trimmed) : null;
}

function timestampNanos(value: unknown): bigint | null {
    if (value === undefined) return 0n;
    if (
        typeof value !== "number" ||
        !Number.isInteger(value) ||
        value < 0 ||
        value >= 1_000_000_000
    ) {
        return null;
    }
    return BigInt(value);
}

/**
 * Converts supported timestamp-like values to epoch milliseconds.
 */
export function timestampToMs(value: unknown): number | null {
    if (value == null) return null;

    if (value instanceof Date) {
        const ms = value.getTime();
        return Number.isFinite(ms) ? ms : null;
    }

    if (typeof value === "string") {
        const ms = Date.parse(value);
        return Number.isFinite(ms) ? ms : null;
    }

    if (typeof value !== "object" || !("seconds" in value)) return null;

    const seconds = timestampSeconds(value.seconds);
    const nanos = timestampNanos("nanos" in value ? value.nanos : undefined);
    if (seconds === null || nanos === null) return null;

    const milliseconds = (seconds * 1_000_000_000n + nanos) / 1_000_000n;
    const output = Number(milliseconds);
    return Number.isSafeInteger(output) ? output : null;
}
