import type { Fee, ExtraFee } from "./types.js";

export interface FeesServiceConfig {
	baseUrl: string;
	getToken: () => string | null;
}

export interface GetExtraFeesParams {
	chainId: number;
	tokenId?: string;
	amount?: string;
}

export class FeesService {
	_config: FeesServiceConfig;

	constructor(config: FeesServiceConfig) {
		this._config = config;
	}

	async list(): Promise<Fee[]> {
		// TODO: implement - GET /fees
		throw new Error("Not implemented");
	}

	async getByToken(_tokenId: string): Promise<Fee | null> {
		// TODO: implement - GET /fees/:tokenId
		throw new Error("Not implemented");
	}

	async getExtra(_params: GetExtraFeesParams): Promise<ExtraFee> {
		// TODO: implement - GET /fees/extra
		throw new Error("Not implemented");
	}
}
