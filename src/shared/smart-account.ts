import type { LocalAccount, PublicClient } from "viem";
import { createSmartAccountClient } from "permissionless";
import { toSafeSmartAccount } from "permissionless/accounts";
import {
    BUNDLER_TRANSPORT,
    PAYMASTER_CLIENT,
    POLYCHAIN,
    POLYCHAIN_PUBLIC_CLIENT,
    SAFE_SMART_ACCOUNT_CONFIG,
} from "./config.js";

export type SafeSmartAccountInstance = Awaited<ReturnType<typeof toSafeSmartAccount>>;
export type PolyesterSmartAccountClient = ReturnType<typeof createPolyesterSmartAccountClient>;

export interface CreateSmartAccountParams {
    owner: LocalAccount;
    saltNonce?: bigint;
    publicClient?: PublicClient;
}

export async function createPolyesterSmartAccount({
    owner,
    saltNonce,
    publicClient = POLYCHAIN_PUBLIC_CLIENT,
}: CreateSmartAccountParams): Promise<SafeSmartAccountInstance> {
    return toSafeSmartAccount({
        client: publicClient,
        owners: [owner],
        saltNonce,
        ...SAFE_SMART_ACCOUNT_CONFIG,
    });
}

export function createPolyesterSmartAccountClient(account: SafeSmartAccountInstance) {
    return createSmartAccountClient({
        account,
        chain: POLYCHAIN,
        paymaster: PAYMASTER_CLIENT,
        bundlerTransport: BUNDLER_TRANSPORT,
        userOperation: {
            estimateFeesPerGas: async () =>
                (await PAYMASTER_CLIENT.getUserOperationGasPrice()).fast,
        },
    });
}
