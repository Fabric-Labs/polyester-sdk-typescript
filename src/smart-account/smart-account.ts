import type { Address, LocalAccount, PublicClient } from "viem";
import { createPublicClient, http } from "viem";
import type { EstimateUserOperationGasParameters } from "viem/account-abstraction";
import { estimateUserOperationGas, prepareUserOperation } from "viem/account-abstraction";
import { createSmartAccountClient } from "permissionless";
import { toSafeSmartAccount } from "permissionless/accounts";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import type { PolyesterEnvironment } from "../environment.js";
import { predictSafeAddress } from "../account-signer/predict-safe-address.js";

export type SafeSmartAccountInstance = Awaited<ReturnType<typeof toSafeSmartAccount>>;
export type PolyesterSmartAccountClient = ReturnType<typeof createPolyesterSmartAccountClient>;

const smartAccountEnvironmentFingerprints = new WeakMap<SafeSmartAccountInstance, string>();
const smartAccountClientGasPricePrimers = new WeakMap<object, () => Promise<unknown>>();
const USER_OPERATION_GAS_BUFFER_BPS = 2_000n;
const USER_OPERATION_MIN_GAS_BUFFER = 50_000n;
const USER_OPERATION_GAS_PRICE_TTL_MS = 10_000;
const USER_OPERATION_RECEIPT_POLLING_INTERVAL_MS = 1_000;

type PolyesterUserOperationGas = {
    callGasLimit?: bigint;
    preVerificationGas?: bigint;
    verificationGasLimit?: bigint;
    paymasterPostOpGasLimit?: bigint;
    paymasterVerificationGasLimit?: bigint;
};

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
    /** How long a fetched gas price is reused, in milliseconds. Defaults to 10s. */
    gasPriceCacheTtlMs?: number;
    /** How often to poll for UserOperation receipts, in milliseconds. Defaults to 1s. */
    pollingIntervalMs?: number;
}

/**
 * Creates a viem client bound to a Polyester smart account.
 */
export function createPolyesterSmartAccountClient(
    account: SafeSmartAccountInstance,
    params: {
        environment: PolyesterEnvironment;
        options?: PolyesterSmartAccountClientOptions;
    },
) {
    const { environment, options } = params;
    const {
        gasPriceCacheTtlMs = USER_OPERATION_GAS_PRICE_TTL_MS,
        pollingIntervalMs = USER_OPERATION_RECEIPT_POLLING_INTERVAL_MS,
    } = options ?? {};
    const accountEnvironmentFingerprint = smartAccountEnvironmentFingerprints.get(account);
    if (
        accountEnvironmentFingerprint &&
        accountEnvironmentFingerprint !== environment.fingerprint
    ) {
        throw new Error("Smart account environment does not match client environment.");
    }

    const paymaster = createPimlicoClient({
        chain: environment.chain,
        transport: http(environment.accountAbstraction.paymasterUrl),
        entryPoint: environment.accountAbstraction.entryPoint,
    });

    let cachedGasPrice:
        | { fetchedAt: number; result: ReturnType<typeof paymaster.getUserOperationGasPrice> }
        | undefined;
    const getGasPrice = () => {
        if (!cachedGasPrice || Date.now() - cachedGasPrice.fetchedAt >= gasPriceCacheTtlMs) {
            const result = paymaster.getUserOperationGasPrice();
            const entry = { fetchedAt: Date.now(), result };
            cachedGasPrice = entry;
            result.catch(() => {
                if (cachedGasPrice === entry) cachedGasPrice = undefined;
            });
        }
        return cachedGasPrice.result;
    };

    const client = createSmartAccountClient({
        account,
        chain: environment.chain,
        paymaster,
        bundlerTransport: http(environment.accountAbstraction.bundlerUrl),
        pollingInterval: pollingIntervalMs,
        userOperation: {
            estimateFeesPerGas: async () => (await getGasPrice()).fast,
            // Single prepare pass: viem resolves gas estimation via
            // `getAction(client, estimateUserOperationGas, ...)`, so handing
            // `prepareUserOperation` a client whose estimate action buffers the
            // result makes the buffered limits flow into `pm_getPaymasterData`
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
    smartAccountClientGasPricePrimers.set(client, getGasPrice);
    return client;
}

/**
 * Warms the network path for an upcoming submission: primes the gas-price
 * cache and opens connections to the RPC endpoint. Never throws; the nonce is
 * intentionally not cached — fetching it here is connection warm-up only.
 */
export async function warmPolyesterSmartAccountClient(
    client: PolyesterSmartAccountClient,
): Promise<void> {
    await Promise.allSettled([
        smartAccountClientGasPricePrimers.get(client)?.(),
        client.account.getNonce(),
        client.account.isDeployed(),
    ]);
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

function bufferPolyesterUserOperationGas<T extends PolyesterUserOperationGas>(gas: T): T {
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
        ...(typeof gas.paymasterPostOpGasLimit === "bigint"
            ? { paymasterPostOpGasLimit: addUserOperationGasBuffer(gas.paymasterPostOpGasLimit) }
            : {}),
        ...(typeof gas.paymasterVerificationGasLimit === "bigint"
            ? {
                  paymasterVerificationGasLimit: addUserOperationGasBuffer(
                      gas.paymasterVerificationGasLimit,
                  ),
              }
            : {}),
    };
}

export interface SendPolyesterUserOperationOptions {
    /**
     * Fires once per submission, immediately before the wallet is asked to
     * sign the fully prepared operation — the prepare→sign boundary.
     */
    onWalletSignatureRequested?: () => void;
}

export async function sendPolyesterUserOperation(
    client: PolyesterSmartAccountClient,
    parameters: Parameters<PolyesterSmartAccountClient["sendUserOperation"]>[0],
    options: SendPolyesterUserOperationOptions = {},
): Promise<Awaited<ReturnType<PolyesterSmartAccountClient["sendUserOperation"]>>> {
    const { onWalletSignatureRequested } = options;
    if (!onWalletSignatureRequested) return client.sendUserOperation(parameters);

    const account =
        (parameters as { account?: SafeSmartAccountInstance }).account ?? client.account;
    return client.sendUserOperation({
        ...parameters,
        account: {
            ...account,
            signUserOperation: (
                userOperation: Parameters<SafeSmartAccountInstance["signUserOperation"]>[0],
            ) => {
                onWalletSignatureRequested();
                return account.signUserOperation(userOperation);
            },
        },
    } as Parameters<PolyesterSmartAccountClient["sendUserOperation"]>[0]);
}
