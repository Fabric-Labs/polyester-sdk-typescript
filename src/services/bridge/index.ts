// Services
export { BalancesService } from "./balances.js";
export type { BalancesServiceConfig } from "./balances.js";

export { DepositsService } from "./deposits.js";
export type { DepositsServiceConfig, AddDepositWalletParams } from "./deposits.js";

export { TransactionsService } from "./transactions.js";
export type {
	TransactionsServiceConfig,
	GetTransactionsParams,
	TrackTransactionParams,
} from "./transactions.js";

export { ChainsService } from "./chains.js";
export type { ChainsServiceConfig } from "./chains.js";

export { TokensService } from "./tokens.js";
export type { TokensServiceConfig, GetTokensParams, TokenContractInfo } from "./tokens.js";

export { FeesService } from "./fees.js";
export type { FeesServiceConfig, GetExtraFeesParams } from "./fees.js";

// Types - new names
export type {
	TokenBalance,
	Chain,
	Token,
	Transaction,
	Fee,
	ExtraFee,
	DepositAddress,
	UserProfile,
	PaginationParams,
	PaginatedResponse,
} from "./types.js";

// Internal - not part of public API
export { BridgeAuthService as _BridgeAuthService } from "./bridge-auth.js";
export type {
	BridgeAuthConfig as _BridgeAuthConfig,
	BridgeAuthState as _BridgeAuthState,
	BridgeAuthEvents as _BridgeAuthEvents,
} from "./bridge-auth.js";
