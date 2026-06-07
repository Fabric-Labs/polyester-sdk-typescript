import { describe, expect, it } from "vitest";
import { createPolyesterEnvironment, POLYESTER_TESTNET_ENVIRONMENT } from "./environment.js";

const baseParams = {
    name: "custom",
    apiUrl: "https://api.example.test/",
    websocketUrl: "wss://api.example.test/",
    rpcUrl: "https://rpc.example.test/",
    chain: {
        ...POLYESTER_TESTNET_ENVIRONMENT.chain,
        id: 999_001,
        name: "Custom Polyester",
    },
    accountAbstraction: POLYESTER_TESTNET_ENVIRONMENT.accountAbstraction,
    contracts: POLYESTER_TESTNET_ENVIRONMENT.contracts,
};

describe("createPolyesterEnvironment", () => {
    it("normalizes URLs and creates a stable fingerprint", () => {
        const environment = createPolyesterEnvironment(baseParams);
        const sameEnvironment = createPolyesterEnvironment(baseParams);

        expect(environment.apiUrl).toBe("https://api.example.test");
        expect(environment.websocketUrl).toBe("wss://api.example.test");
        expect(environment.rpcUrl).toBe("https://rpc.example.test");
        expect(environment.chain.rpcUrls.default.http).toEqual(["https://rpc.example.test"]);
        expect(environment.fingerprint).toBe(sameEnvironment.fingerprint);
    });

    it("changes fingerprint when signing-critical inputs change", () => {
        const first = createPolyesterEnvironment(baseParams);
        const second = createPolyesterEnvironment({
            ...baseParams,
            contracts: {
                tradingGatewayAddress: "0x3333333333333333333333333333333333333333",
            },
        });

        expect(first.fingerprint).not.toBe(second.fingerprint);
    });

    it("rejects insecure remote URLs", () => {
        expect(() =>
            createPolyesterEnvironment({
                ...baseParams,
                apiUrl: "http://api.example.test",
            }),
        ).toThrow("apiUrl must use a secure protocol for remote hosts.");
    });

    it("rejects invalid addresses", () => {
        expect(() =>
            createPolyesterEnvironment({
                ...baseParams,
                contracts: {
                    tradingGatewayAddress: "not-an-address" as `0x${string}`,
                },
            }),
        ).toThrow("contracts.tradingGatewayAddress must be a valid address.");
    });
});
