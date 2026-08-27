import { describe, expect, it } from "vitest";
import { timestampToMs, tsNsToTimestamp } from "./timestamp.js";

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
});
