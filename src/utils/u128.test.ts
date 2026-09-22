import { fc, it } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import { fromU128, toU128 } from "./u128.js";

const U64_MAX = (1n << 64n) - 1n;
const U128_MAX = (1n << 128n) - 1n;
const u64 = fc.bigInt({ min: 0n, max: U64_MAX });
const outOfU64 = fc.oneof(
    fc.bigInt({ min: U64_MAX + 1n, max: 1n << 80n }),
    fc.bigInt({ min: -(1n << 64n), max: -1n }),
);

describe("u128 conversions", () => {
    it.each([0n, 1n, 1n << 64n, (1n << 128n) - 1n])("round-trips %s", (value) => {
        expect(fromU128(toU128(value))).toBe(value);
    });

    it("rejects signed and overflowing wire parts", () => {
        expect(() => fromU128({ hi: -1n, lo: 0n })).toThrow(RangeError);
        expect(() => fromU128({ hi: 0n, lo: 1n << 64n })).toThrow(RangeError);
    });

    it.prop([fc.bigInt({ min: 0n, max: U128_MAX })])(
        "round-trips every value through uint64 limbs",
        (value) => {
            const parts = toU128(value);
            expect(parts.hi >= 0n && parts.hi <= U64_MAX).toBe(true);
            expect(parts.lo >= 0n && parts.lo <= U64_MAX).toBe(true);
            expect(fromU128(parts)).toBe(value);
        },
    );

    it.prop([outOfU64, u64])("rejects an out-of-range hi limb", (hi, lo) => {
        expect(() => fromU128({ hi, lo })).toThrow(RangeError);
    });

    it.prop([u64, outOfU64])("rejects an out-of-range lo limb", (hi, lo) => {
        expect(() => fromU128({ hi, lo })).toThrow(RangeError);
    });

    it.prop([fc.bigInt({ min: -(1n << 160n), max: -1n })])("rejects a negative value", (value) => {
        expect(() => toU128(value)).toThrow(RangeError);
    });

    it.prop([fc.bigInt({ min: U128_MAX + 1n, max: 1n << 160n })])(
        "rejects a value above 2^128 - 1",
        (value) => {
            expect(() => toU128(value)).toThrow(RangeError);
        },
    );
});
