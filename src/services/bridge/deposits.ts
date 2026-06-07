import type { DepositAddress } from "./types.js";

export interface DepositsServiceConfig {
    baseUrl: string;
    getToken: () => string | null;
}

export interface AddDepositWalletParams {
    chainId: number;
}

export class DepositsService {
    _config: DepositsServiceConfig;

    constructor(config: DepositsServiceConfig) {
        this._config = config;
    }

    async getAddresses(): Promise<DepositAddress[]> {
        // TODO: implement - GET /user/deposit-addresses
        throw new Error("Not implemented");
    }

    async getAddressByChain(_chainId: number): Promise<DepositAddress | null> {
        // TODO: implement - GET /user/deposit-addresses/:chainId
        throw new Error("Not implemented");
    }

    async addWallet(_params: AddDepositWalletParams): Promise<DepositAddress> {
        // TODO: implement - POST /user/deposit-wallets
        throw new Error("Not implemented");
    }
}
