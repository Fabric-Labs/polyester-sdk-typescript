// Utility helpers for working with 128-bit unsigned integers encoded as hi/lo.

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
export function fromU128(u: { hi: bigint; lo: bigint } | undefined): bigint {
    if (!u) return 0n;
    const hi = toBig(u.hi);
    const lo = toBig(u.lo);
    return (hi << 64n) + lo;
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
