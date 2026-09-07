import { describe, expect, expectTypeOf, it } from "vitest";
import {
    realtimeClientStub,
    unaryTransport,
    unaryTransportSequence,
} from "../../testing/service-harness.js";
import { formatId } from "../../utils/base58-id.js";
import { AuthService } from "./auth.js";

describe("AuthService", () => {
    it("accepts terms explicitly through the auth transport and recovers after failure", async () => {
        const failure = new Error("temporary failure");
        const transport = unaryTransport((_call, index) => {
            if (index === 0) throw failure;
            return {};
        });
        const publicTransport = unaryTransport({});
        const service = new AuthService(
            { publicApi: publicTransport.transport, authApi: transport.transport },
            realtimeClientStub().realtime,
        );
        const signal = new AbortController().signal;

        expect(transport.calls).toHaveLength(0);
        await expect(service.acceptTerms()).rejects.toBe(failure);
        await expect(service.acceptTerms({ signal })).resolves.toBeUndefined();
        await expect(service.acceptTerms()).resolves.toBeUndefined();
        expect(transport.calls).toHaveLength(3);
        expect(transport.calls[1]).toMatchObject({
            method: { localName: "acceptTerms" },
            message: {},
            signal,
        });
        expect(publicTransport.calls).toHaveLength(0);
    });

    it("returns the stable public API key ID from caller introspection", async () => {
        const transport = unaryTransportSequence([
            {
                accountId: 1n,
                apiKeyId: "ak_0123456789abcdef0123456789abcdef",
                username: "alice",
            },
            { accountId: 1n, username: "alice" },
        ]);
        const service = new AuthService(
            { publicApi: transport.transport, authApi: transport.transport },
            realtimeClientStub().realtime,
        );

        await expect(service.me()).resolves.toEqual({
            accountId: formatId(1n),
            apiKeyId: "ak_0123456789abcdef0123456789abcdef",
            username: "alice",
        });
        await expect(service.me()).resolves.toEqual({
            accountId: formatId(1n),
            username: "alice",
        });
    });

    it("returns a JSON-safe epoch-millisecond nonce expiry", async () => {
        const transport = unaryTransport({
            nonce: "nonce-1",
            expiresAt: { seconds: 1_785_940_604n, nanos: 369_342_000 },
        });
        const service = new AuthService(
            { publicApi: transport.transport, authApi: transport.transport },
            realtimeClientStub().realtime,
        );

        const nonce = await service.requestLoginNonce("0x1234");

        expect(nonce).toEqual({ nonce: "nonce-1", expiresAt: 1_785_940_604_369 });
        expectTypeOf(nonce.expiresAt).toEqualTypeOf<number | undefined>();
        expect(new Date(nonce.expiresAt ?? NaN).getTime()).toBe(1_785_940_604_369);
        expect(JSON.stringify(nonce)).toBe('{"nonce":"nonce-1","expiresAt":1785940604369}');
    });
});
