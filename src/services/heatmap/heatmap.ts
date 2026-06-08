import { createClient, type Client, type Transport } from "@connectrpc/connect";
import { create } from "@bufbuild/protobuf";
import {
    HeatmapService as HeatmapRpc,
    HeatmapCursorSchema,
    HeatmapLiveBucketSchema as ProtoHeatmapLiveBucketSchema,
    HeatmapTimeRangeSchema,
    type GetOrderbookHeatmapRequest,
} from "../../gen/marketdata/v1/heatmap_pb.js";
import type { RealtimeClient } from "../../realtime/client.js";
import type { BaseSubscribeInput } from "../../shared/types.js";
import {
    toConnectCallOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import type { HeatmapIntervalValue } from "./heatmap.codecs.js";
import * as v from "valibot";
import {
    GetOrderbookHeatmapInputSchema,
    OrderbookHeatmapLiveBucketSchema,
    OrderbookHeatmapResponseSchema,
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

export class HeatmapService implements OrderbookHeatmapProvider {
    #client: Client<typeof HeatmapRpc>;
    #realtime: RealtimeClient;

    constructor(transport: Transport, realtime: RealtimeClient) {
        this.#client = createClient(HeatmapRpc, transport);
        this.#realtime = realtime;
    }

    async getOrderbookHeatmap(
        input: GetOrderbookHeatmapInput,
        options?: PolyesterRequestOptions,
    ): Promise<OrderbookHeatmapResponse> {
        const parsed = v.parse(GetOrderbookHeatmapInputSchema, input);

        const mode: GetOrderbookHeatmapRequest["mode"] =
            parsed.mode.case === "cursor"
                ? {
                      case: "cursor",
                      value: create(HeatmapCursorSchema, { fromTsSec: parsed.mode.fromTsSec }),
                  }
                : {
                      case: "timeRange",
                      value: create(HeatmapTimeRangeSchema, {
                          startTime: parsed.mode.startTime,
                          endTime: parsed.mode.endTime,
                      }),
                  };

        const res = await this.#client.getOrderbookHeatmap(
            {
                symbolId: parsed.symbolId,
                interval: parsed.interval,
                depth: parsed.depth,
                quantityMode: parsed.quantityMode,
                limit: parsed.limit,
                mode,
            },
            toConnectCallOptions(options),
        );
        return v.parse(OrderbookHeatmapResponseSchema, res);
    }

    subscribeLive(input: SubscribeHeatmapLiveInput): () => void {
        const channel = `public:spot:market:heatmap:${input.interval}:${input.symbolId}:proto`;
        return this.#realtime.connectProtoChannel({
            channel,
            schema: ProtoHeatmapLiveBucketSchema,
            onPublication: (data) => {
                const bucket = v.parse(OrderbookHeatmapLiveBucketSchema, data);
                input.onEvent(bucket);
            },
            onConnected: input.onOpen,
            onDisconnected: input.onClose,
            onError: input.onError,
        });
    }
}
