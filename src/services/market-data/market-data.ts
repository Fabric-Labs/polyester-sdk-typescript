import * as Proto from "../../gen/marketdata/v1/marketdata_pb.js";
import type { RealtimeClient } from "../../realtime/client.js";
import { createClient, type Client, type Transport } from "@connectrpc/connect";
import * as v from "valibot";
import type { BaseSubscribeInput } from "../../shared/types.js";
import {
    toConnectCallOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
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
    #realtime: RealtimeClient;

    constructor(transport: Transport, realtime: RealtimeClient) {
        this.#client = createClient(Proto.MarketDataService, transport);
        this.#realtime = realtime;
    }

    async listTrades(
        input: v.InferInput<typeof GetMarketTradesInputSchema>,
        options?: PolyesterRequestOptions,
    ): Promise<MarketTrade[]> {
        const validatedInput = v.parse(GetMarketTradesInputSchema, input);
        const res = await this.#client.getTrades(validatedInput, toConnectCallOptions(options));
        return v.parse(v.array(MarketTradeSchema), res.trades);
    }

    async getSpotConfig(options?: PolyesterRequestOptions): Promise<SpotConfig> {
        const res = await this.#client.getSpotConfig({}, toConnectCallOptions(options));
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
        return this.#realtime.connectProtoChannel({
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
