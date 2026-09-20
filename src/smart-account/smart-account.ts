import type { Address, LocalAccount, PublicClient } from "viem";
import { createPublicClient, http, withTimeout } from "viem";
import type {
    EstimateUserOperationGasParameters,
    GetPaymasterDataParameters,
    GetPaymasterStubDataParameters,
    UserOperation,
} from "viem/account-abstraction";
import {
    estimateUserOperationGas,
    formatUserOperationRequest,
    prepareUserOperation,
} from "viem/account-abstraction";
import { createSmartAccountClient } from "permissionless";
import { getUserOperationStatus } from "permissionless/actions/pimlico";
import { toSafeSmartAccount } from "permissionless/accounts";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import type { PolyesterEnvironment } from "../environment.js";
import { predictSafeAddress } from "../account-signer/predict-safe-address.js";

export type SafeSmartAccountInstance = Awaited<ReturnType<typeof toSafeSmartAccount>>;
export type PolyesterSmartAccountClient = ReturnType<typeof buildPolyesterSmartAccountClient>;

const smartAccountEnvironmentFingerprints = new WeakMap<SafeSmartAccountInstance, string>();
const smartAccountClientPrimers = new WeakMap<object, () => Promise<unknown>>();
const smartAccountClientCacheResets = new WeakMap<object, () => void>();
const smartAccountClients = new WeakMap<
    SafeSmartAccountInstance,
    Map<string, PolyesterSmartAccountClient>
>();
const USER_OPERATION_GAS_PRICE_TTL_MS = 60_000;
const USER_OPERATION_GAS_BUFFER_BPS = 2_000n;
const USER_OPERATION_MIN_GAS_BUFFER = 50_000n;
const USER_OPERATION_RECEIPT_POLLING_INTERVAL_MS = 250;
/**
 * While the bundler reports `not_found`, the chain is checked for a receipt
 * on every Nth poll (once per second at the default interval). `not_found` is
 * not definitive — a bundler restart forgets ops whose bundle is still
 * pending — so polling continues until the deadline.
 */
const NOT_FOUND_RECEIPT_CHECK_EVERY = 4;

export interface CreateSmartAccountParams {
    environment: PolyesterEnvironment;
    owner: LocalAccount;
    saltNonce?: bigint;
    publicClient?: PublicClient;
}

export interface PredictPolyesterSmartAccountAddressParams {
    environment: PolyesterEnvironment;
    ownerAddress: Address;
    saltNonce?: bigint;
}

export function predictPolyesterSmartAccountAddress({
    environment,
    ownerAddress,
    saltNonce = 0n,
}: PredictPolyesterSmartAccountAddressParams): Address {
    const {
        safeProxyFactoryAddress,
        safeSingletonAddress,
        safeModuleSetupAddress,
        safe4337ModuleAddress,
        multiSendAddress,
    } = environment.accountAbstraction.safe;

    return predictSafeAddress({
        owners: [ownerAddress],
        saltNonce,
        safeProxyFactoryAddress,
        safeSingletonAddress,
        safeModuleSetupAddress,
        safe4337ModuleAddress,
        multiSendAddress,
    });
}

/**
 * Creates a Polyester smart account instance.
 */
export async function createPolyesterSmartAccount({
    environment,
    owner,
    saltNonce,
    publicClient,
}: CreateSmartAccountParams): Promise<SafeSmartAccountInstance> {
    const client =
        publicClient ??
        createPublicClient({
            chain: environment.chain,
            transport: http(environment.rpcUrl),
        });

    if (client.chain?.id && client.chain.id !== environment.chain.id) {
        throw new Error("Smart account public client chain does not match environment.");
    }

    const account = await toSafeSmartAccount({
        client,
        owners: [owner],
        saltNonce,
        entryPoint: environment.accountAbstraction.entryPoint,
        ...environment.accountAbstraction.safe,
    });
    smartAccountEnvironmentFingerprints.set(account, environment.fingerprint);
    return account;
}

export interface PolyesterSmartAccountClientOptions {
    /** How long a fetched gas price is reused, in milliseconds. Defaults to 60s. */
    gasPriceCacheTtlMs?: number;
    /** How often to poll for UserOperation inclusion, in milliseconds. Defaults to 250ms. */
    pollingIntervalMs?: number;
}

/**
 * Creates a viem client bound to a Polyester smart account. Memoized per
 * (account, environment, options): repeat calls return the same client, so
 * the gas price cache and warmed connections survive across submissions.
 */
