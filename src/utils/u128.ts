// Utility helpers for working with 128-bit unsigned integers encoded as hi/lo.

const U64_BITS = 64n;
const U64_MASK = (1n << U64_BITS) - 1n;
const U128_MAX = (1n << 128n) - 1n;

export type U128Value = {
    hi: bigint;
    lo: bigint;
};

function requireU64(value: bigint, part: "hi" | "lo"): bigint {
    if (value < 0n || value > U64_MASK) {
        throw new RangeError(`U128 ${part} must be between 0 and 2^64 - 1.`);
    }
    return value;
}

/**
 * Convert a {hi, lo} object (or compatible) into a single bigint.
 * @param u - The object to convert to a bigint.
 * @returns The bigint.
 */
export function fromU128(u: U128Value | undefined): bigint {
    if (!u) return 0n;
    const hi = requireU64(u.hi, "hi");
    const lo = requireU64(u.lo, "lo");
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
