import type { SafeVersion } from "permissionless/accounts";
import { ConfigurationError } from "./shared/errors.js";
import type { Address, Chain } from "viem";
import { checksumEvmAddress, evmUtf8ToBytes, isEvmAddress, keccak256Hex } from "./utils/evm.js";

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

function requireObject(value: unknown, label: string): asserts value is Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new ConfigurationError(`${label} must be an object.`);
    }
}

function requireNonEmptyString(value: unknown, label: string): asserts value is string {
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new ConfigurationError(`${label} must be a non-empty string.`);
    }
}

function isLocalHost(hostname: string): boolean {
    return LOCAL_HOSTS.has(hostname);
}

function normalizeUrl(value: string, label: string, allowedProtocols: readonly string[]): string {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new ConfigurationError(`${label} must be a valid URL.`);
    }

    if (!allowedProtocols.includes(url.protocol)) {
        throw new ConfigurationError(`${label} must use ${allowedProtocols.join(" or ")}.`);
    }

    const insecureRemote =
        (url.protocol === "http:" || url.protocol === "ws:") && !isLocalHost(url.hostname);
    if (insecureRemote) {
        throw new ConfigurationError(`${label} must use a secure protocol for remote hosts.`);
    }

    url.hash = "";
    return url.toString().replace(/\/+$/u, "");
}

function normalizeAddress(value: Address, label: string): Address {
    if (!isEvmAddress(value)) {
        throw new ConfigurationError(`${label} must be a valid address.`);
    }
    return checksumEvmAddress(value);
}

function normalizeEntryPoint(entryPoint: PolyesterEntryPointConfig): PolyesterEntryPointConfig {
    requireObject(entryPoint, "accountAbstraction.entryPoint");
    if (entryPoint.version !== "0.7") {
        throw new ConfigurationError("accountAbstraction.entryPoint.version must be 0.7.");
    }
    return Object.freeze({
        address: normalizeAddress(entryPoint.address, "accountAbstraction.entryPoint.address"),
        version: entryPoint.version,
    });
}

function normalizeSafeConfig(safe: PolyesterSafeDeploymentConfig): PolyesterSafeDeploymentConfig {
    requireObject(safe, "accountAbstraction.safe");
    if (safe.version !== "1.4.1" && safe.version !== "1.5.0") {
        throw new ConfigurationError(
            'accountAbstraction.safe.version must be either "1.4.1" or "1.5.0".',
        );
    }
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
    requireObject(chain, "chain");
    if (!Number.isInteger(chain.id) || chain.id <= 0) {
        throw new ConfigurationError("chain.id must be a positive integer.");
    }
    requireNonEmptyString(chain.name, "chain.name");
    requireObject(chain.nativeCurrency, "chain.nativeCurrency");
    if (!Number.isInteger(chain.nativeCurrency.decimals) || chain.nativeCurrency.decimals < 0) {
        throw new ConfigurationError(
            "chain.nativeCurrency.decimals must be a non-negative integer.",
        );
    }
    requireNonEmptyString(chain.nativeCurrency.name, "chain.nativeCurrency.name");
    requireNonEmptyString(chain.nativeCurrency.symbol, "chain.nativeCurrency.symbol");
    requireObject(chain.rpcUrls, "chain.rpcUrls");
    requireObject(chain.rpcUrls.default, "chain.rpcUrls.default");
    if (!Array.isArray(chain.rpcUrls.default.http)) {
        throw new ConfigurationError("chain.rpcUrls.default.http must be an array.");
    }

    // Shape parity with viem's defineChain: spread over undefined defaults.
    return Object.freeze({
        formatters: undefined,
        fees: undefined,
        serializers: undefined,
        ...chain,
        rpcUrls: {
            ...chain.rpcUrls,
            default: {
                ...chain.rpcUrls.default,
                http: [rpcUrl],
            },
        },
    });
}

function environmentFingerprint(input: {
    apiUrl: string;
    websocketUrl: string;
    rpcUrl: string;
    chainId: number;
    accountAbstraction: PolyesterAccountAbstractionEnvironment;
    contracts: PolyesterContractsEnvironment;
}): string {
    return keccak256Hex(
        evmUtf8ToBytes(
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
    requireObject(params, "Environment configuration");
    requireNonEmptyString(params.name, "name");
    requireObject(params.accountAbstraction, "accountAbstraction");
    requireObject(params.contracts, "contracts");
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

/**
 * Parses a complete environment supplied to a public SDK client constructor.
 */
export function parsePolyesterEnvironment(environment: PolyesterEnvironment): PolyesterEnvironment {
    requireObject(environment, "environment");
    const parsed = createPolyesterEnvironment(environment);
    if (environment.fingerprint !== parsed.fingerprint) {
        throw new ConfigurationError(
            "environment.fingerprint must match the environment configuration.",
        );
    }
    return parsed;
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
        blockExplorers: {
            default: {
                name: "Polyester Scan",
                url: "https://polyesterscan.com",
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
        tradingGatewayAddress: "0xD3fecf5D39131e23b6B0f872cA0a21c8A5a30932",
    },
});
