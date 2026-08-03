import * as Proto from "../../gen/marketdata/v1/marketdata_pb.js";
import type { PolyesterRealtime } from "../../realtime/types.js";
import { createClient, type Client, type Transport } from "@connectrpc/connect";
import {
    publicationHandlerErrorContext,
    type SdkSubscriptionErrorContext,
} from "../../shared/subscription-errors.js";
import * as v from "valibot";
import type { BaseSubscribeInput } from "../../shared/types.js";
import {
    toConnectCallOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import { createReadyGate, type SdkScales } from "../../shared/decimal-surface.js";
import {
    GetMarketTradesInputSchema,
    createMarketTradeSchema,
    type GetMarketTradesInput,
    type SpotConfig,
    SpotConfigSchema,
    type MarketTrade,
} from "./market-data.schemas.js";
import { isDev } from "../../utils/is-dev.js";

interface SubscribeTradesInput extends BaseSubscribeInput<MarketTrade> {
    symbolId: number;
}

/**
 * Exposes public spot trades, spot configuration, and live trade streams.
 */
export class MarketDataService {
    #client: Client<typeof Proto.MarketDataService>;
    #realtime: PolyesterRealtime;
    #scales: SdkScales;
    #marketTradeSchema: ReturnType<typeof createMarketTradeSchema>;

    constructor(transport: Transport, realtime: PolyesterRealtime, scales: SdkScales) {
        this.#client = createClient(Proto.MarketDataService, transport);
        this.#realtime = realtime;
        this.#scales = scales;
        this.#marketTradeSchema = createMarketTradeSchema(scales);
    }

    /**
     * Returns recent public trades for one spot market, ordered newest-first by execution timestamp with match id as a tie-breaker. Supports limit, time bounds, side filtering, and match-id pagination.
     */
    async listTrades(
        input: GetMarketTradesInput,
        options?: PolyesterRequestOptions,
    ): Promise<{ trades: MarketTrade[]; nextPageToken: string }> {
        await this.#scales.ready();
        const validatedInput = v.parse(GetMarketTradesInputSchema, input);
        const res = await this.#client.getTrades(validatedInput, toConnectCallOptions(options));
        return {
            trades: v.parse(v.array(this.#marketTradeSchema), res.trades),
            nextPageToken: res.nextPageToken,
        };
    }

    /**
     * Returns the cacheable spot reference-data snapshot, including asset metadata, pair trading constraints, display scales, statuses, and market slippage defaults.
     *
     * This is the catalog's own data source, so it must never wait on catalog
     * readiness (that would deadlock the initial catalog refresh) and carries
     * no decimal conversion.
     */
    async getSpotConfig(options?: PolyesterRequestOptions): Promise<SpotConfig> {
        const res = await this.#client.getSpotConfig({}, toConnectCallOptions(options));
        return v.parse(SpotConfigSchema, res);
    }

    /**
     * Subscribes to public trade prints on public:spot:market:trades:{symbolId}:proto for the requested symbol and emits parsed market trades.
     */
    subscribeTrades(input: SubscribeTradesInput): () => void {
        const symbolId = v.parse(v.pipe(v.number(), v.integer(), v.gtValue(0)), input.symbolId);
        const channel = `public:spot:market:trades:${symbolId}:proto`;
        const notifyError = (error: SdkSubscriptionErrorContext) => {
            if (isDev()) {
                console.error("Market trades subscription error", error);
            }
            input.onError?.(error);
        };
        const gate = createReadyGate(
            () => this.#scales.ready(),
            (error) => notifyError(publicationHandlerErrorContext(channel, error)),
        );
        return this.#realtime.connectProtoChannel({
            channel,
            schema: Proto.MarketTradeSchema,
            onPublication: (data) => {
                gate.run(() => {
                    const trade = v.parse(this.#marketTradeSchema, data);
                    input.onEvent(trade);
                });
            },
            onConnected: () => input.onOpen?.(),
            onDisconnected: () => input.onClose?.(),
            onError: notifyError,
        });
    }
}
