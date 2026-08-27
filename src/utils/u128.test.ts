import { describe, expect, it } from "vitest";
import { fromU128, toU128 } from "./u128.js";

describe("u128 conversions", () => {
    it.each([0n, 1n, 1n << 64n, (1n << 128n) - 1n])("round-trips %s", (value) => {
        expect(fromU128(toU128(value))).toBe(value);
    });

    it("rejects signed and overflowing wire parts", () => {
        expect(() => fromU128({ hi: -1n, lo: 0n })).toThrow(RangeError);
        expect(() => fromU128({ hi: 0n, lo: 1n << 64n })).toThrow(RangeError);
    });
});
