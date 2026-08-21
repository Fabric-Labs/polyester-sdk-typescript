import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { encodeAbiParameters, numberToHex, toFunctionSelector } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createPolyesterEnvironment } from "../environment.js";
import {
    createPolyesterSmartAccount,
    createPolyesterSmartAccountClient,
    sendPolyesterUserOperation,
    warmPolyesterSmartAccountClient,
} from "./smart-account.js";

const GET_NONCE_SELECTOR = toFunctionSelector(
    "function getNonce(address, uint192) view returns (uint256)",
);
const PROXY_CREATION_CODE_SELECTOR = toFunctionSelector(
    "function proxyCreationCode() pure returns (bytes)",
);
const PAYMASTER_ADDRESS = "0x2222222222222222222222222222222222222222";
const USER_OPERATION_HASH = `0x${"11".repeat(32)}`;

const requests: { method: string; params: readonly Record<string, string>[] }[] = [];
let failGasPrice = false;

function rpcResult(method: string, params: readonly Record<string, string>[]): unknown {
    switch (method) {
        case "eth_chainId":
            return numberToHex(31_337);
        case "eth_call": {
            const data = params[0]?.data ?? "0x";
            if (data.startsWith(PROXY_CREATION_CODE_SELECTOR)) {
                return encodeAbiParameters([{ type: "bytes" }], ["0x60806040"]);
            }
            if (data.startsWith(GET_NONCE_SELECTOR)) return `0x${"00".repeat(32)}`;
            throw new Error(`unexpected eth_call: ${data}`);
        }
        case "eth_getCode":
            return "0x6080";
        case "pimlico_getUserOperationGasPrice": {
            if (failGasPrice) throw new Error("gas price unavailable");
            const fee = {
                maxFeePerGas: numberToHex(1_000_000_000n),
                maxPriorityFeePerGas: numberToHex(1_000_000_000n),
            };
            return { slow: fee, standard: fee, fast: fee };
        }
        case "pm_getPaymasterStubData":
            return { paymaster: PAYMASTER_ADDRESS, paymasterData: "0xdead" };
        case "eth_estimateUserOperationGas":
            return {
                callGasLimit: numberToHex(100_000n),
                preVerificationGas: numberToHex(50_000n),
                verificationGasLimit: numberToHex(500_000n),
                paymasterVerificationGasLimit: numberToHex(100_000n),
                paymasterPostOpGasLimit: numberToHex(200_000n),
            };
        case "pm_getPaymasterData":
            return { paymaster: PAYMASTER_ADDRESS, paymasterData: "0xbeef" };
        case "eth_sendUserOperation":
            return USER_OPERATION_HASH;
        default:
            throw new Error(`unexpected method: ${method}`);
    }
}

beforeAll(() => {
    // Stub HTTP transport: answers every JSON-RPC POST viem/permissionless make.
    vi.stubGlobal("fetch", async (_url: unknown, init?: { body?: string }) => {
        const {
            id,
            method,
            params = [],
        } = JSON.parse(init?.body ?? "{}") as {
            id: number;
            method: string;
            params?: Record<string, string>[];
        };
        requests.push({ method, params });
        let payload: unknown;
        try {
            payload = { jsonrpc: "2.0", id, result: rpcResult(method, params) };
        } catch (error) {
            payload = { jsonrpc: "2.0", id, error: { code: -32601, message: String(error) } };
        }
        return new Response(JSON.stringify(payload), {
            headers: { "content-type": "application/json" },
        });
    });
});

afterAll(() => {
    vi.unstubAllGlobals();
});

const url = "http://127.0.0.1:1";
const environment = createPolyesterEnvironment({
    name: "smart-account-test",
    apiUrl: url,
    websocketUrl: "ws://127.0.0.1:1",
    rpcUrl: `${url}/rpc`,
    chain: {
        id: 31_337,
        name: "Test Chain",
        nativeCurrency: { decimals: 18, name: "Test", symbol: "TST" },
        rpcUrls: { default: { http: [`${url}/rpc`] } },
    },
    accountAbstraction: {
        bundlerUrl: `${url}/bundler`,
        paymasterUrl: `${url}/paymaster`,
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
        },
    },
    contracts: {
        tradingGatewayAddress: "0xD3fecf5D39131e23b6B0f872cA0a21c8A5a30932",
    },
});

async function setup() {
    const owner = privateKeyToAccount(`0x${"00".repeat(31)}01`);
    const account = await createPolyesterSmartAccount({ environment, owner });
    const client = createPolyesterSmartAccountClient(account, { environment });
    requests.length = 0;
    return { account, client };
}

const byMethod = (method: string) => requests.filter((request) => request.method === method);
const nonceReads = () =>
    requests.filter(
        (request) =>
            request.method === "eth_call" &&
            (request.params[0]?.data ?? "").startsWith(GET_NONCE_SELECTOR),
    );
const sendParameters = {
    calls: [{ to: "0x1111111111111111111111111111111111111111", data: "0x" }],
} as never;

