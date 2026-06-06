import type { TokenBalance } from "./types.js";

export interface BalancesServiceConfig {
	baseUrl: string;
	getToken: () => string | null;
}

export class BalancesService {
	_config: BalancesServiceConfig;

	constructor(config: BalancesServiceConfig) {
		this._config = config;
	}

	async list(): Promise<TokenBalance[]> {
		// TODO: implement - GET /user/balances
		throw new Error("Not implemented");
	}

	async getByToken(_tokenId: string): Promise<TokenBalance | null> {
		// TODO: implement - GET /user/balances/:tokenId
		throw new Error("Not implemented");
	}

	async getByChain(_chainId: number): Promise<TokenBalance[]> {
		// TODO: implement - GET /user/balances?chainId=:chainId
		throw new Error("Not implemented");
	}
}
