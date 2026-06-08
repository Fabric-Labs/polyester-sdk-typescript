import * as Proto from "../../gen/marketoverview/v1/marketoverview_pb.js";
import { createClient, type Client, type Transport } from "@connectrpc/connect";
import * as v from "valibot";
import type { RealtimeClient } from "../../realtime/client.js";
import type { BaseSubscribeInput } from "../../shared/types.js";
import {
    toConnectCallOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import { formatConnectError } from "../../utils/errors.js";
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
        let isDisposed = false;
        let snapshotReady = false;
        let pendingBatches: MarketOverview[] = [];
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

        async function fetchSnapshot(): Promise<void> {
            const resp = await listMarketOverview({
                includeSparklines,
                sparklineIntervals,
            });
            bySymbolId.clear();
            for (const m of resp) {
                bySymbolId.set(m.symbolId, m);
            }
            snapshotReady = true;
            if (pendingBatches.length > 0) {
                for (const m of pendingBatches) {
                    bySymbolId.set(m.symbolId, m);
                }
                pendingBatches = [];
            }
            emit();
        }

        void fetchSnapshot().catch((e: unknown) => {
            // @ts-expect-error - TODO: fix this
            input.onError?.({ message: formatConnectError(e, "snapshot failed") });
        });

        const unsubscribe = this.#realtime.connectProtoChannel({
            channel,
            schema: Proto.MarketOverviewBatchSchema,
            onPublication: (batch) => {
                const schemas = this.#schemas.current();
                const markets = (batch.markets ?? []).map((m) =>
                    v.parse(schemas.marketOverview, m),
                );
                if (!snapshotReady) {
                    pendingBatches = pendingBatches.concat(markets).slice(-2000);
                    return;
                }
                for (const mk of markets) {
                    handleMarketUpdate(mk);
                }
                emit();
            },
            onConnected: () => input.onOpen?.(),
            onDisconnected: () => {
                if (isDisposed) return;
                input.onClose?.();
                snapshotReady = false;
                void fetchSnapshot().catch(() => {});
            },
            onError: (ctx) => input.onError?.(ctx),
        });

        function dispose(): void {
            isDisposed = true;
            try {
                unsubscribe();
            } catch {
                // noop
            }
        }

        return dispose;
    }
}
