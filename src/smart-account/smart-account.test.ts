import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { encodeAbiParameters, numberToHex, toFunctionSelector } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createPolyesterEnvironment } from "../environment.js";
import {
    createPolyesterSmartAccount,
    createPolyesterSmartAccountClient,
    sendPolyesterUserOperation,
    waitForPolyesterUserOperationReceipt,
    warmPolyesterSmartAccountClient,
} from "./smart-account.js";

const GET_NONCE_SELECTOR = toFunctionSelector(
    "function getNonce(address, uint192) view returns (uint256)",
);
const PROXY_CREATION_CODE_SELECTOR = toFunctionSelector(
    "function proxyCreationCode() pure returns (bytes)",
);
const PAYMASTER_ADDRESS = "0x2222222222222222222222222222222222222222";
const USER_OPERATION_HASH = `0x${"11".repeat(32)}` as const;

const requests: { method: string; params: readonly Record<string, string>[] }[] = [];
let failGasPrice = false;
let failSend = false;
let statusDelayMs = 0;
let statusQueue: string[] = [];
let receiptQueue: (object | null)[] = [];
// Bundler estimate, then the +20% / 50k-floor buffer the client applies.
const ESTIMATED_GAS = {
    callGasLimit: numberToHex(16_323n),
    preVerificationGas: numberToHex(61_806n),
    verificationGasLimit: numberToHex(440_164n),
    paymasterVerificationGasLimit: numberToHex(40_262n),
    paymasterPostOpGasLimit: numberToHex(1n),
};
const BUFFERED_ACCOUNT_GAS = {
    callGasLimit: numberToHex(66_323n),
    preVerificationGas: numberToHex(111_806n),
    verificationGasLimit: numberToHex(528_196n),
};
// The live paymaster sets its own paymaster limits regardless of input.
const FINAL_PAYMASTER_GAS = {
    paymasterVerificationGasLimit: numberToHex(50_000n),
    paymasterPostOpGasLimit: numberToHex(100_000n),
};