describe("sendPolyesterUserOperation", () => {
    it("submits in a single prepare pass with buffered gas committed to the paymaster", async () => {
        const { client } = await setup();

        await expect(sendPolyesterUserOperation(client, sendParameters)).resolves.toBe(
            USER_OPERATION_HASH,
        );

        expect(byMethod("eth_estimateUserOperationGas")).toHaveLength(1);
        expect(byMethod("pm_getPaymasterStubData")).toHaveLength(1);
        expect(byMethod("pm_getPaymasterData")).toHaveLength(1);
        expect(byMethod("pimlico_getUserOperationGasPrice")).toHaveLength(1);
        expect(byMethod("eth_getCode")).toHaveLength(1);
        expect(byMethod("eth_sendUserOperation")).toHaveLength(1);
        expect(nonceReads()).toHaveLength(1);

        // Estimated limits +20% with a 50k floor.
        const buffered = {
            callGasLimit: numberToHex(150_000n),
            preVerificationGas: numberToHex(100_000n),
            verificationGasLimit: numberToHex(600_000n),
            paymasterVerificationGasLimit: numberToHex(150_000n),
            paymasterPostOpGasLimit: numberToHex(250_000n),
        };
        expect(byMethod("pm_getPaymasterData")[0]?.params[0]).toMatchObject(buffered);
        const signedOperation = byMethod("eth_sendUserOperation")[0]?.params[0];
        expect(signedOperation).toMatchObject({ ...buffered, paymasterData: "0xbeef" });
        expect(signedOperation?.signature?.length).toBeGreaterThan(2);
    });

    it("fires onWalletSignatureRequested once, after all prep and before signing", async () => {
        const { account, client } = await setup();
        const originalSign = account.signUserOperation;
        account.signUserOperation = ((userOperation) => {
            requests.push({ method: "signUserOperation", params: [] });
            return originalSign(userOperation);
        }) as typeof account.signUserOperation;

        await sendPolyesterUserOperation(client, sendParameters, {
            onWalletSignatureRequested: () =>
                requests.push({ method: "onWalletSignatureRequested", params: [] }),
        });

        expect(byMethod("onWalletSignatureRequested")).toHaveLength(1);
        const order = requests.map((request) => request.method);
        const callbackIndex = order.indexOf("onWalletSignatureRequested");
        for (const method of [
            "eth_call",
            "eth_getCode",
            "pimlico_getUserOperationGasPrice",
            "pm_getPaymasterStubData",
            "eth_estimateUserOperationGas",
            "pm_getPaymasterData",
        ]) {
            expect(order.lastIndexOf(method), method).toBeLessThan(callbackIndex);
        }
        expect(order[callbackIndex + 1]).toBe("signUserOperation");
        expect(order.indexOf("eth_sendUserOperation")).toBeGreaterThan(callbackIndex);
    });
});

describe("createPolyesterSmartAccountClient", () => {
    it("lets consumers override the gas price cache TTL and polling interval", async () => {
        const { account, client } = await setup();
        expect(client.pollingInterval).toBe(1_000);

        const tuned = createPolyesterSmartAccountClient(account, {
            environment,
            options: { gasPriceCacheTtlMs: 5_000, pollingIntervalMs: 250 },
        });
        expect(tuned.pollingInterval).toBe(250);

        vi.useFakeTimers({ toFake: ["Date"] });
        try {
            await warmPolyesterSmartAccountClient(tuned);
            vi.setSystemTime(Date.now() + 4_999);
            await warmPolyesterSmartAccountClient(tuned);
            expect(byMethod("pimlico_getUserOperationGasPrice")).toHaveLength(1);

            vi.setSystemTime(Date.now() + 2);
            await warmPolyesterSmartAccountClient(tuned);
            expect(byMethod("pimlico_getUserOperationGasPrice")).toHaveLength(2);
        } finally {
            vi.useRealTimers();
        }
    });
});

describe("warmPolyesterSmartAccountClient", () => {
    it("caches the gas price within the TTL, refetches after it, and never caches the nonce", async () => {
        const { client } = await setup();
        vi.useFakeTimers({ toFake: ["Date"] });
        try {
            await warmPolyesterSmartAccountClient(client);
            await warmPolyesterSmartAccountClient(client);
            expect(byMethod("pimlico_getUserOperationGasPrice")).toHaveLength(1);
            expect(nonceReads()).toHaveLength(2);

            vi.setSystemTime(Date.now() + 10_001);
            await warmPolyesterSmartAccountClient(client);
            expect(byMethod("pimlico_getUserOperationGasPrice")).toHaveLength(2);
            expect(nonceReads()).toHaveLength(3);

            vi.setSystemTime(Date.now() + 10_001);
            failGasPrice = true;
            await expect(warmPolyesterSmartAccountClient(client)).resolves.toBeUndefined();
        } finally {
            failGasPrice = false;
            vi.useRealTimers();
        }
    });
});
