import { fc, it } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import { msToTimestamp, timestampToMs, tsNsToTimestamp } from "./timestamp.js";

const nanoseconds = fc.bigInt({ min: -(10n ** 21n), max: 10n ** 21n });

describe("protobuf timestamp conversions", () => {
    it("converts seconds and nanos without floating-point millisecond drift", () => {
        expect(timestampToMs({ seconds: 1_700_000_000n, nanos: 999_999_999 })).toBe(
            1_700_000_000_999,
        );
    });

    it("normalizes negative epoch nanoseconds into a valid Timestamp", () => {
        expect(tsNsToTimestamp(-1n)).toEqual({ seconds: -1n, nanos: 999_999_999 });
    });

    it("rejects malformed Timestamp parts", () => {
        expect(timestampToMs({ seconds: "1e2", nanos: 0 })).toBeNull();
        expect(timestampToMs({ seconds: 1n, nanos: -1 })).toBeNull();
        expect(timestampToMs({ seconds: 1n, nanos: 1_000_000_000 })).toBeNull();
    });

    it.prop([nanoseconds])(
        "preserves the instant and reports safe milliseconds toward zero",
        (tsNs) => {
            const timestamp = tsNsToTimestamp(tsNs);
            expect(timestamp).toBeDefined();
            if (!timestamp) return;
            expect(timestamp.nanos).toBeGreaterThanOrEqual(0);
            expect(timestamp.nanos).toBeLessThan(1_000_000_000);
            expect(timestamp.seconds * 1_000_000_000n + BigInt(timestamp.nanos)).toBe(tsNs);

            const milliseconds = tsNs / 1_000_000n;
            const ms = timestampToMs(timestamp);
            if (
                milliseconds < BigInt(Number.MIN_SAFE_INTEGER) ||
                milliseconds > BigInt(Number.MAX_SAFE_INTEGER)
            ) {
                expect(ms).toBeNull();
                return;
            }
            expect(ms).toBe(Number(milliseconds));
        },
    );

    it.prop([fc.maxSafeInteger()])("round-trips integer milliseconds", (ms) => {
        expect(timestampToMs(msToTimestamp(ms))).toBe(ms);
    });
});
