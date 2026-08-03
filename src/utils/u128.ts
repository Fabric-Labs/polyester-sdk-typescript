// Utility helpers for working with 128-bit unsigned integers encoded as hi/lo.

const U64_BITS = 64n;
const U64_MASK = (1n << U64_BITS) - 1n;
const U128_MAX = (1n << 128n) - 1n;

export type U128Value = {
    hi: bigint;
    lo: bigint;
};

/**
 * Convert a value to a bigint.
 * @param v - The value to convert to a bigint.
 * @returns The bigint.
 */
export function toBig(v: unknown): bigint {
    if (v === undefined || v === null) return 0n;
    if (typeof v === "bigint") return v;
    if (typeof v === "number") return BigInt(v);
    if (typeof v === "string" && v.length > 0) {
        try {
            return BigInt(v);
        } catch {
            return 0n;
        }
    }
    return 0n;
}

/**
 * Convert a {hi, lo} object (or compatible) into a single bigint.
 * @param u - The object to convert to a bigint.
 * @returns The bigint.
 */
export function fromU128(u: U128Value | undefined): bigint {
    if (!u) return 0n;
    const hi = toBig(u.hi);
    const lo = toBig(u.lo);
    return (hi << U64_BITS) + lo;
}

/** Convert a non-negative bigint into the protobuf U128 hi/lo representation. */
export function toU128(value: bigint): U128Value {
    if (value < 0n || value > U128_MAX) {
        throw new RangeError("U128 value must be between 0 and 2^128 - 1.");
    }
    return {
        hi: value >> U64_BITS,
        lo: value & U64_MASK,
    };
}

/**
 * Convert a bigint and scale into a decimal string.
 * @param value - The value to convert to a decimal string.
 * @param scale - The scale to convert the value to.
 * @returns The decimal string.
 */
export function u128ToDecimal(value: bigint, scale: number): string {
    if (scale <= 0) return value.toString();
    const base = 10n ** BigInt(scale);
    const i = value / base;
    const f = value % base;
    return `${i}.${f.toString().padStart(scale, "0")}`;
}
