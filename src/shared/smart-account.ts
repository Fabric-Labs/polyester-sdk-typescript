import type { LocalAccount, PublicClient } from "viem";
import { createPublicClient, http } from "viem";
import { createSmartAccountClient } from "permissionless";
import { toSafeSmartAccount } from "permissionless/accounts";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import type { PolyesterEnvironment } from "../environment.js";

export type SafeSmartAccountInstance = Awaited<ReturnType<typeof toSafeSmartAccount>>;
export type PolyesterSmartAccountClient = ReturnType<typeof createPolyesterSmartAccountClient>;

const smartAccountEnvironmentFingerprints = new WeakMap<SafeSmartAccountInstance, string>();

export interface CreateSmartAccountParams {
    environment: PolyesterEnvironment;
    owner: LocalAccount;
    saltNonce?: bigint;
    publicClient?: PublicClient;
}

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
            estimateFeesPerGas: async () =>
                (await paymaster.getUserOperationGasPrice()).fast,
        },
    });
}
