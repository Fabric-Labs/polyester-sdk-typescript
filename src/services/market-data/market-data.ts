import * as Proto from "../../gen/marketdata/v1/marketdata_pb.js";
import { connectProtoChannel } from "../../realtime/client.js";
import { createClient, type Client, type Transport } from "@connectrpc/connect";
import * as v from "valibot";
import type { BaseSubscribeInput } from "../../shared/types.js";
import { getPair } from "../../catalogs/market-data-catalog.js";
import {
    GetMarketTradesInputSchema,
    MarketTradeSchema,
    type SpotConfig,
    SpotConfigSchema,
    type MarketTrade,
} from "./market-data.schemas.js";
import { isDev } from "../../utils/is-dev.js";

interface SubscribeTradesInput extends BaseSubscribeInput<MarketTrade> {
    symbol: string;
}

export class MarketDataService {
    #client: Client<typeof Proto.MarketDataService>;

    constructor(transport: Transport) {
        this.#client = createClient(Proto.MarketDataService, transport);
    }

    async getTrades(
        input: v.InferInput<typeof GetMarketTradesInputSchema>,
    ): Promise<MarketTrade[]> {
        const validatedInput = v.parse(GetMarketTradesInputSchema, input);
        const res = await this.#client.getTrades(validatedInput);
        return v.parse(v.array(MarketTradeSchema), res.trades);
    }

    async getSpotConfig(): Promise<SpotConfig> {
        const res = await this.#client.getSpotConfig({});
        return v.parse(SpotConfigSchema, res);
    }

    subscribeTrades(input: SubscribeTradesInput): () => void {
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
                const trade = v.parse(MarketTradeSchema, data);
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
