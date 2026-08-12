import { describe, expect, expectTypeOf, it } from "vitest";
import { realtimeClientStub, unaryTransport } from "../../testing/service-harness.js";
import { AuthService } from "./auth.js";

describe("AuthService", () => {
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