function rpcResult(method: string, params: readonly Record<string, string>[]): unknown {
    switch (method) {
        case "eth_chainId":
            return numberToHex(31_337);
        case "eth_call": {
            const data = params[0]?.data ?? "0x";
            if (data.startsWith(PROXY_CREATION_CODE_SELECTOR)) {
                return encodeAbiParameters([{ type: "bytes" }], ["0x60806040"]);
            }
            if (data.startsWith(GET_NONCE_SELECTOR)) return numberToHex(7n, { size: 32 });
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
        case "pm_getPaymasterStubData": {
            const op = params[0] ?? {};
            return {
                paymaster: PAYMASTER_ADDRESS,
                paymasterData: `0xstub${(op.nonce ?? "0x0").slice(2)}${(op.callData ?? "0x").slice(2, 10)}`,
                paymasterVerificationGasLimit: numberToHex(50_000n),
                paymasterPostOpGasLimit: numberToHex(100_000n),
                isFinal: false,
            };
        }
        case "eth_estimateUserOperationGas":
            return ESTIMATED_GAS;
        case "pm_getPaymasterData": {
            // Mirrors the live paymaster: account limits are honored as sent,
            // paymaster limits are replaced.
            const op = params[0] ?? {};
            return {
                callGasLimit: op.callGasLimit,
                preVerificationGas: op.preVerificationGas,
                verificationGasLimit: op.verificationGasLimit,
                ...FINAL_PAYMASTER_GAS,
                paymaster: PAYMASTER_ADDRESS,
                paymasterData: `0xdata${(op.nonce ?? "0x0").slice(2)}${(op.callData ?? "0x").slice(2, 10)}`,
            };
        }
        case "eth_sendUserOperation":
            if (failSend) throw new Error("maxFeePerGas too low");
            return USER_OPERATION_HASH;
        case "pimlico_getUserOperationStatus":
            return { status: statusQueue.shift() ?? "included", transactionHash: null };
        case "eth_getUserOperationReceipt":
            return receiptQueue.length > 0 ? receiptQueue.shift() : { success: true, logs: [] };
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
        if (method === "pimlico_getUserOperationStatus" && statusDelayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, statusDelayMs));
        }
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
    statusQueue = [];
    receiptQueue = [];
    statusDelayMs = 0;
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
    it("buffers account gas and preserves stub paymaster limits for getPaymasterData with the real UserOp", async () => {
        const { client } = await setup();

        await expect(sendPolyesterUserOperation(client, sendParameters)).resolves.toBe(
            USER_OPERATION_HASH,
        );

        expect(byMethod("pm_getPaymasterStubData")).toHaveLength(1);
        expect(byMethod("eth_estimateUserOperationGas")).toHaveLength(1);
        expect(byMethod("pm_sponsorUserOperation")).toHaveLength(0);
        expect(byMethod("pm_getPaymasterData")).toHaveLength(1);
        expect(byMethod("pimlico_getUserOperationGasPrice")).toHaveLength(1);
        expect(byMethod("eth_sendUserOperation")).toHaveLength(1);
        expect(nonceReads()).toHaveLength(1);

        const stub = byMethod("pm_getPaymasterStubData")[0]?.params[0];
        expect(BigInt(stub!.nonce!)).not.toBe(0n);
        expect(stub?.callData).not.toBe("0x");
        const dataRequest = byMethod("pm_getPaymasterData")[0]?.params[0];
        // Viem preserves the stub's paymaster limits over the buffered estimate.
        expect(dataRequest).toMatchObject({
            ...BUFFERED_ACCOUNT_GAS,
            paymasterVerificationGasLimit: numberToHex(50_000n),
            paymasterPostOpGasLimit: numberToHex(100_000n),
        });
        expect(dataRequest?.maxFeePerGas).toBe(numberToHex(1_000_000_000n));
        expect(dataRequest?.signature?.length).toBeGreaterThan(2);
        expect(Object.keys(dataRequest ?? {})).not.toContain("calls");
        expect(Object.keys(dataRequest ?? {})).not.toContain("chainId");

        const signedOperation = byMethod("eth_sendUserOperation")[0]?.params[0];
        expect(signedOperation).toMatchObject({
            ...BUFFERED_ACCOUNT_GAS,
            ...FINAL_PAYMASTER_GAS,
            paymasterData: `0xdata${dataRequest!.nonce!.slice(2)}${dataRequest!.callData!.slice(2, 10)}`,
        });
        expect(signedOperation?.signature?.length).toBeGreaterThan(2);
    });

    it("clears the cached gas price when a submission fails, so a retry refetches it", async () => {
        const { client } = await setup();
        await sendPolyesterUserOperation(client, sendParameters);
        expect(byMethod("pimlico_getUserOperationGasPrice")).toHaveLength(1);

        failSend = true;
        try {
            await expect(sendPolyesterUserOperation(client, sendParameters)).rejects.toThrow();
        } finally {
            failSend = false;
        }
        // Still cached during the failed attempt itself.
        expect(byMethod("pimlico_getUserOperationGasPrice")).toHaveLength(1);

        await sendPolyesterUserOperation(client, sendParameters);
        expect(byMethod("pimlico_getUserOperationGasPrice")).toHaveLength(2);
        expect(byMethod("pm_getPaymasterStubData")).toHaveLength(3);
    });

    it("keeps the gas-price cache when the wallet prompt is cancelled before signing", async () => {
        const { account, client } = await setup();
        await warmPolyesterSmartAccountClient(client);
        account.signUserOperation = (() =>
            Promise.reject(new Error("user rejected"))) as typeof account.signUserOperation;

        await expect(sendPolyesterUserOperation(client, sendParameters)).rejects.toThrow(
            /user rejected/,
        );
        await warmPolyesterSmartAccountClient(client);
        expect(byMethod("pimlico_getUserOperationGasPrice")).toHaveLength(1);
        expect(byMethod("pm_getPaymasterStubData")).toHaveLength(1);
    });

    it("still returns the hash when an onPhase observer throws", async () => {
        const { client } = await setup();
        await expect(
            sendPolyesterUserOperation(client, sendParameters, {
                onPhase: () => {
                    throw new Error("telemetry down");
                },
            }),
        ).resolves.toBe(USER_OPERATION_HASH);
        expect(byMethod("eth_sendUserOperation")).toHaveLength(1);
    });

    it("fetches a stub with each submission's nonce and calldata", async () => {
        const { client } = await setup();
        await warmPolyesterSmartAccountClient(client);
        expect(byMethod("pm_getPaymasterStubData")).toHaveLength(0);
        await sendPolyesterUserOperation(client, sendParameters);
        await sendPolyesterUserOperation(client, {
            nonce: 8n,
            calls: [{ to: PAYMASTER_ADDRESS, data: "0x1234" }],
        });
        const stubs = byMethod("pm_getPaymasterStubData");
        const estimates = byMethod("eth_estimateUserOperationGas");
        const sends = byMethod("eth_sendUserOperation");
        expect(stubs).toHaveLength(2);
        expect(estimates).toHaveLength(2);
        expect(byMethod("pm_getPaymasterData")).toHaveLength(2);
        expect(byMethod("pm_sponsorUserOperation")).toHaveLength(0);
        expect(stubs[0]?.params[0]?.nonce).toBe(numberToHex(7n));
        expect(stubs[1]?.params[0]?.nonce).toBe(numberToHex(8n));
        expect(stubs[0]?.params[0]?.callData).not.toBe(stubs[1]?.params[0]?.callData);
        for (const [index, request] of stubs.entries()) {
            const stub = request.params[0]!;
            expect(stub).toMatchObject({
                nonce: sends[index]?.params[0]?.nonce,
                callData: sends[index]?.params[0]?.callData,
            });
            expect(estimates[index]?.params[0]?.paymasterData).toBe(
                `0xstub${stub.nonce!.slice(2)}${stub.callData!.slice(2, 10)}`,
            );
        }
    });

    it("does not estimate against a synthetic nonce=0 empty-calldata stub", async () => {
        const { client } = await setup();
        await sendPolyesterUserOperation(client, sendParameters);
        const stub = byMethod("pm_getPaymasterStubData")[0]?.params[0];
        expect(BigInt(stub!.nonce!)).not.toBe(0n);
        expect(stub?.callData).not.toBe("0x");
        expect(BigInt(stub!.maxFeePerGas!)).not.toBe(0n);
        expect(byMethod("pm_sponsorUserOperation")).toHaveLength(0);
        expect(byMethod("pm_getPaymasterData")).toHaveLength(1);
        const data = byMethod("pm_getPaymasterData")[0]?.params[0];
        const sendOp = byMethod("eth_sendUserOperation")[0]?.params[0];
        expect(sendOp?.paymasterData).toBe(
            `0xdata${data!.nonce!.slice(2)}${data!.callData!.slice(2, 10)}`,
        );
        expect(sendOp?.paymasterData?.startsWith("0xdata")).toBe(true);
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

    it("reports prepare, sign and send phase durations in order", async () => {
        const { account, client } = await setup();
        const originalSign = account.signUserOperation;
        account.signUserOperation = (async (userOperation) => {
            await new Promise((resolve) => setTimeout(resolve, 20));
            return originalSign(userOperation);
        }) as typeof account.signUserOperation;
        const phases: [string, number][] = [];

        await sendPolyesterUserOperation(client, sendParameters, {
            onPhase: (phase, ms) => phases.push([phase, ms]),
        });

        expect(phases.map(([phase]) => phase)).toEqual(["prepare", "sign", "send"]);
        for (const [, ms] of phases) expect(ms).toBeGreaterThanOrEqual(0);
        expect(phases[1]?.[1]).toBeGreaterThanOrEqual(15);
    });
});

describe("waitForPolyesterUserOperationReceipt", () => {
    it("checks status immediately and only fetches the receipt once included", async () => {
        const { client } = await setup();
        statusQueue = ["not_submitted", "submitted", "included"];
        const phases: [string, number][] = [];

        vi.useFakeTimers();
        try {
            const pending = waitForPolyesterUserOperationReceipt(client, USER_OPERATION_HASH, {
                onPhase: (phase, ms) => phases.push([phase, ms]),
            });
            // First status check happens before any timer fires.
            await vi.advanceTimersByTimeAsync(0);
            expect(byMethod("pimlico_getUserOperationStatus")).toHaveLength(1);
            await vi.advanceTimersByTimeAsync(249);
            expect(byMethod("pimlico_getUserOperationStatus")).toHaveLength(1);
            await vi.advanceTimersByTimeAsync(1);
            expect(byMethod("pimlico_getUserOperationStatus")).toHaveLength(2);
            expect(byMethod("eth_getUserOperationReceipt")).toHaveLength(0);
            await vi.advanceTimersByTimeAsync(250);
            expect(byMethod("pimlico_getUserOperationStatus")).toHaveLength(3);

            const receipt = await pending;
            expect(receipt).toMatchObject({ success: true });
            expect(byMethod("eth_getUserOperationReceipt")).toHaveLength(1);
            expect(phases).toEqual([["receipt", 500]]);
        } finally {
            vi.useRealTimers();
        }
    });

    it("fails fast on `failed`: the bundle reverted, so no receipt will exist", async () => {
        const { client } = await setup();
        statusQueue = ["failed"];
        await expect(
            waitForPolyesterUserOperationReceipt(client, USER_OPERATION_HASH),
        ).rejects.toThrow(/bundle transaction reverted/);
        expect(byMethod("eth_getUserOperationReceipt")).toHaveLength(0);
    });

    it("keeps polling an unknown operation until the deadline, checking the chain once a second", async () => {
        const { client } = await setup();
        statusQueue = Array.from({ length: 30 }, () => "not_found");
        // Receipt appears on the 6th chain check, i.e. the 21st poll.
        receiptQueue = [null, null, null, null, null, { success: true, logs: [] }];

        vi.useFakeTimers();
        try {
            const pending = waitForPolyesterUserOperationReceipt(client, USER_OPERATION_HASH);
            await vi.advanceTimersByTimeAsync(250 * 20);
            expect(await pending).toMatchObject({ success: true });
            expect(byMethod("pimlico_getUserOperationStatus")).toHaveLength(21);
            expect(byMethod("eth_getUserOperationReceipt")).toHaveLength(6);
        } finally {
            vi.useRealTimers();
        }
    });

    it("times out an operation the bundler never learns about", async () => {
        const { client } = await setup();
        statusQueue = Array.from({ length: 30 }, () => "not_found");
        receiptQueue = Array.from({ length: 30 }, () => null);

        vi.useFakeTimers();
        try {
            const pending = waitForPolyesterUserOperationReceipt(client, USER_OPERATION_HASH, {
                timeoutMs: 2_000,
            });
            const assertion = expect(pending).rejects.toThrow(/Timed out/);
            await vi.advanceTimersByTimeAsync(2_500);
            await assertion;
            // Polls at 0, 250, ..., 1750ms; chain checked on polls 1 and 5.
            expect(byMethod("pimlico_getUserOperationStatus")).toHaveLength(8);
            expect(byMethod("eth_getUserOperationReceipt")).toHaveLength(2);
        } finally {
            vi.useRealTimers();
        }
    });

    it("enforces timeoutMs across in-flight requests, not just between polls", async () => {
        const { client } = await setup();
        statusDelayMs = 200;
        const startedAt = Date.now();
        await expect(
            waitForPolyesterUserOperationReceipt(client, USER_OPERATION_HASH, { timeoutMs: 20 }),
        ).rejects.toThrow(/Timed out/);
        expect(Date.now() - startedAt).toBeLessThan(150);
    });

    it("falls back to the chain receipt when the bundler no longer knows the operation", async () => {
        const { client } = await setup();
        statusQueue = Array.from({ length: 10 }, () => "not_found");
        receiptQueue = [null, { success: true, logs: [] }];

        vi.useFakeTimers();
        try {
            const pending = waitForPolyesterUserOperationReceipt(client, USER_OPERATION_HASH);
            await vi.advanceTimersByTimeAsync(250 * 4);
            expect(await pending).toMatchObject({ success: true });
            // Chain checked on polls 1 and 5.
            expect(byMethod("pimlico_getUserOperationStatus")).toHaveLength(5);
            expect(byMethod("eth_getUserOperationReceipt")).toHaveLength(2);
        } finally {
            vi.useRealTimers();
        }
    });

    it("rejects when the bundler rejects the operation and drops the cached gas price", async () => {
        const { client } = await setup();
        await warmPolyesterSmartAccountClient(client);
        expect(byMethod("pimlico_getUserOperationGasPrice")).toHaveLength(1);

        statusQueue = ["rejected"];
        await expect(
            waitForPolyesterUserOperationReceipt(client, USER_OPERATION_HASH),
        ).rejects.toThrow(/rejected/);
        expect(byMethod("eth_getUserOperationReceipt")).toHaveLength(0);

        await warmPolyesterSmartAccountClient(client);
        expect(byMethod("pimlico_getUserOperationGasPrice")).toHaveLength(2);
    });
});

describe("createPolyesterSmartAccountClient", () => {
    it("returns the same client per account, environment and options", async () => {
        const { account, client } = await setup();
        expect(client.pollingInterval).toBe(250);

        const again = createPolyesterSmartAccountClient(account, {
            environment,
            options: { pollingIntervalMs: 250, gasPriceCacheTtlMs: 60_000 },
        });
        expect(again).toBe(client);
        const tuned = createPolyesterSmartAccountClient(account, {
            environment,
            options: { pollingIntervalMs: 5_000 },
        });
        expect(tuned).not.toBe(client);
        expect(tuned.pollingInterval).toBe(5_000);
        expect(
            createPolyesterSmartAccountClient(account, {
                environment,
                options: { pollingIntervalMs: 5_000 },
            }),
        ).toBe(tuned);

        await warmPolyesterSmartAccountClient(client);
        await warmPolyesterSmartAccountClient(again);
        expect(byMethod("pimlico_getUserOperationGasPrice")).toHaveLength(1);

        const other = await createPolyesterSmartAccount({
            environment,
            owner: privateKeyToAccount(`0x${"00".repeat(31)}02`),
        });
        expect(createPolyesterSmartAccountClient(other, { environment })).not.toBe(client);
    });

    it("lets consumers override the gas price cache TTL and polling interval", async () => {
        const owner = privateKeyToAccount(`0x${"00".repeat(31)}03`);
        const account = await createPolyesterSmartAccount({ environment, owner });
        requests.length = 0;
        const tuned = createPolyesterSmartAccountClient(account, {
            environment,
            options: { gasPriceCacheTtlMs: 5_000, pollingIntervalMs: 1_000 },
        });
        expect(tuned.pollingInterval).toBe(1_000);

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
    it("caches the gas price for 60s, refetches after it, and never caches the nonce", async () => {
        const { client } = await setup();
        vi.useFakeTimers({ toFake: ["Date"] });
        try {
            await warmPolyesterSmartAccountClient(client);
            vi.setSystemTime(Date.now() + 59_999);
            await warmPolyesterSmartAccountClient(client);
            expect(byMethod("pimlico_getUserOperationGasPrice")).toHaveLength(1);
            expect(byMethod("pm_getPaymasterStubData")).toHaveLength(0);
            expect(nonceReads()).toHaveLength(2);
            await sendPolyesterUserOperation(client, sendParameters);
            expect(byMethod("pm_getPaymasterStubData")).toHaveLength(1);

            vi.setSystemTime(Date.now() + 2);
            await warmPolyesterSmartAccountClient(client);
            expect(byMethod("pimlico_getUserOperationGasPrice")).toHaveLength(2);
            expect(byMethod("pm_getPaymasterStubData")).toHaveLength(1);
            expect(nonceReads()).toHaveLength(4);
            await sendPolyesterUserOperation(client, sendParameters);
            expect(byMethod("pm_getPaymasterStubData")).toHaveLength(2);

            vi.setSystemTime(Date.now() + 60_001);
            failGasPrice = true;
            await expect(warmPolyesterSmartAccountClient(client)).resolves.toBeUndefined();
            expect(byMethod("pimlico_getUserOperationGasPrice")).toHaveLength(3);

            // A failed fetch is not cached: the next warm-up retries.
            failGasPrice = false;
            await warmPolyesterSmartAccountClient(client);
            expect(byMethod("pimlico_getUserOperationGasPrice")).toHaveLength(4);
        } finally {
            failGasPrice = false;
            vi.useRealTimers();
        }
    });
});