export function createPolyesterSmartAccountClient(
    account: SafeSmartAccountInstance,
    params: {
        environment: PolyesterEnvironment;
        options?: PolyesterSmartAccountClientOptions;
    },
) {
    const { environment, options } = params;
    const accountEnvironmentFingerprint = smartAccountEnvironmentFingerprints.get(account);
    if (
        accountEnvironmentFingerprint &&
        accountEnvironmentFingerprint !== environment.fingerprint
    ) {
        throw new Error("Smart account environment does not match client environment.");
    }
    let clients = smartAccountClients.get(account);
    if (!clients) smartAccountClients.set(account, (clients = new Map()));
    const key = JSON.stringify([
        environment.fingerprint,
        options?.gasPriceCacheTtlMs ?? USER_OPERATION_GAS_PRICE_TTL_MS,
        options?.pollingIntervalMs ?? USER_OPERATION_RECEIPT_POLLING_INTERVAL_MS,
    ]);
    let client = clients.get(key);
    if (!client) {
        client = buildPolyesterSmartAccountClient(account, environment, options);
        clients.set(key, client);
    }
    return client;
}

function buildPolyesterSmartAccountClient(
    account: SafeSmartAccountInstance,
    environment: PolyesterEnvironment,
    options: PolyesterSmartAccountClientOptions | undefined,
) {
    const {
        gasPriceCacheTtlMs = USER_OPERATION_GAS_PRICE_TTL_MS,
        pollingIntervalMs = USER_OPERATION_RECEIPT_POLLING_INTERVAL_MS,
    } = options ?? {};

    const paymaster = createPimlicoClient({
        chain: environment.chain,
        transport: http(environment.accountAbstraction.paymasterUrl),
        entryPoint: environment.accountAbstraction.entryPoint,
    });

    const gasPrice = cachedForTtl(() => paymaster.getUserOperationGasPrice(), gasPriceCacheTtlMs);
    const getGasPrice = gasPrice.get;
    // The stub is a per-paymaster constant (address + dummy signature): fetched
    // once, primed by warm-up, and only dropped when a submission fails.
    // `paymasterContext` is not forwarded to it; no Polyester paymaster
    // policy keys off context, and the sponsor call below does forward it.
    const stubData = cachedForTtl(
        () =>
            paymaster.getPaymasterStubData({
                chainId: environment.chain.id,
                entryPointAddress: environment.accountAbstraction.entryPoint.address,
                sender: account.address,
                nonce: 0n,
                callData: "0x",
                maxFeePerGas: 0n,
                maxPriorityFeePerGas: 0n,
            }),
        Number.POSITIVE_INFINITY,
    );
    const getStubData = stubData.get;

    const client = createSmartAccountClient({
        account,
        chain: environment.chain,
        paymaster: {
            getPaymasterStubData: (_parameters: GetPaymasterStubDataParameters) => getStubData(),
            // `pm_sponsorUserOperation` replaces `pm_getPaymasterData`: it signs
            // over the (already buffered) account gas limits it receives and
            // sets its own paymaster limits. Nothing may adjust gas afterwards.
            getPaymasterData: async (parameters: GetPaymasterDataParameters) => {
                // viem hands over every original parameter (`calls`, `chainId`,
                // ...); the paymaster rejects unknown keys, so keep only
                // UserOperation fields.
                return paymaster.sponsorUserOperation({
                    userOperation: formatUserOperationRequest(
                        parameters as unknown as UserOperation<"0.7">,
                    ) as unknown as UserOperation<"0.7">,
                    paymasterContext: parameters.context,
                });
            },
        },
        bundlerTransport: http(environment.accountAbstraction.bundlerUrl),
        pollingInterval: pollingIntervalMs,
        userOperation: {
            estimateFeesPerGas: async () => (await getGasPrice()).fast,
            // Single prepare pass: viem resolves gas estimation via
            // `getAction(client, estimateUserOperationGas, ...)`, so handing
            // `prepareUserOperation` a client whose estimate action buffers the
            // result makes the buffered limits flow into the sponsor call
            // before signing — the sponsorship signature commits to them.
            prepareUserOperation: (prepareClient, prepareParameters) => {
                const bufferingClient = {
                    ...prepareClient,
                    estimateUserOperationGas: async (
                        estimateParameters: EstimateUserOperationGasParameters,
                    ) =>
                        bufferPolyesterUserOperationGas(
                            await estimateUserOperationGas(prepareClient, estimateParameters),
                        ),
                };
                return prepareUserOperation(
                    bufferingClient as typeof prepareClient,
                    prepareParameters as Parameters<typeof prepareUserOperation>[1],
                );
            },
        },
    });
    smartAccountClientPrimers.set(client, () => Promise.allSettled([getGasPrice(), getStubData()]));
    smartAccountClientCacheResets.set(client, () => {
        gasPrice.clear();
        stubData.clear();
    });
    return client;
}

