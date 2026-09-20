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
 * Resolves once the smart-account implementation (and the permissionless/viem
 * graph beneath it) has been loaded and evaluated. Call it early, e.g. on
 * form mount, so the code is already there by the time a user submits. The
 * dynamic import keeps the dependency even when a bundler tree-shakes every
 * other export from this subpath.
 */
export async function preloadSmartAccountSdk(): Promise<void> {
    await import("./smart-account.js");
}
