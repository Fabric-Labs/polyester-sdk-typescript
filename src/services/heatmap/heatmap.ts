import { createClient, type Client, type Transport } from "@connectrpc/connect";
import { create } from "@bufbuild/protobuf";
import {
    HeatmapService as HeatmapRpc,
    HeatmapLiveBucketSchema as ProtoHeatmapLiveBucketSchema,
    HeatmapTimeRangeSchema,
} from "../../gen/marketdata/v1/heatmap_pb.js";
import type { PolyesterRealtime } from "../../realtime/types.js";
import { connectReadyGatedProtoChannel } from "../../realtime/ready-gated-subscription.js";
import type { BaseSubscribeInput } from "../../shared/types.js";
import {
    toConnectCallOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import type { SdkScales } from "../../shared/decimal-surface.js";
import { HEATMAP_INTERVAL_VALUES, type HeatmapIntervalValue } from "./heatmap.codecs.js";
import * as v from "valibot";
import { parse } from "../../shared/validation.js";
import {
    GetOrderbookHeatmapInputSchema,
    createOrderbookHeatmapLiveBucketSchema,
    createOrderbookHeatmapResponseSchema,
    type GetOrderbookHeatmapInput,
    type OrderbookHeatmapLiveBucket,
    type OrderbookHeatmapResponse,
} from "./heatmap.schemas.js";

export interface OrderbookHeatmapProvider {
    getOrderbookHeatmap(
        input: GetOrderbookHeatmapInput,
        options?: PolyesterRequestOptions,
    ): Promise<OrderbookHeatmapResponse>;
}

interface SubscribeHeatmapLiveInput extends BaseSubscribeInput<OrderbookHeatmapLiveBucket> {
    symbolId: number;
    interval: HeatmapIntervalValue;
}

const SubscribeHeatmapLiveParamsSchema = v.object({
    symbolId: v.pipe(v.number(), v.integer(), v.gtValue(0)),
    interval: v.picklist(HEATMAP_INTERVAL_VALUES),
});

/**
 * Reads historical order book heatmap chains and streams live heatmap buckets.
 */
export class HeatmapService implements OrderbookHeatmapProvider {
    #client: Client<typeof HeatmapRpc>;
    #realtime: PolyesterRealtime;
    #scales: SdkScales;
    #responseSchema: ReturnType<typeof createOrderbookHeatmapResponseSchema>;
    #liveBucketSchema: ReturnType<typeof createOrderbookHeatmapLiveBucketSchema>;

    constructor(transport: Transport, realtime: PolyesterRealtime, scales: SdkScales) {
        this.#client = createClient(HeatmapRpc, transport);
        this.#realtime = realtime;
        this.#scales = scales;
        this.#responseSchema = createOrderbookHeatmapResponseSchema(scales);
        this.#liveBucketSchema = createOrderbookHeatmapLiveBucketSchema(scales);
    }

    /**
     * Fetches order book heatmap data for a symbol, interval, depth, and quantity mode using either an absolute time range or cursor pagination. The response includes a keyframe anchor, delta buckets, pagination metadata, and live-anchor fields when available.
     */
    async getOrderbookHeatmap(
        input: GetOrderbookHeatmapInput,
        options?: PolyesterRequestOptions,
    ): Promise<OrderbookHeatmapResponse> {
        const parsed = parse(GetOrderbookHeatmapInputSchema, input);
        await this.#scales.ready();

        const res = await this.#client.getOrderbookHeatmap(
            {
                symbolId: parsed.symbolId,
                interval: parsed.interval,
                depth: parsed.depth,
                quantityMode: parsed.quantityMode,
                limit: parsed.limit,
                pageToken: parsed.pageToken,
                timeRange:
                    parsed.timeRange != null
                        ? create(HeatmapTimeRangeSchema, {
                              startTime: parsed.timeRange.startTime,
                              endTime: parsed.timeRange.endTime,
                          })
                        : undefined,
            },
            toConnectCallOptions(options),
        );
        return parse(this.#responseSchema, res);
    }

    /**
     * Subscribes to live heatmap buckets on public:spot:market:heatmap:{interval}:{symbolId}:proto and emits parsed bid/ask delta buckets for the selected interval.
     */
    subscribeLive(input: SubscribeHeatmapLiveInput): () => void {
        const params = parse(SubscribeHeatmapLiveParamsSchema, {
            symbolId: input.symbolId,
            interval: input.interval,
        });
        const channel = `public:spot:market:heatmap:${params.interval}:${params.symbolId}:proto`;
        return connectReadyGatedProtoChannel(this.#realtime, {
            channel,
            schema: ProtoHeatmapLiveBucketSchema,
            ready: () => this.#scales.ready(),
            onPublication: (data) => {
                const bucket = parse(this.#liveBucketSchema, data);
                input.onEvent(bucket);
            },
            onConnected: input.onOpen,
            onDisconnected: input.onClose,
            onError: input.onError,
        });
    }
}
