import { afterEach, describe, expect, it, vi } from "vitest";
import { getJwtExpiration, isJwtValid } from "./jwt.js";

const textEncoder = new TextEncoder();

function base64UrlEncode(value: string): string {
    const bytes = textEncoder.encode(value);
    let binary = "";

    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }

    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function jwtWithPayload(payload: Record<string, unknown>): string {
    return [
        base64UrlEncode(JSON.stringify({ alg: "none", typ: "JWT" })),
        base64UrlEncode(JSON.stringify(payload)),
        "signature",
    ].join(".");
}

function jwtWithUrlAlphabetPayload(exp: number): string {
    for (const subject of ["\uFFFF", "\u{10FFFF}", "\uFFFF\uFFFF"]) {
        const rawPayload = base64UrlEncode(JSON.stringify({ exp, subject }));
        if (rawPayload.includes("-") || rawPayload.includes("_")) {
            return [
                base64UrlEncode(JSON.stringify({ alg: "none", typ: "JWT" })),
                rawPayload,
                "signature",
            ].join(".");
        }
    }

    throw new Error("expected payload fixture to contain base64url characters");
}

afterEach(() => {
    vi.useRealTimers();
});

describe("getJwtExpiration", () => {
    it("parses unpadded base64url payloads", () => {
        const exp = 2_000_000_000;
        const token = jwtWithPayload({ exp });
        const [, rawPayload] = token.split(".");

        expect(rawPayload?.endsWith("=")).toBe(false);
        expect(getJwtExpiration(token)).toBe(exp);
    });

    it("parses payloads that use the URL-safe base64 alphabet", () => {
        const exp = 2_000_000_000;
        const token = jwtWithUrlAlphabetPayload(exp);
        const [, rawPayload] = token.split(".");

        expect(rawPayload).toMatch(/[-_]/u);
        expect(getJwtExpiration(token)).toBe(exp);
    });

    it("returns null for malformed payloads", () => {
        expect(getJwtExpiration("header.a.signature")).toBeNull();
        expect(getJwtExpiration(jwtWithPayload({ sub: "missing-exp" }))).toBeNull();
        expect(
            getJwtExpiration(["header", base64UrlEncode("{"), "signature"].join(".")),
        ).toBeNull();
    });

    it("returns null for non-finite expiration values", () => {
        const token = ["header", base64UrlEncode('{"exp":1e400}'), "signature"].join(".");

        expect(getJwtExpiration(token)).toBeNull();
    });
});

describe("isJwtValid", () => {
    it("accepts future base64url JWTs and rejects expired ones", () => {
        const nowSeconds = Math.floor(Date.now() / 1000);

        expect(isJwtValid(jwtWithPayload({ exp: nowSeconds + 3600 }))).toBe(true);
        expect(isJwtValid(jwtWithPayload({ exp: nowSeconds - 3600 }))).toBe(false);
    });

    it("returns false for malformed and non-string values", () => {
        const invalidValues: unknown[] = [
            "not a jwt",
            null,
            undefined,
            42,
            {
                name: "polyester_auth_token",
                value: jwtWithPayload({ exp: Math.floor(Date.now() / 1000) + 3600 }),
            },
        ];

        for (const value of invalidValues) {
            expect(isJwtValid(value)).toBe(false);
        }
    });

    it("expires a JWT at the start of its expiration second", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-01-01T00:00:00.500Z"));
        const exp = Date.parse("2026-01-01T00:00:00.000Z") / 1000;

        expect(isJwtValid(jwtWithPayload({ exp }))).toBe(false);
    });
});
