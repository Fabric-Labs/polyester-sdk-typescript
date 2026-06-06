import * as Proto from "../../gen/marketdata/v1/marketdata_pb.js";
import { connectProtoChannel } from "../../realtime/client.js";
import { createClient, type Client, type Transport } from "@connectrpc/connect";
import { z } from "zod";
import type { BaseSubscribeInput } from "../../shared/types";
import { getPair } from "../../catalogs/market-data-catalog.js";
import {
	GetMarketTradesInputSchema,
	MarketTradeSchema,
	type SpotConfig,
	SpotConfigSchema,
	type MarketTrade,
} from "./market-data.schemas";
import { isDev } from "../../utils/is-dev";
import type { LocalMockRuntime } from "../../mock/local-mock-runtime.js";

interface SubscribeTradesInput extends BaseSubscribeInput<MarketTrade> {
	symbol: string;
}

export class MarketDataService {
	#client: Client<typeof Proto.MarketDataService>;
	#localMock?: LocalMockRuntime;

	constructor(transport: Transport, localMock?: LocalMockRuntime) {
		this.#client = createClient(Proto.MarketDataService, transport);
		this.#localMock = localMock;
	}

	async getTrades(input: z.input<typeof GetMarketTradesInputSchema>): Promise<MarketTrade[]> {
		if (this.#localMock?.isEnabled()) {
			return this.#localMock.world.getMarketTrades(input);
		}
		const validatedInput = GetMarketTradesInputSchema.parse(input);
		const res = await this.#client.getTrades(validatedInput);
		return z.array(MarketTradeSchema).parse(res.trades);
	}

	async getSpotConfig(): Promise<SpotConfig> {
		const res = await this.#client.getSpotConfig({});
		return SpotConfigSchema.parse(res);
	}

	subscribeTrades(input: SubscribeTradesInput): () => void {
		if (this.#localMock?.isEnabled()) {
			return this.#localMock.world.subscribeMarketTrades(input);
		}
		const pair = getPair(input.symbol);
		if (!pair) {
			if (isDev()) {
				console.error(`[MarketDataService] Unknown symbol: ${input.symbol}`);
			}
			return () => {};
		}

		const channel = `public:spot:market:trades:${pair.symbolId}:proto`;
		return connectProtoChannel({
			channel,
			schema: Proto.MarketTradeSchema,
			onPublication: (data) => {
				const trade = MarketTradeSchema.parse(data);
				input.onEvent(trade);
			},
			onConnected: () => input.onOpen?.(),
			onDisconnected: () => input.onClose?.(),
			onError: (error) => {
				if (isDev()) {
					console.error("Market trades subscription error", error);
				}
				input.onError?.(error);
			},
		});
	}
}
