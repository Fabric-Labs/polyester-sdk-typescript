import type { Chain } from "./types.js";

export interface ChainsServiceConfig {
    baseUrl: string;
    getToken: () => string | null;
}

export class ChainsService {
    _config: ChainsServiceConfig;

    constructor(config: ChainsServiceConfig) {
        this._config = config;
    }

    async list(): Promise<Chain[]> {
        // TODO: implement - GET /chains
        throw new Error("Not implemented");
    }

    async get(_chainId: number): Promise<Chain | null> {
        // TODO: implement - GET /chains/:chainId
        throw new Error("Not implemented");
    }

    async getDetails(_chainId: number): Promise<Chain | null> {
        // TODO: implement - GET /chains/:chainId/details
        throw new Error("Not implemented");
    }
}
