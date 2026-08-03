export { PolyesterClient } from "./core-client.js";
export type {
    PolyesterClientBaseConfig,
    PolyesterClientConfig,
    PolyesterRealtimeAuthConfig,
} from "./core-client.js";

export { PolyesterBrowserClient } from "./browser-client.js";
export type { PolyesterBrowserClientConfig } from "./browser-client.js";
export {
    createCookieAuthTokenStorage,
    createMemoryAuthTokenStorage,
} from "./services/auth/token-storage.js";
export type {
    AuthTokenStorage,
    AuthTokenStorageSetOptions,
    CookieAuthTokenStorageOptions,
} from "./services/auth/token-storage.js";

export {
    PolyesterServerClient,
    createPolyesterServerClientFromCookies,
    createPolyesterServerClientFromRequest,
} from "./server-client.js";
// Re-exported from their leaf module (not server-client.js) so barrel
// consumers that only need cookie names never retain the client graph.
export {
    POLYESTER_AUTH_TOKEN_COOKIE_NAME,
    POLYESTER_SESSION_COOKIE_NAME,
} from "./services/auth/cookie-constants.js";
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

// createPolyesterAccountSigner moved to the "./account-signer" subpath export.
// A value re-export here would anchor its viem abi/typed-data graph (~170 KB
// emitted) into every bundle that statically imports this barrel — i.e. the
// app shell — even for consumers that load it lazily. Type exports are free.
export type {
    AccountSigner,
    AccountSignerConfig,
    AccountSignerFactory,
    CreatePolyesterAccountSignerParams,
    HexAddress,
} from "./account-signer/index.js";

export type {
    ApiKeyEd25519AuthProvider,
    JwtAuthProvider,
    Transports,
} from "./shared/transports.js";
export type {
    ConnectChannelParams,
    PolyesterRealtime,
    SubscribeHandlers,
} from "./realtime/index.js";
export type { SdkSubscriptionErrorContext } from "./shared/subscription-errors.js";
export type { AccountScope, AccountScopedInput } from "./shared/account-scope.js";
export type { AccountCodeValue, TransferCodeValue } from "./shared/ledger-codes.js";
export type {
    PolyesterMutationOptions,
    PolyesterRequestOptions,
} from "./shared/request-options.js";
export {
    AlreadyExistsError,
    AuthenticationError,
    ConfigurationError,
    errorFromHttpStatus,
    InternalServerError,
    isAbortError,
    MfaEnrollmentRequiredError,
    MfaLastFactorRequiredError,
    MfaRequiredError,
    MfaVerificationError,
    NetworkError,
    normalizeErrorMessage,
    PermissionError,
    PolicyInUseError,
    PolicyLockedError,
    PolicyScopeMismatchError,
    PolyesterError,
    PreconditionFailedError,
    RateLimitError,
    RequestError,
    ResourceNotFoundError,
    RevisionConflictError,
    ServiceUnavailableError,
    SessionElevationRequiredError,
    StaleQuoteError,
    StepUpRequiredError,
    TimeoutError,
    TransientError,
    ValidationError,
} from "./shared/errors.js";
export type {
    PolyesterErrorCode,
    PolyesterErrorOptions,
    RateLimitErrorOptions,
    MfaVerificationFailureReason,
} from "./shared/errors.js";
export {
    connectErrorToPolyesterError,
    createErrorMappingInterceptor,
    toPolyesterError,
} from "./shared/connect-error-mapping.js";
export {
    isFreshStepUpRequiredError,
    isMfaLastFactorRequiredError,
    isMfaEnrollmentRequiredError,
    isSessionElevationRequiredError,
} from "./utils/connect-mfa-errors.js";
export { isStaleQuoteError } from "./utils/connect-order-errors.js";
export {
    formatConnectError,
    formatUserFacingError,
    isPolicyInUseError,
    isPolicyLockedError,
    isPolicyScopeMismatchError,
    isResourceNotFoundError,
    isRevisionConflictError,
    isRetryableError,
} from "./utils/errors.js";
export {
    columnarTimestampSecAt,
    expandColumnarTimestampsSec,
    type ColumnarTimeWindow,
} from "./utils/columnar-time.js";
export { mergeLedgerBalances } from "./services/balances/balances.merge.js";
export {
    compareUnsignedIntegerStrings,
    shouldApplyReconciliationUpdate,
} from "./shared/reconciliation.js";
export { validateCreateAddressBookEntryInput } from "./services/address-book/address-book.schemas.js";
export { tsObjToNsString as timestampToNanoseconds } from "./utils/time.js";
export {
    checksumEvmAddress,
    evmHexToBytes,
    evmUtf8ToBytes,
    evmUtf8ToHex,
    isEvmAddress,
    isEvmAddressStrict,
    keccak256Hex,
} from "./utils/evm.js";
export type { EvmHex } from "./utils/evm.js";
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
export type * from "./services/chain-analytics/chain-analytics.types.js";
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
