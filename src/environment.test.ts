import { describe, expect, it } from "vitest";
import { createPolyesterEnvironment, POLYESTER_TESTNET_ENVIRONMENT } from "./environment.js";
import { ConfigurationError } from "./shared/errors.js";

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
    it.each([null, undefined])("rejects a missing configuration object", (params) => {
        expect(() => createPolyesterEnvironment(params as never)).toThrow(ConfigurationError);
        expect(() => createPolyesterEnvironment(params as never)).toThrow(
            "Environment configuration must be an object.",
        );
    });

    it("rejects an empty environment name", () => {
        expect(() => createPolyesterEnvironment({ ...baseParams, name: "" })).toThrow(
            "name must be a non-empty string.",
        );
    });

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

    it("allows insecure IPv6 loopback URLs", () => {
        const environment = createPolyesterEnvironment({
            ...baseParams,
            apiUrl: "http://[::1]:3000/",
            websocketUrl: "ws://[::1]:3001/",
        });

        expect(environment.apiUrl).toBe("http://[::1]:3000");
        expect(environment.websocketUrl).toBe("ws://[::1]:3001");
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
