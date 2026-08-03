import type { Address, LocalAccount, PublicClient } from "viem";
import { createPublicClient, http } from "viem";
import { createSmartAccountClient } from "permissionless";
import { toSafeSmartAccount } from "permissionless/accounts";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import type { PolyesterEnvironment } from "../environment.js";
import { predictSafeAddress } from "../account-signer/predict-safe-address.js";

export type SafeSmartAccountInstance = Awaited<ReturnType<typeof toSafeSmartAccount>>;
export type PolyesterSmartAccountClient = ReturnType<typeof createPolyesterSmartAccountClient>;

const smartAccountEnvironmentFingerprints = new WeakMap<SafeSmartAccountInstance, string>();
const USER_OPERATION_GAS_BUFFER_BPS = 2_000n;
const USER_OPERATION_MIN_GAS_BUFFER = 50_000n;

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

/**
 * Creates a viem client bound to a Polyester smart account.
 */
export function createPolyesterSmartAccountClient(
    account: SafeSmartAccountInstance,
    params: { environment: PolyesterEnvironment },
) {
    const { environment } = params;
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

    return createSmartAccountClient({
        account,
        chain: environment.chain,
        paymaster,
        bundlerTransport: http(environment.accountAbstraction.bundlerUrl),
        userOperation: {
            estimateFeesPerGas: async () => (await paymaster.getUserOperationGasPrice()).fast,
        },
    });
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

export async function sendPolyesterUserOperation(
    client: PolyesterSmartAccountClient,
    parameters: Parameters<PolyesterSmartAccountClient["sendUserOperation"]>[0],
): Promise<Awaited<ReturnType<PolyesterSmartAccountClient["sendUserOperation"]>>> {
    try {
        const gas = await client.estimateUserOperationGas({
            callGasLimit: 0n,
            preVerificationGas: 0n,
            verificationGasLimit: 0n,
            ...parameters,
        } as Parameters<PolyesterSmartAccountClient["estimateUserOperationGas"]>[0]);
        return client.sendUserOperation({
            ...parameters,
            ...bufferPolyesterUserOperationGas(gas),
        } as Parameters<PolyesterSmartAccountClient["sendUserOperation"]>[0]);
    } catch {
        return client.sendUserOperation(parameters);
    }
}
