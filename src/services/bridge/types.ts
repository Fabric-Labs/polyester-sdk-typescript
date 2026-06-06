/**
 * User's token balance on Polyester
 */
export interface TokenBalance {
	tokenId: string;
	symbol: string;
	name: string;
	amount: string;
	amountUsd: string;
	chainId: number;
	decimals: number;
}

/**
 * Supported blockchain network
 */
export interface Chain {
	id: number;
	name: string;
	symbol: string;
	isActive: boolean;
	explorerUrl?: string;
	rpcUrl?: string;
}

/**
 * Token available for deposit/withdrawal
 */
export interface Token {
	id: string;
	symbol: string;
	name: string;
	decimals: number;
	chainId: number;
	contractAddress: string;
	logoUrl?: string;
	isActive: boolean;
}

/**
 * Deposit or withdrawal transaction
 */
export interface Transaction {
	id: string;
	hash: string;
	type: "deposit" | "withdrawal";
	status: "pending" | "confirmed" | "failed";
	tokenSymbol: string;
	amount: string;
	chainId: number;
	fromAddress: string;
	toAddress: string;
	createdAt: Date;
	confirmedAt?: Date;
}

/**
 * Fee information for a token
 */
export interface Fee {
	tokenId: string;
	symbol: string;
	depositFee: string;
	withdrawalFee: string;
	minDeposit: string;
	minWithdrawal: string;
}

/**
 * Additional network/processing fees
 */
export interface ExtraFee {
	chainId: number;
	networkFee: string;
	processingFee: string;
}

/**
 * Deposit address for a specific chain
 */
export interface DepositAddress {
	chainId: number;
	address: string;
	memo?: string;
}

export interface UserProfile {
	walletAddress: string;
	username?: string;
	email?: string;
	createdAt: Date;
}

export interface PaginationParams {
	page?: number;
	limit?: number;
}

export interface PaginatedResponse<T> {
	data: T[];
	total: number;
	page: number;
	limit: number;
	hasMore: boolean;
}
