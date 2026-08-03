import { describe, expect, it } from "vitest";
import { getAddress, hexToBytes, isAddress, keccak256, stringToBytes, stringToHex } from "viem";
import {
    checksumEvmAddress,
    evmHexToBytes,
    evmUtf8ToBytes,
    evmUtf8ToHex,
    isEvmAddress,
    isEvmAddressStrict,
    keccak256Hex,
} from "./evm.js";

// These helpers replace viem imports in the SDK's eager module graph; this
// suite pins behavioral parity against viem itself.

const ADDRESSES = [
    "0x59a4B77766509c4507D79eFF8089474eC3daC174",
    "0xaf93b508ed96b6b7fbf4a7eed5416e8c1ca8d6b6",
    "0xD398B9280091F0D7C500CA0116C8757F5A1A7A29",
    "0x0000000000000000000000000000000000000000",
    "0x00000000219ab540356cbb839cbe05303d7705fa",
];

describe("evm utils parity with viem", () => {
    it("checksumEvmAddress matches viem getAddress", () => {
        for (const a of ADDRESSES) {
            expect(checksumEvmAddress(a)).toBe(getAddress(a));
        }
    });

    it("isEvmAddress matches viem isAddress strict:false", () => {
        const cases = [...ADDRESSES, "0x123", "nope", "0x" + "g".repeat(40), ""];
        for (const a of cases) {
            expect(isEvmAddress(a)).toBe(isAddress(a, { strict: false }));
        }
    });

    it("isEvmAddressStrict matches viem isAddress default mode", () => {
        const wrongChecksum = "0x59a4b77766509C4507D79eFF8089474eC3daC174";
        const cases = [
            ...ADDRESSES,
            wrongChecksum,
            ADDRESSES[0]!.toUpperCase().replace("0X", "0x"),
        ];
        for (const a of cases) {
            expect(isEvmAddressStrict(a)).toBe(isAddress(a));
        }
    });

    it("keccak256Hex(utf8) matches viem keccak256(stringToBytes)", () => {
        for (const s of ["", "polyester", "withdraw:0x1234:42", "идемпотентность🔥"]) {
            expect(keccak256Hex(evmUtf8ToBytes(s))).toBe(keccak256(stringToBytes(s)));
        }
    });

    it("evmUtf8ToHex matches viem stringToHex", () => {
        for (const s of ["", "abc", "Sol4naAddr3ss111111111111111111", "héllo"]) {
            expect(evmUtf8ToHex(s)).toBe(stringToHex(s));
        }
    });

    it("evmHexToBytes matches viem hexToBytes", () => {
        for (const h of ["0x", "0x00", "0xdeadBEEF", "0x" + "ab".repeat(65)]) {
            expect(evmHexToBytes(h)).toEqual(hexToBytes(h as `0x${string}`));
        }
        expect(() => evmHexToBytes("0xabc")).toThrow();
        expect(() => evmHexToBytes("abcd")).toThrow();
    });
});
