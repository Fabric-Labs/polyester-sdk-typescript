import type { Timestamp } from "@bufbuild/protobuf/wkt";

export function toTimestamp({ seconds, nanos }: { seconds: bigint; nanos: number }): Timestamp {
    return { seconds, nanos } as Timestamp;
}

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

    if (typeof value !== "object") return null;
    const timestamp = value as Record<string, unknown>;
    const rawSeconds = timestamp.seconds;
    const rawNanos = timestamp.nanos;

    let seconds: number | null = null;
    if (typeof rawSeconds === "bigint") {
        seconds = Number(rawSeconds);
    } else if (typeof rawSeconds === "number") {
        seconds = rawSeconds;
    } else if (typeof rawSeconds === "string" && rawSeconds.trim().length > 0) {
        const parsed = Number(rawSeconds);
        seconds = Number.isFinite(parsed) ? parsed : null;
    }
    if (seconds == null || !Number.isFinite(seconds)) return null;

    const nanos = typeof rawNanos === "number" && Number.isFinite(rawNanos) ? rawNanos : 0;
    return Math.trunc(seconds * 1000 + nanos / 1_000_000);
}
