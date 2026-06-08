import * as Proto from "../../gen/marketdata/v1/marketdata_pb.js";
import type { RealtimeClient } from "../../realtime/client.js";
import { createClient, type Client, type Transport } from "@connectrpc/connect";
import * as v from "valibot";
import type { BaseSubscribeInput } from "../../shared/types.js";
import {
    toConnectCallOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import { staticCatalog, type CatalogReader } from "../../catalogs/index.js";
import {
    createGetMarketTradesInputSchema,
    createMarketTradeSchema,
    type GetMarketTradesInputSchema,
    type SpotConfig,
    SpotConfigSchema,
    type MarketTrade,
} from "./market-data.schemas.js";
import { isDev } from "../../utils/is-dev.js";

interface SubscribeTradesInput extends BaseSubscribeInput<MarketTrade> {
    symbol: string;
}

/**
 * Exposes public spot trades, spot configuration, and live trade streams.
 */
export class MarketDataService {
    #client: Client<typeof Proto.MarketDataService>;
    #realtime: RealtimeClient;
    #catalog: CatalogReader;

    constructor(
        transport: Transport,
        realtime: RealtimeClient,
        catalog: CatalogReader = staticCatalog,
    ) {
        this.#client = createClient(Proto.MarketDataService, transport);
        this.#realtime = realtime;
        this.#catalog = catalog;
    }

    /**
     * Returns recent public trades for one spot market, ordered newest-first by execution timestamp with match id as a tie-breaker. Supports limit, time bounds, side filtering, and match-id pagination.
     */
    async listTrades(
        input: v.InferInput<typeof GetMarketTradesInputSchema>,
        options?: PolyesterRequestOptions,
    ): Promise<MarketTrade[]> {
        const catalog = this.#catalog.snapshot();
        const validatedInput = v.parse(createGetMarketTradesInputSchema(catalog), input);
        const res = await this.#client.getTrades(validatedInput, toConnectCallOptions(options));
        return v.parse(v.array(createMarketTradeSchema(catalog)), res.trades);
    }

    /**
     * Returns the cacheable spot reference-data snapshot, including asset metadata, pair trading constraints, display scales, statuses, and market slippage defaults.
     */
    async getSpotConfig(options?: PolyesterRequestOptions): Promise<SpotConfig> {
        const res = await this.#client.getSpotConfig({}, toConnectCallOptions(options));
        return v.parse(SpotConfigSchema, res);
    }

    /**
     * Subscribes to public trade prints on public:spot:market:trades:{symbolId}:proto for the requested symbol and emits parsed market trades.
     */
    subscribeTrades(input: SubscribeTradesInput): () => void {
        const pair = this.#catalog.market.requirePairBySymbol(input.symbol);

        const channel = `public:spot:market:trades:${pair.symbolId}:proto`;
        return this.#realtime.connectProtoChannel({
            channel,
            schema: Proto.MarketTradeSchema,
            onPublication: (data) => {
                const trade = v.parse(createMarketTradeSchema(this.#catalog.snapshot()), data);
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
