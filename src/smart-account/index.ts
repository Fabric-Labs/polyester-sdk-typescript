export {
    createPolyesterSmartAccount,
    createPolyesterSmartAccountClient,
    predictPolyesterSmartAccountAddress,
    sendPolyesterUserOperation,
    waitForPolyesterUserOperationReceipt,
    warmPolyesterSmartAccountClient,
} from "./smart-account.js";
export type {
    CreateSmartAccountParams,
    PredictPolyesterSmartAccountAddressParams,
    PolyesterSmartAccountClient,
    PolyesterSmartAccountClientOptions,
    SafeSmartAccountInstance,
    PolyesterUserOperationPhase,
    SendPolyesterUserOperationOptions,
    WaitForPolyesterUserOperationReceiptOptions,
} from "./smart-account.js";

/**
 * Resolves once this subpath (and the permissionless/viem graph beneath it)
 * has been evaluated. Call it early, e.g. on form mount, so the code is
 * already loaded by the time a user submits.
 */
export async function preloadSmartAccountSdk(): Promise<void> {}
