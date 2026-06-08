import type { SafeVersion } from "permissionless/accounts";
import {
    type Address,
    type Chain,
    defineChain,
    getAddress,
    isAddress,
    keccak256,
    stringToBytes,
} from "viem";

export interface PolyesterEntryPointConfig {
    readonly address: Address;
    readonly version: "0.7";
}

export interface PolyesterSafeDeploymentConfig {
    readonly version: SafeVersion;
    readonly safeModuleSetupAddress: Address;
    readonly safe4337ModuleAddress: Address;
    readonly safeProxyFactoryAddress: Address;
    readonly safeSingletonAddress: Address;
    readonly multiSendAddress: Address;
    readonly multiSendCallOnlyAddress?: Address;
}

export interface PolyesterAccountAbstractionEnvironment {
    readonly bundlerUrl: string;
    readonly paymasterUrl: string;
    readonly entryPoint: PolyesterEntryPointConfig;
    readonly safe: PolyesterSafeDeploymentConfig;
}

export interface PolyesterContractsEnvironment {
    readonly tradingGatewayAddress: Address;
}

export interface PolyesterEnvironment {
    readonly name: string;
    readonly fingerprint: string;
    readonly apiUrl: string;
    readonly websocketUrl: string;
    readonly rpcUrl: string;
    readonly chain: Chain;
    readonly accountAbstraction: PolyesterAccountAbstractionEnvironment;
    readonly contracts: PolyesterContractsEnvironment;
}

export interface CreatePolyesterEnvironmentParams {
    readonly name: string;
    readonly apiUrl: string;
    readonly websocketUrl: string;
    readonly rpcUrl: string;
    readonly chain: Chain;
    readonly accountAbstraction: {
        readonly bundlerUrl: string;
        readonly paymasterUrl: string;
        readonly entryPoint: PolyesterEntryPointConfig;
        readonly safe: PolyesterSafeDeploymentConfig;
    };
    readonly contracts: PolyesterContractsEnvironment;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function isLocalHost(hostname: string): boolean {
    return LOCAL_HOSTS.has(hostname);
}

function normalizeUrl(value: string, label: string, allowedProtocols: readonly string[]): string {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new Error(`${label} must be a valid URL.`);
    }

    if (!allowedProtocols.includes(url.protocol)) {
        throw new Error(`${label} must use ${allowedProtocols.join(" or ")}.`);
    }

    const insecureRemote =
        (url.protocol === "http:" || url.protocol === "ws:") && !isLocalHost(url.hostname);
    if (insecureRemote) {
        throw new Error(`${label} must use a secure protocol for remote hosts.`);
    }

    url.hash = "";
    return url.toString().replace(/\/+$/u, "");
}

function normalizeAddress(value: Address, label: string): Address {
    if (!isAddress(value, { strict: false })) {
        throw new Error(`${label} must be a valid address.`);
    }
    return getAddress(value);
}

function normalizeEntryPoint(entryPoint: PolyesterEntryPointConfig): PolyesterEntryPointConfig {
    if (entryPoint.version !== "0.7") {
        throw new Error("accountAbstraction.entryPoint.version must be 0.7.");
    }
    return Object.freeze({
        address: normalizeAddress(entryPoint.address, "accountAbstraction.entryPoint.address"),
        version: entryPoint.version,
    });
}

function normalizeSafeConfig(safe: PolyesterSafeDeploymentConfig): PolyesterSafeDeploymentConfig {
    return Object.freeze({
        version: safe.version,
        safeModuleSetupAddress: normalizeAddress(
            safe.safeModuleSetupAddress,
            "accountAbstraction.safe.safeModuleSetupAddress",
        ),
        safe4337ModuleAddress: normalizeAddress(
            safe.safe4337ModuleAddress,
            "accountAbstraction.safe.safe4337ModuleAddress",
        ),
        safeProxyFactoryAddress: normalizeAddress(
            safe.safeProxyFactoryAddress,
            "accountAbstraction.safe.safeProxyFactoryAddress",
        ),
        safeSingletonAddress: normalizeAddress(
            safe.safeSingletonAddress,
            "accountAbstraction.safe.safeSingletonAddress",
        ),
        multiSendAddress: normalizeAddress(
            safe.multiSendAddress,
            "accountAbstraction.safe.multiSendAddress",
        ),
        multiSendCallOnlyAddress: safe.multiSendCallOnlyAddress
            ? normalizeAddress(
                  safe.multiSendCallOnlyAddress,
                  "accountAbstraction.safe.multiSendCallOnlyAddress",
              )
            : undefined,
    });
}

