import { ValidationError } from "../shared/errors.js";

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz" as const;
const BASE58_MAP: Record<string, number> = (() => {
    const m: Record<string, number> = {};
    for (let i = 0; i < BASE58_ALPHABET.length; i++) {
        m[BASE58_ALPHABET[i]!] = i;
    }
    return m;
})();

const U64_MAX = (1n << 64n) - 1n;

export type IdInput = bigint | number | string;

function assertU64(x: bigint, label: string): bigint {
    if (x < 0n) throw new ValidationError(`${label}: must be >= 0`);
    if (x > U64_MAX) throw new ValidationError(`${label}: must be <= 2^64-1`);
    return x;
}

/**
 * Convert a base58 encoded ID to a bigint.
 * @param input - The base58 encoded ID.
 * @param label - The label for the input.
 * @returns The bigint ID.
 */
export function idToBigInt(input: IdInput, label = "id"): bigint {
    if (typeof input === "bigint") return assertU64(input, label);
    if (typeof input === "number") {
        if (!Number.isFinite(input) || input < 0 || !Number.isInteger(input)) {
            throw new ValidationError(`${label}: invalid number`);
        }
        return assertU64(BigInt(input), label);
    }

    const raw = input.trim();
    if (!raw) throw new ValidationError(`${label}: empty`);

    // Heuristic: base58 strings are non-numeric and/or contain letters.
    // If it's purely digits, treat as decimal uint64 (useful for debugging/tools).
    if (/^\d+$/.test(raw)) return assertU64(BigInt(raw), label);

    return idParse(raw);
}

function idToFixed64Bytes(input: IdInput): Uint8Array {
    const out = new Uint8Array(8);
    new DataView(out.buffer).setBigUint64(0, idToBigInt(input));
    return out;
}

function bytesToBigintBE(bytes: Uint8Array): bigint {
    return new DataView(bytes.buffer, bytes.byteOffset).getBigUint64(0);
}

function base58Encode(bytes: Uint8Array): string {
    if (bytes.length === 0) return "";

    let zeros = 0;
    while (zeros < bytes.length && bytes[zeros] === 0) zeros++;

    // Convert base256 -> base58 (classic Bitcoin algorithm)
    const digits: number[] = [];
    for (let i = zeros; i < bytes.length; i++) {
        let carry = bytes[i]!;
        for (let j = 0; j < digits.length; j++) {
            const x = digits[j]! * 256 + carry;
            digits[j] = x % 58;
            carry = Math.floor(x / 58);
        }
        while (carry > 0) {
            digits.push(carry % 58);
            carry = Math.floor(carry / 58);
        }
    }

    let out = "1".repeat(zeros);
    for (let i = digits.length - 1; i >= 0; i--) {
        out += BASE58_ALPHABET[digits[i]!]!;
    }
    return out ?? "1";
}

function base58Decode(s: string): Uint8Array {
    const raw = s.trim();
    if (!raw) return new Uint8Array();

    let zeros = 0;
    while (zeros < raw.length && raw[zeros] === "1") zeros++;

    const bytes: number[] = [];
    for (let i = zeros; i < raw.length; i++) {
        const ch = raw[i]!;
        const val = BASE58_MAP[ch];
        if (val === undefined) {
            throw new ValidationError(`idParse: invalid base58 character "${ch}"`);
        }
        let carry = val;
        for (let j = 0; j < bytes.length; j++) {
            const x = bytes[j]! * 58 + carry;
            bytes[j] = x & 0xff;
            carry = x >> 8;
        }
        while (carry > 0) {
            bytes.push(carry & 0xff);
            carry >>= 8;
        }
    }

    // bytes currently little-endian base256; reverse and add leading zeros
    const out = new Uint8Array(zeros + bytes.length);
    for (let i = 0; i < zeros; i++) out[i] = 0;
    for (let i = 0; i < bytes.length; i++) out[out.length - 1 - i] = bytes[i]!;
    return out;
}

/**
 * Given a fixed64 ID, format it as a base58 encoded string.
 * @param input - The base58 encoded ID.
 * @returns The base58 encoded ID.
 */
export function formatId(input: IdInput): string {
    // Encode fixed64 ID as base58 (big-endian, no left-padding).
    // This avoids confusing leading "1"s for small values.
    const fixed = idToFixed64Bytes(input);
    let firstNonZero = 0;
    while (firstNonZero < fixed.length && fixed[firstNonZero] === 0) firstNonZero++;
    const bytes = firstNonZero >= fixed.length ? new Uint8Array([0]) : fixed.slice(firstNonZero);
    return base58Encode(bytes);
}

function idParse(s: string): bigint {
    const raw = s.trim();
    if (!raw) throw new ValidationError("idParse: empty");
    const bytes = base58Decode(raw);
    if (bytes.length > 8) throw new ValidationError("idParse: too large");
    const padded = new Uint8Array(8);
    padded.set(bytes, 8 - bytes.length);
    return assertU64(bytesToBigintBE(padded), "idParse");
}
