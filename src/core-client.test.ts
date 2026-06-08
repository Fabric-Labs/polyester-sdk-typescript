import { afterEach, describe, expect, it, vi } from "vitest";
import { signAsync } from "@noble/ed25519";
import { POLYESTER_TESTNET_ENVIRONMENT } from "./environment.js";

type RealtimeAuthRequest = {
    url: string | URL;
    method: string;
};

type CapturedRealtimeConfig = {
    wsUrl: string;
    tokenEndpoint: string;
    subscribeEndpoint: string;
    getAuthHeaders?: (request: RealtimeAuthRequest) => Promise<HeadersInit> | HeadersInit;
    hasAuth?: () => boolean;
};

const { realtimeConfigs } = vi.hoisted(() => ({
    realtimeConfigs: [] as CapturedRealtimeConfig[],
}));

vi.mock("./realtime/index.js", () => ({
    RealtimeClient: class MockRealtimeClient {
        constructor(config: CapturedRealtimeConfig) {
            realtimeConfigs.push(config);
        }
    },
}));

import { PolyesterClient } from "./core-client.js";

function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

describe("PolyesterClient realtime auth", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        realtimeConfigs.length = 0;
    });

    it("uses API-key auth headers for realtime token requests", async () => {
        vi.spyOn(Date, "now").mockReturnValue(1234567890);
        const secretKey = Uint8Array.from({ length: 32 }, (_, i) => i + 1);

        new PolyesterClient({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
            refreshCatalogs: false,
            auth: {
                kind: "api-key-ed25519",
                getKeyId: () => "ak_test",
                getSecretKey: () => secretKey,
            },
        });

        const config = realtimeConfigs[0];
        if (!config?.getAuthHeaders) throw new Error("Expected realtime auth headers");

        const headers = await config.getAuthHeaders({
            url: `${POLYESTER_TESTNET_ENVIRONMENT.apiUrl}/v1/rt/subscribe?channel=private:spot:orders:acct-1:proto`,
            method: "GET",
        });
        const emptyHash = await crypto.subtle.digest("SHA-256", new Uint8Array(0));
        const canonical = `1234567890\nGET\n/v1/rt/subscribe\nchannel=private%3Aspot%3Aorders%3Aacct-1%3Aproto\n${bytesToHex(
            new Uint8Array(emptyHash),
        )}`;
        const expectedSignature = bytesToHex(
            await signAsync(new TextEncoder().encode(canonical), secretKey),
        );

        expect(config.hasAuth?.()).toBe(true);
        expect(headers).toEqual({
            "X-API-KEY-ID": "ak_test",
            "X-API-TIMESTAMP": "1234567890",
            "X-API-SIGNATURE": expectedSignature,
        });
    });
});
