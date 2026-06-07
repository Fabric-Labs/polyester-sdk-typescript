export { PolyesterClient } from "./core-client.js";
export type { PolyesterClientConfig, PolyesterRealtimeAuthConfig } from "./core-client.js";

export { PolyesterBrowserClient } from "./browser-client.js";
export type { PolyesterBrowserClientConfig } from "./browser-client.js";

export {
    PolyesterServerClient,
    createPolyesterServerClient,
    createPolyesterServerClientFromCookies,
    createPolyesterServerClientFromRequest,
} from "./server-client.js";
export type {
    CreateServerClientFromCookiesParams,
    CreateServerClientFromRequestParams,
    PolyesterServerClientConfig,
    ServerSessionSnapshot,
} from "./server-client.js";

export { POLYESTER_TESTNET_ENVIRONMENT, createPolyesterEnvironment } from "./environment.js";
export type {
    CreatePolyesterEnvironmentParams,
    PolyesterAccountAbstractionEnvironment,
    PolyesterContractsEnvironment,
    PolyesterEntryPointConfig,
    PolyesterEnvironment,
    PolyesterSafeDeploymentConfig,
} from "./environment.js";

export { createPolyesterAccountSigner } from "./account-signer/index.js";
export type {
    AccountSigner,
    AccountSignerConfig,
    AccountSignerFactory,
    CreatePolyesterAccountSignerParams,
    HexAddress,
} from "./account-signer/index.js";

export { createPolyesterSmartAccount, createPolyesterSmartAccountClient } from "./smart-account.js";
export type {
    CreateSmartAccountParams,
    PolyesterSmartAccountClient,
    SafeSmartAccountInstance,
} from "./smart-account.js";

export type { ApiKeyEd25519AuthProvider, JwtAuthProvider } from "./shared/transports.js";
export type {
    PolyesterMutationOptions,
    PolyesterRequestOptions,
} from "./shared/request-options.js";
export type {
    ActiveAccountInfo,
    AuthHydrationData,
    AuthLoginMethod,
    AuthState,
    SessionData,
} from "./services/auth/session.types.js";

export type * from "./services/accounts/accounts.types.js";
export type * from "./services/address-book/address-book.types.js";
export type * from "./services/api-keys/api-keys.types.js";
export type * from "./services/auth/auth.types.js";
export type * from "./services/auth/profile/profile.types.js";
export type * from "./services/balances/balances.types.js";
export type * from "./services/candles/candles.types.js";
export type * from "./services/deposit/deposit.types.js";
export type * from "./services/guard-signer/guard-signer.types.js";
export type * from "./services/heatmap/heatmap.types.js";
export type * from "./services/internal-transfers/internal-transfers.types.js";
export type * from "./services/lifecycle/lifecycle.types.js";
export type * from "./services/market-data/market-data.types.js";
export type * from "./services/market-overview/market-overview.types.js";
export type * from "./services/mfa/mfa.types.js";
export type * from "./services/orderbook/orderbook.types.js";
export type * from "./services/orders/orders.types.js";
export type * from "./services/policies/api-key-policies/api-key-policies.types.js";
export type * from "./services/policies/policies.types.js";
export type * from "./services/policies/subaccount-policies/subaccount-policies.types.js";
export type * from "./services/social-verification/social-verification.types.js";
export type * from "./services/subaccounts/subaccounts.types.js";
export type * from "./services/trades/trades.types.js";
export type * from "./services/trading-withdraws/trading-withdraws.types.js";
export type * from "./services/transfers/transfers.types.js";
export type * from "./services/triggers/triggers.types.js";
export type * from "./services/whiteboard/whiteboard.types.js";
export type * from "./services/zipper/zipper.types.js";
