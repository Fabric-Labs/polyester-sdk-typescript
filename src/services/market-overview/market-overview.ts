import * as Proto from "../../gen/marketoverview/v1/marketoverview_pb.js";
import { createClient, type Client, type Transport } from "@connectrpc/connect";
import { publicationHandlerErrorContext } from "../../shared/subscription-errors.js";
import * as v from "../../shared/validation.js";
import type { PolyesterRealtime } from "../../realtime/types.js";
import { snapshotThenStream } from "../../realtime/snapshot-then-stream.js";
import type { BaseSubscribeInput } from "../../shared/types.js";
import {
    toConnectCallOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import { createReadyGate, type SdkScales } from "../../shared/decimal-surface.js";
import {
    ListMarketOverviewInputSchema,
    createMarketOverviewSchema,
    type SparklineIntervalName,
    type ListMarketOverviewInput,
    type MarketOverview,
} from "./market-overview.schemas.js";

interface SubscribeMarketOverviewInput extends BaseSubscribeInput<MarketOverview[]> {
    includeSparklines?: boolean;
    sparklineIntervals?: SparklineIntervalName[];
}

/**
 * Provides ticker-style per-market stats and a live merged overview stream.
 */
export class MarketOverviewService {
    #client: Client<typeof Proto.MarketOverviewService>;
    #realtime: PolyesterRealtime;
    #scales: SdkScales;
    #marketOverviewSchema: ReturnType<typeof createMarketOverviewSchema>;

    constructor(transport: Transport, realtime: PolyesterRealtime, scales: SdkScales) {
        this.#client = createClient(Proto.MarketOverviewService, transport);
        this.#realtime = realtime;
        this.#scales = scales;
        this.#marketOverviewSchema = createMarketOverviewSchema(scales);
    }

    /**
     * Returns market overview rows with last and index prices, 24h stats, top-of-book values, listing timestamp, and optional sparklines. Supports symbol filtering, sorting, pagination, and sparkline interval selection.
     */
    async list(
        input: ListMarketOverviewInput = {},
        options?: PolyesterRequestOptions,
    ): Promise<{ markets: MarketOverview[]; nextPageToken: string }> {
        const validatedInput = v.parse(ListMarketOverviewInputSchema, input);
        await this.#scales.ready();
        const res = await this.#client.listMarketOverview(
            validatedInput,
            toConnectCallOptions(options),
        );
        return {
            markets: v.parse(v.array(this.#marketOverviewSchema), res.markets),
            nextPageToken: res.nextPageToken,
        };
    }

    /**
     * Subscribes to public:spot:market_overview:updates:proto, fetches an initial snapshot, buffers updates until ready, and emits the merged set of latest market rows. On reconnect it refetches the snapshot before resuming updates.
     */
    subscribe(input: SubscribeMarketOverviewInput): () => void {
        const channel = "public:spot:market_overview:updates:proto";
        const bySymbolId = new Map<number, MarketOverview>();
        const includeSparklines = input.includeSparklines ?? true;
        const sparklineIntervals = input.sparklineIntervals ?? ["24h"];
        const listMarketOverview = this.list.bind(this);
        const schema = this.#marketOverviewSchema;
        const gate = createReadyGate(
            () => this.#scales.ready(),
            (error) => input.onError?.(publicationHandlerErrorContext(channel, error)),
        );

        function emit(): void {
            input.onEvent(Array.from(bySymbolId.values()));
        }

        function handleMarketUpdate(m: MarketOverview): void {
            bySymbolId.set(m.symbolId, m);
        }

        function applyMarkets(markets: readonly MarketOverview[]): void {
            for (const market of markets) {
                handleMarketUpdate(market);
            }
        }

        function parseMarkets(markets: readonly Proto.MarketOverview[]): MarketOverview[] {
            return markets.map((m) => v.parse(schema, m));
        }

        async function fetchSnapshot(): Promise<MarketOverview[]> {
            const result = await listMarketOverview({
                includeSparklines,
                sparklineIntervals,
            });
            return result.markets;
        }

        const stream = snapshotThenStream({
            realtime: this.#realtime,
            channel,
            schema: Proto.MarketOverviewBatchSchema,
            maxBufferedPublications: 2000,
            snapshotErrorLog: "Failed to fetch market overview",
            fetchSnapshot,
            readPublication: (batch) => batch.markets ?? [],
            applySnapshot: (markets, bufferedMarkets) => {
                gate.run(() => {
                    bySymbolId.clear();
                    applyMarkets(markets);
                    applyMarkets(parseMarkets(bufferedMarkets));
                    emit();
                });
            },
            applyLivePublications: (markets) => {
                gate.run(() => {
                    applyMarkets(parseMarkets(markets));
                    emit();
                });
            },
            onOpen: input.onOpen,
            onClose: input.onClose,
            onError: input.onError,
        });

        function dispose(): void {
            stream.unsubscribe();
        }

        return dispose;
    }
}
