import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex, hexToBytes as nobleHexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { ConfigurationError } from "../shared/errors.js";

/**
 * Minimal EVM helpers backed by @noble/hashes.
 *
 * The SDK core previously imported these five utilities from viem. Rolldown
 * groups all shared viem modules into a single chunk, so those tiny static
 * imports forced viem's entire abi/actions graph (~270 KB emitted) into the
 * app shell and the server's eager exec path, even though everything heavy is
 * loaded lazily. Semantics mirror the viem calls they replaced:
 * `isAddress(x, { strict: false })`, `getAddress`, `keccak256`,
 * `stringToBytes`, `hexToBytes`.
 */

export type EvmHex = `0x${string}`;

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/** Format-only address check (viem `isAddress(value, { strict: false })`). */
export function isEvmAddress(value: string): value is EvmHex {
    return ADDRESS_RE.test(value);
}

/**
 * viem `isAddress(value)` default-mode parity: format check plus EIP-55
 * checksum validation for any address that is not all-lowercase.
 */
export function isEvmAddressStrict(value: string): value is EvmHex {
    if (!isEvmAddress(value)) return false;
    const body = value.slice(2);
    // viem only exempts all-lowercase addresses from checksum validation.
    if (body === body.toLowerCase()) return true;
    return checksumEvmAddress(value) === value;
}

/** EIP-55 checksummed address (viem `getAddress`); throws on invalid input. */
export function checksumEvmAddress(value: string): EvmHex {
    if (!isEvmAddress(value)) {
        throw new ConfigurationError(`Invalid EVM address: ${value}`);
    }
    const lower = value.slice(2).toLowerCase();
    const hash = keccak_256(utf8ToBytes(lower));
    let out = "0x";
    for (let i = 0; i < 40; i++) {
        const char = lower[i]!;
        // Each hash byte covers two nibbles of the address.
        const nibble = (hash[i >> 1]! >> (i % 2 === 0 ? 4 : 0)) & 0x0f;
        out += nibble >= 8 ? char.toUpperCase() : char;
    }
    return out as EvmHex;
}

/** keccak-256 of raw bytes, hex-encoded (viem `keccak256(bytes)`). */
export function keccak256Hex(bytes: Uint8Array): EvmHex {
    return `0x${bytesToHex(keccak_256(bytes))}`;
}

/** UTF-8 encode (viem `stringToBytes`). */
export function evmUtf8ToBytes(value: string): Uint8Array {
    return utf8ToBytes(value);
}

/** UTF-8 string to 0x-prefixed hex (viem `stringToHex`). */
export function evmUtf8ToHex(value: string): EvmHex {
    return `0x${bytesToHex(utf8ToBytes(value))}`;
}

/** 0x-prefixed hex to bytes (viem `hexToBytes`); throws on malformed input. */
export function evmHexToBytes(value: string): Uint8Array {
    if (!/^0x(?:[0-9a-fA-F]{2})*$/.test(value)) {
        throw new ConfigurationError(`Invalid hex value: ${value}`);
    }
    return nobleHexToBytes(value.slice(2).toLowerCase());
}