/** Memoizes a promise-returning fetch for `ttlMs`; a rejected fetch is not cached. */
function cachedForTtl<T>(
    fetch: () => Promise<T>,
    ttlMs: number,
): { get: () => Promise<T>; clear: () => void } {
    let cached: { fetchedAt: number; result: Promise<T> } | undefined;
    return {
        get: () => {
            if (!cached || Date.now() - cached.fetchedAt >= ttlMs) {
                const entry = { fetchedAt: Date.now(), result: fetch() };
                cached = entry;
                entry.result.catch(() => {
                    if (cached === entry) cached = undefined;
                });
            }
            return cached.result;
        },
        clear: () => {
            cached = undefined;
        },
    };
}

function addUserOperationGasBuffer(gas: bigint): bigint {
    const percentBuffer = (gas * USER_OPERATION_GAS_BUFFER_BPS) / 10_000n;
    return (
        gas +
        (percentBuffer > USER_OPERATION_MIN_GAS_BUFFER
            ? percentBuffer
            : USER_OPERATION_MIN_GAS_BUFFER)
    );
}

/**
 * Pads account gas limits (+20%, 50k floor) before sponsorship. Paymaster
 * limits are left alone: the paymaster sets and signs its own.
 */
function bufferPolyesterUserOperationGas<
    T extends { callGasLimit?: bigint; preVerificationGas?: bigint; verificationGasLimit?: bigint },
>(gas: T): T {
    return {
        ...gas,
        ...(typeof gas.callGasLimit === "bigint"
            ? { callGasLimit: addUserOperationGasBuffer(gas.callGasLimit) }
            : {}),
        ...(typeof gas.preVerificationGas === "bigint"
            ? { preVerificationGas: addUserOperationGasBuffer(gas.preVerificationGas) }
            : {}),
        ...(typeof gas.verificationGasLimit === "bigint"
            ? { verificationGasLimit: addUserOperationGasBuffer(gas.verificationGasLimit) }
            : {}),
    };
}

/**
 * Warms the network path for an upcoming submission: primes the gas-price and
 * paymaster-stub caches and opens connections to the RPC endpoint. Never
 * throws; the nonce is intentionally not cached — fetching it here is
 * connection warm-up only.
 */
export async function warmPolyesterSmartAccountClient(
    client: PolyesterSmartAccountClient,
): Promise<void> {
    await Promise.allSettled([
        smartAccountClientPrimers.get(client)?.(),
        client.account.getNonce(),
        client.account.isDeployed(),
    ]);
}

export type PolyesterUserOperationPhase = "prepare" | "sign" | "send" | "receipt";

export interface SendPolyesterUserOperationOptions {
    /**
     * Fires once per submission, immediately before the wallet is asked to
     * sign the fully prepared operation — the prepare→sign boundary.
     */
    onWalletSignatureRequested?: () => void;
    /**
     * Reports how long each submission phase took. `prepare` covers nonce,
     * fees and sponsorship; `sign` the wallet signature; `send`
     * `eth_sendUserOperation`. Pass the same callback to
     * {@link waitForPolyesterUserOperationReceipt} to get `receipt`.
     */
    onPhase?: (phase: PolyesterUserOperationPhase, ms: number) => void;
}

