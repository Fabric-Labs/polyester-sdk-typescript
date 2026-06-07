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
    ListMarketOverviewInputSchema,
    MarketOverviewSchema,
    type SparklineIntervalName,
    type ListMarketOverviewInput,
    type MarketOverview,
} from "./market-overview.schemas.js";

interface SubscribeMarketOverviewInput extends BaseSubscribeInput<MarketOverview[]> {
    includeSparklines?: boolean;
    sparklineIntervals?: SparklineIntervalName[];
}

export class MarketOverviewService {
    #client: Client<typeof Proto.MarketOverviewService>;
    #realtime: RealtimeClient;

    constructor(transport: Transport, realtime: RealtimeClient) {
        this.#client = createClient(Proto.MarketOverviewService, transport);
        this.#realtime = realtime;
    }

    async list(
        input: ListMarketOverviewInput = {},
        options?: PolyesterRequestOptions,
    ): Promise<MarketOverview[]> {
        const validatedInput = v.parse(ListMarketOverviewInputSchema, input);
        const res = await this.#client.listMarketOverview(
            validatedInput,
            toConnectCallOptions(options),
        );
        return v.parse(v.array(MarketOverviewSchema), res.markets);
    }

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
                const markets = (batch.markets ?? []).map((m) => v.parse(MarketOverviewSchema, m));
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
