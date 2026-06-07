import type { Token, PaginationParams, PaginatedResponse } from "./types.js";

export interface TokensServiceConfig {
    baseUrl: string;
    getToken: () => string | null;
}

export interface GetTokensParams extends PaginationParams {
    chainId?: number;
    search?: string;
    isActive?: boolean;
}

export interface TokenContractInfo {
    address: string;
    chainId: number;
    name: string;
    symbol: string;
    decimals: number;
    logoUrl?: string;
}

export class TokensService {
    _config: TokensServiceConfig;

    constructor(config: TokensServiceConfig) {
        this._config = config;
    }

    async list(_params?: GetTokensParams): Promise<PaginatedResponse<Token>> {
        // TODO: implement - GET /tokens
        throw new Error("Not implemented");
    }

    async get(_tokenId: string): Promise<Token | null> {
        // TODO: implement - GET /tokens/:tokenId
        throw new Error("Not implemented");
    }

    async getByContract(_chainId: number, _contractAddress: string): Promise<Token | null> {
        // TODO: implement - GET /tokens/contract/:chainId/:address
        throw new Error("Not implemented");
    }

    async getAllAddresses(): Promise<{ tokenId: string; addresses: Record<number, string> }[]> {
        // TODO: implement - GET /tokens/all-addresses
        throw new Error("Not implemented");
    }

    async getContractInfo(
        _chainId: number,
        _contractAddress: string,
    ): Promise<TokenContractInfo | null> {
        // TODO: implement - GET /list-token/token-contract/:chainId/:address
        throw new Error("Not implemented");
    }

    async getStats(): Promise<{
        totalTokens: number;
        totalVolume: string;
        totalTransactions: number;
    }> {
        // TODO: implement - GET /statistics
        throw new Error("Not implemented");
    }
}
