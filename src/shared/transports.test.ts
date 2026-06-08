import { afterEach, describe, expect, it, vi } from "vitest";
import { signAsync } from "@noble/ed25519";
import { isRetryableError } from "../utils/errors.js";
import {
    createApiKeyEd25519AuthHeaders,
    isAbortError,
    makeFetch,
    TransportError,
} from "./transports.js";

function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

describe("makeFetch", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("rethrows abort errors unchanged", async () => {
        const abortError = new DOMException("Request aborted", "AbortError");
        vi.spyOn(globalThis, "fetch").mockRejectedValue(abortError);

        await expect(makeFetch()("https://api.test")).rejects.toBe(abortError);
        expect(isAbortError(abortError)).toBe(true);
    });

    it("wraps transport failures with the original cause", async () => {
        const cause = new TypeError("Failed to fetch");
        vi.spyOn(globalThis, "fetch").mockRejectedValue(cause);

        await expect(makeFetch()("https://api.test")).rejects.toMatchObject({
            name: "TransportError",
            message: "Transport request failed",
            cause,
        });
    });

    it("passes through real HTTP 500 responses", async () => {
        const response = new Response("Backend failed", { status: 500 });
        vi.spyOn(globalThis, "fetch").mockResolvedValue(response);

        await expect(makeFetch()("https://api.test")).resolves.toBe(response);
    });
});

describe("createApiKeyEd25519AuthHeaders", () => {
    it("signs the canonical request with API-key credentials", async () => {
        const secretKey = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
        const body = new TextEncoder().encode("body");
        const hash = await crypto.subtle.digest("SHA-256", body.slice());
        const bodyHash = bytesToHex(new Uint8Array(hash));
        const canonical = `1234567890\nGET\n/v1/rt/subscribe\na=1&b=2&channel=private%3Atest\n${bodyHash}`;
        const expectedSignature = bytesToHex(
            await signAsync(new TextEncoder().encode(canonical), secretKey),
        );

        const headers = await createApiKeyEd25519AuthHeaders(
            {
                kind: "api-key-ed25519",
                getKeyId: () => "ak_test",
                getSecretKey: () => secretKey,
            },
            {
                url: "https://api.example.test/v1/rt/subscribe?b=2&channel=private:test&a=1",
                method: "GET",
                body,
                timestamp: "1234567890",
            },
        );

        expect(headers).toEqual({
            "X-API-KEY-ID": "ak_test",
            "X-API-TIMESTAMP": "1234567890",
            "X-API-SIGNATURE": expectedSignature,
        });
    });

    it("rejects missing API-key credentials", async () => {
        await expect(
            createApiKeyEd25519AuthHeaders(
                {
                    kind: "api-key-ed25519",
                    getKeyId: () => null,
                    getSecretKey: () => null,
                },
                { url: "https://api.example.test/v1/rt/token", method: "GET" },
            ),
        ).rejects.toThrow("Missing API key ID or secret key");
    });
});

describe("isRetryableError", () => {
    it("does not retry abort errors", () => {
        const abortError = new DOMException("Request aborted", "AbortError");

        expect(isRetryableError(abortError)).toBe(false);
    });

    it("retries transport errors", () => {
        const err = new TransportError("Transport request failed", {
            cause: new TypeError("Failed to fetch"),
        });

        expect(isRetryableError(err)).toBe(true);
    });
});
