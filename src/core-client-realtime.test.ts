import { describe, expect, it, vi } from "vitest";
import { PolyesterClient } from "./core-client.js";
import { POLYESTER_TESTNET_ENVIRONMENT } from "./environment.js";
import { AuthenticationError } from "./shared/errors.js";

describe("PolyesterClient realtime authentication", () => {
    it("rejects a private subscription when a synchronous JWT provider returns null", () => {
        const getToken = vi.fn(() => null);
        const client = new PolyesterClient({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
            auth: { kind: "jwt", getToken },
        });

        expect(() =>
            client.realtime.subscribe("private:test", {
                onPublication: () => {},
            }),
        ).toThrow(AuthenticationError);
        expect(getToken).toHaveBeenCalledOnce();
        expect(client.realtime.activeChannels).toBe(0);
        expect(client.realtime.totalConsumers).toBe(0);
    });
});
