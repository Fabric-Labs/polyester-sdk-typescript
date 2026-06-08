import * as Proto from "../../gen/marketoverview/v1/marketoverview_pb.js";
import { createClient, type Client, type Transport } from "@connectrpc/connect";
import * as v from "valibot";
import type { RealtimeClient } from "../../realtime/client.js";
import { snapshotThenStream } from "../../realtime/snapshot-then-stream.js";
import type { BaseSubscribeInput } from "../../shared/types.js";
import {
    toConnectCallOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import {
    createMarketOverviewSchemas,
    ListMarketOverviewInputSchema,
    type SparklineIntervalName,
    type ListMarketOverviewInput,
    type MarketOverview,
} from "./market-overview.schemas.js";
import { staticCatalog, type CatalogReader } from "../../catalogs/index.js";

interface SubscribeMarketOverviewInput extends BaseSubscribeInput<MarketOverview[]> {
    includeSparklines?: boolean;
    sparklineIntervals?: SparklineIntervalName[];
}

/**
 * Provides ticker-style per-market stats and a live merged overview stream.
 */
export class MarketOverviewService {
    #client: Client<typeof Proto.MarketOverviewService>;
    #realtime: RealtimeClient;
    #schemas: ReturnType<typeof createMarketOverviewSchemas>;

    constructor(
        transport: Transport,
        realtime: RealtimeClient,
        catalog: CatalogReader = staticCatalog,
    ) {
        this.#client = createClient(Proto.MarketOverviewService, transport);
        this.#realtime = realtime;
        this.#schemas = createMarketOverviewSchemas(catalog);
    }

    /**
     * Returns market overview rows with last price, 24h stats, top-of-book values, listing timestamp, and optional sparklines. Supports symbol filtering, sorting, pagination, and sparkline interval selection.
     */
    async list(
        input: ListMarketOverviewInput = {},
        options?: PolyesterRequestOptions,
    ): Promise<MarketOverview[]> {
        const validatedInput = v.parse(ListMarketOverviewInputSchema, input);
        const res = await this.#client.listMarketOverview(
            validatedInput,
            toConnectCallOptions(options),
        );
        const schemas = this.#schemas.current();
        return v.parse(v.array(schemas.marketOverview), res.markets);
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

        async function fetchSnapshot(): Promise<MarketOverview[]> {
            return listMarketOverview({
                includeSparklines,
                sparklineIntervals,
            });
        }

        const stream = snapshotThenStream({
            realtime: this.#realtime,
            channel,
            schema: Proto.MarketOverviewBatchSchema,
            maxBufferedPublications: 2000,
            snapshotErrorLog: "Failed to fetch market overview",
            fetchSnapshot,
            readPublication: (batch) => {
                const schemas = this.#schemas.current();
                return (batch.markets ?? []).map((m) => v.parse(schemas.marketOverview, m));
            },
            applySnapshot: (markets, bufferedMarkets) => {
                bySymbolId.clear();
                applyMarkets(markets);
                applyMarkets(bufferedMarkets);
                emit();
            },
            applyLivePublications: (markets) => {
                applyMarkets(markets);
                emit();
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