function normalizeChain(chain: Chain, rpcUrl: string): Chain {
    if (!Number.isInteger(chain.id) || chain.id <= 0) {
        throw new Error("chain.id must be a positive integer.");
    }

    return Object.freeze(
        defineChain({
            ...chain,
            rpcUrls: {
                ...chain.rpcUrls,
                default: {
                    ...chain.rpcUrls.default,
                    http: [rpcUrl],
                },
            },
        }),
    );
}

function environmentFingerprint(input: {
    apiUrl: string;
    websocketUrl: string;
    rpcUrl: string;
    chainId: number;
    accountAbstraction: PolyesterAccountAbstractionEnvironment;
    contracts: PolyesterContractsEnvironment;
}): string {
    return keccak256(
        stringToBytes(
            JSON.stringify({
                apiUrl: input.apiUrl,
                websocketUrl: input.websocketUrl,
                rpcUrl: input.rpcUrl,
                chainId: input.chainId,
                bundlerUrl: input.accountAbstraction.bundlerUrl,
                paymasterUrl: input.accountAbstraction.paymasterUrl,
                entryPoint: input.accountAbstraction.entryPoint,
                safe: input.accountAbstraction.safe,
                contracts: input.contracts,
            }),
        ),
    );
}

/**
 * Creates a complete SDK environment configuration from entrypoint and contract settings.
 */
export function createPolyesterEnvironment(
    params: CreatePolyesterEnvironmentParams,
): PolyesterEnvironment {
    const apiUrl = normalizeUrl(params.apiUrl, "apiUrl", ["https:", "http:"]);
    const websocketUrl = normalizeUrl(params.websocketUrl, "websocketUrl", ["wss:", "ws:"]);
    const rpcUrl = normalizeUrl(params.rpcUrl, "rpcUrl", ["https:", "http:"]);
    const bundlerUrl = normalizeUrl(params.accountAbstraction.bundlerUrl, "bundlerUrl", [
        "https:",
        "http:",
    ]);
    const paymasterUrl = normalizeUrl(params.accountAbstraction.paymasterUrl, "paymasterUrl", [
        "https:",
        "http:",
    ]);
    const chain = normalizeChain(params.chain, rpcUrl);
    const accountAbstraction = Object.freeze({
        bundlerUrl,
        paymasterUrl,
        entryPoint: normalizeEntryPoint(params.accountAbstraction.entryPoint),
        safe: normalizeSafeConfig(params.accountAbstraction.safe),
    });
    const contracts = Object.freeze({
        tradingGatewayAddress: normalizeAddress(
            params.contracts.tradingGatewayAddress,
            "contracts.tradingGatewayAddress",
        ),
    });
    const fingerprint = environmentFingerprint({
        apiUrl,
        websocketUrl,
        rpcUrl,
        chainId: chain.id,
        accountAbstraction,
        contracts,
    });

    return Object.freeze({
        name: params.name,
        fingerprint,
        apiUrl,
        websocketUrl,
        rpcUrl,
        chain,
        accountAbstraction,
        contracts,
    });
}

export const POLYESTER_TESTNET_ENVIRONMENT = createPolyesterEnvironment({
    name: "polyester-testnet",
    apiUrl: "https://api-devnet.polyester.ai",
    websocketUrl: "wss://api-devnet.polyester.ai",
    rpcUrl: "https://rpc.polyester.tech",
    chain: {
        id: 888168,
        name: "Polyester Chain Testnet",
        nativeCurrency: {
            decimals: 18,
            name: "POL",
            symbol: "POL",
        },
        rpcUrls: {
            default: {
                http: ["https://rpc.polyester.tech"],
            },
        },
    },
    accountAbstraction: {
        bundlerUrl: "https://bundler.polyester.tech",
        paymasterUrl: "https://paymaster.polyester.tech",
        entryPoint: {
            address: "0x59a4B77766509c4507D79eFF8089474eC3daC174",
            version: "0.7",
        },
        safe: {
            version: "1.4.1",
            safeModuleSetupAddress: "0x80791683D9C079A37Debc67EaDdbFcBC6f0FF2bB",
            safe4337ModuleAddress: "0x0713FF3d4c1b4f177833a372b1e3cb977540EA11",
            safeProxyFactoryAddress: "0xF8F0F649Dd3bFa9095206691E9fb2356c26216dE",
            safeSingletonAddress: "0x92abEa238FEA8908c397cE65366ea9278f0AeC7A",
            multiSendAddress: "0x70C8a8CcB45a8E2589B0f019374fc923dA34E4c7",
            multiSendCallOnlyAddress: "0x375C86a08DA98d1944D7B3c736307A72186CcAf1",
        },
    },
    contracts: {
        tradingGatewayAddress: "0x213c3e4E6fA46595eF46BB64b35221F9e98AEcF4",
    },
});
