import type { Transaction, PaginationParams, PaginatedResponse } from "./types.js";

export interface TransactionsServiceConfig {
    baseUrl: string;
    getToken: () => string | null;
}

export interface GetTransactionsParams extends PaginationParams {
    type?: "deposit" | "withdrawal";
    status?: "pending" | "confirmed" | "failed";
    tokenId?: string;
    chainId?: number;
}

export interface TrackTransactionParams {
    hash: string;
    chainId: number;
}

export class TransactionsService {
    _config: TransactionsServiceConfig;

    constructor(config: TransactionsServiceConfig) {
        this._config = config;
    }

    async list(_params?: GetTransactionsParams): Promise<PaginatedResponse<Transaction>> {
        // TODO: implement - GET /user/transactions
        throw new Error("Not implemented");
    }

    async get(_transactionId: string): Promise<Transaction | null> {
        // TODO: implement - GET /transactions/:id
        throw new Error("Not implemented");
    }

    async getByHash(_hash: string): Promise<Transaction | null> {
        // TODO: implement - GET /transactions/hash/:hash
        throw new Error("Not implemented");
    }

    async track(_params: TrackTransactionParams): Promise<Transaction> {
        // TODO: implement - POST /transactions/track
        throw new Error("Not implemented");
    }

    async getNetworkTransactions(
        _params?: PaginationParams,
    ): Promise<PaginatedResponse<Transaction>> {
        // TODO: implement - GET /transactions/network
        throw new Error("Not implemented");
    }

    async getTokenTransactions(
        _tokenId: string,
        _params?: PaginationParams,
    ): Promise<PaginatedResponse<Transaction>> {
        // TODO: implement - GET /transactions/token/:tokenId
        throw new Error("Not implemented");
    }
}
