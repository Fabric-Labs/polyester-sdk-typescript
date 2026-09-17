import { describe, expect, it } from "vitest";
import {
    createPolyesterEnvironment,
    parsePolyesterEnvironment,
    POLYESTER_DEVNET_ENVIRONMENT,
    POLYESTER_TESTNET_ENVIRONMENT,
} from "./environment.js";
import { ConfigurationError } from "./shared/errors.js";
import { evmUtf8ToBytes, keccak256Hex } from "./utils/evm.js";

const baseParams = {
    name: "custom",
    apiUrl: "https://api.example.test/",
    websocketUrl: "wss://api.example.test/",
    rpcUrl: "https://rpc.example.test/",
    chain: {
        ...POLYESTER_DEVNET_ENVIRONMENT.chain,
        id: 999_001,
        name: "Custom Polyester",
    },
    accountAbstraction: POLYESTER_DEVNET_ENVIRONMENT.accountAbstraction,
    contracts: POLYESTER_DEVNET_ENVIRONMENT.contracts,
};

function legacyFingerprint(environment: ReturnType<typeof createPolyesterEnvironment>) {
    return keccak256Hex(
        evmUtf8ToBytes(
            JSON.stringify({
                apiUrl: environment.apiUrl,
                websocketUrl: environment.websocketUrl,
                rpcUrl: environment.rpcUrl,
                chainId: environment.chain.id,
                bundlerUrl: environment.accountAbstraction.bundlerUrl,
                paymasterUrl: environment.accountAbstraction.paymasterUrl,
                entryPoint: environment.accountAbstraction.entryPoint,
                safe: environment.accountAbstraction.safe,
                contracts: environment.contracts,
            }),
        ),
    );
}

describe("POLYESTER_DEVNET_ENVIRONMENT", () => {
    it("identifies the bundled preset as Polyester devnet", () => {
        expect(POLYESTER_DEVNET_ENVIRONMENT.name).toBe("polyester-devnet");
        expect(POLYESTER_DEVNET_ENVIRONMENT.apiUrl).toBe("https://api.devnet.polyester.com");
        expect(POLYESTER_DEVNET_ENVIRONMENT.websocketUrl).toBe("wss://api.devnet.polyester.com");
        expect(POLYESTER_DEVNET_ENVIRONMENT.chain.name).toBe("Polyester Chain Devnet");
    });
});

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

    it("rejects an incomplete nested chain with an SDK configuration error", () => {
        expect(() =>
            createPolyesterEnvironment({
                ...baseParams,
                chain: { id: 999_001 },
            } as never),
        ).toThrow(ConfigurationError);
        expect(() =>
            createPolyesterEnvironment({
                ...baseParams,
                chain: { id: 999_001 },
            } as never),
        ).toThrow("chain.name must be a non-empty string.");
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

    it("does not bind identity to API or WebSocket gateway URLs", () => {
        const globalGateway = createPolyesterEnvironment(baseParams);
        const regionalApiGateway = createPolyesterEnvironment({
            ...baseParams,
            apiUrl: "https://iad.api.example.test",
        });
        const regionalWebSocketGateway = createPolyesterEnvironment({
            ...baseParams,
            websocketUrl: "wss://iad.api.example.test",
        });

        expect(regionalApiGateway.fingerprint).toBe(globalGateway.fingerprint);
        expect(regionalWebSocketGateway.fingerprint).toBe(globalGateway.fingerprint);
    });

    it("binds identity to RPC, chain, account abstraction, and contracts", () => {
        const environment = createPolyesterEnvironment(baseParams);

        expect(
            createPolyesterEnvironment({ ...baseParams, rpcUrl: "https://rpc-2.example.test" })
                .fingerprint,
        ).not.toBe(environment.fingerprint);
        expect(
            createPolyesterEnvironment({
                ...baseParams,
                chain: { ...baseParams.chain, id: baseParams.chain.id + 1 },
            }).fingerprint,
        ).not.toBe(environment.fingerprint);
        expect(
            createPolyesterEnvironment({
                ...baseParams,
                accountAbstraction: {
                    ...baseParams.accountAbstraction,
                    bundlerUrl: "https://bundler-2.example.test",
                },
            }).fingerprint,
        ).not.toBe(environment.fingerprint);
        expect(
            createPolyesterEnvironment({
                ...baseParams,
                contracts: {
                    tradingGatewayAddress: "0x3333333333333333333333333333333333333333",
                },
            }).fingerprint,
        ).not.toBe(environment.fingerprint);
    });

    it("keeps bundled network presets distinct", () => {
        expect(POLYESTER_DEVNET_ENVIRONMENT.fingerprint).not.toBe(
            POLYESTER_TESTNET_ENVIRONMENT.fingerprint,
        );
    });

    it("rejects insecure remote URLs", () => {
        expect(() =>
            createPolyesterEnvironment({
                ...baseParams,
                apiUrl: "http://api.example.test",
            }),
        ).toThrow("apiUrl must use a secure protocol for remote hosts.");
    });

    it("rejects query parameters on the Connect API base URL", () => {
        expect(() =>
            createPolyesterEnvironment({
                ...baseParams,
                apiUrl: "https://api.example.test?tenant=wrong-place",
            }),
        ).toThrow("apiUrl must not include query parameters.");
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

describe("parsePolyesterEnvironment", () => {
    it("accepts the current fingerprint and rejects the stale URL-inclusive fingerprint", () => {
        const environment = createPolyesterEnvironment({
            ...baseParams,
            apiUrl: "https://iad.api.example.test",
        });

        expect(parsePolyesterEnvironment(environment)).toEqual(environment);
        expect(() =>
            parsePolyesterEnvironment({
                ...environment,
                fingerprint: legacyFingerprint(environment),
            }),
        ).toThrow("environment.fingerprint must match the environment configuration.");
    });
});