export async function sendPolyesterUserOperation(
    client: PolyesterSmartAccountClient,
    parameters: Parameters<PolyesterSmartAccountClient["sendUserOperation"]>[0],
    options: SendPolyesterUserOperationOptions = {},
): Promise<Awaited<ReturnType<PolyesterSmartAccountClient["sendUserOperation"]>>> {
    const { onWalletSignatureRequested, onPhase } = options;
    const account =
        (parameters as { account?: SafeSmartAccountInstance }).account ?? client.account;
    let phaseStartedAt = Date.now();
    const endPhase = (phase: PolyesterUserOperationPhase) => {
        const now = Date.now();
        reportPhase(onPhase, phase, now - phaseStartedAt);
        phaseStartedAt = now;
    };
    let signed = false;
    try {
        const hash = await client.sendUserOperation({
            ...parameters,
            account: {
                ...account,
                signUserOperation: async (
                    userOperation: Parameters<SafeSmartAccountInstance["signUserOperation"]>[0],
                ) => {
                    endPhase("prepare");
                    onWalletSignatureRequested?.();
                    const signature = await account.signUserOperation(userOperation);
                    signed = true;
                    endPhase("sign");
                    return signature;
                },
            },
        } as Parameters<PolyesterSmartAccountClient["sendUserOperation"]>[0]);
        endPhase("send");
        return hash;
    } catch (error) {
        // Only a failure after signing (i.e. from `eth_sendUserOperation`) can
        // mean the bundler rejected the cached gas price or stub. Earlier
        // failures — a cancelled wallet prompt above all — keep both caches so
        // the retry stays cheap.
        if (signed) smartAccountClientCacheResets.get(client)?.();
        throw error;
    }
}

/** Observers must never affect the result: a throwing `onPhase` is swallowed. */
function reportPhase(
    onPhase: SendPolyesterUserOperationOptions["onPhase"],
    phase: PolyesterUserOperationPhase,
    ms: number,
): void {
    try {
        onPhase?.(phase, ms);
    } catch {
        // ignore
    }
}

export interface WaitForPolyesterUserOperationReceiptOptions {
    /** Overall deadline in milliseconds. Defaults to viem's 120s. */
    timeoutMs?: number;
    /** Receives `("receipt", ms)` once the receipt is available. */
    onPhase?: SendPolyesterUserOperationOptions["onPhase"];
}

/**
 * Waits for a UserOperation to land. Polls the bundler's cheap
 * `pimlico_getUserOperationStatus` at the client's polling interval, checking
 * immediately, and only fetches the receipt once the bundler reports it has
 * been mined. Status lives in bundler memory, so `not_found` (e.g. after a
 * bundler restart) also checks the chain for a receipt until the deadline.
 * `timeoutMs` bounds every request, not just the gaps between them.
 */
export async function waitForPolyesterUserOperationReceipt(
    client: PolyesterSmartAccountClient,
    hash: `0x${string}`,
    options: WaitForPolyesterUserOperationReceiptOptions = {},
): Promise<Awaited<ReturnType<PolyesterSmartAccountClient["waitForUserOperationReceipt"]>>> {
    const { timeoutMs = 120_000, onPhase } = options;
    const startedAt = Date.now();
    const deadline = startedAt + timeoutMs;
    const timedOut = () => new Error(`Timed out waiting for UserOperation ${hash}.`);
    const untilDeadline = <T>(fn: () => Promise<T>): Promise<T> => {
        const timeout = deadline - Date.now();
        if (timeout <= 0) return Promise.reject(timedOut());
        return withTimeout(fn, { timeout, errorInstance: timedOut() });
    };
    const statusClient = client as unknown as Parameters<typeof getUserOperationStatus>[0];

    let consecutiveNotFound = 0;
    for (;;) {
        const { status } = await untilDeadline(() =>
            getUserOperationStatus(statusClient, { hash }),
        );
        if (status === "included" || status === "reverted") {
            const receipt = await untilDeadline(() =>
                client.waitForUserOperationReceipt({ hash, timeout: deadline - Date.now() }),
            );
            reportPhase(onPhase, "receipt", Date.now() - startedAt);
            return receipt;
        }
        if (status === "failed") {
            throw new Error(
                `UserOperation ${hash} was bundled but the bundle transaction reverted; it was not executed.`,
            );
        }
        if (status === "rejected") {
            // Re-simulation failures are often fee-too-low: drop cached prices.
            smartAccountClientCacheResets.get(client)?.();
            throw new Error(`UserOperation ${hash} was rejected by the bundler.`);
        }
        if (status === "not_found") {
            if (consecutiveNotFound++ % NOT_FOUND_RECEIPT_CHECK_EVERY === 0) {
                const receipt = await untilDeadline(() =>
                    client.getUserOperationReceipt({ hash }),
                ).catch((error: Error) => {
                    if (error.name === "UserOperationReceiptNotFoundError") return undefined;
                    throw error;
                });
                if (receipt) {
                    reportPhase(onPhase, "receipt", Date.now() - startedAt);
                    return receipt;
                }
            }
        } else {
            consecutiveNotFound = 0;
        }
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw timedOut();
        await new Promise((resolve) =>
            setTimeout(resolve, Math.min(client.pollingInterval, remaining)),
        );
    }
}
