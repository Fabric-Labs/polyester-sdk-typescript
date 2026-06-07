import { createClient, type Client, type Transport } from "@connectrpc/connect";
import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import {
    HeatmapService as HeatmapRpc,
    HeatmapCursorSchema,
    HeatmapLiveBucketSchema,
    HeatmapTimeRangeSchema,
    type HeatmapLiveBucket,
    type GetOrderbookHeatmapRequest,
} from "../../gen/marketdata/v1/heatmap_pb.js";
import type { RealtimeClient } from "../../realtime/client.js";
import type { BaseSubscribeInput } from "../../shared/types.js";
import { isDev } from "../../utils/is-dev.js";
import { HeatmapIntervalCodec } from "./heatmap.codecs.js";
import * as v from "valibot";
import {
    GetOrderbookHeatmapInputSchema,
    type GetOrderbookHeatmapInput,
    type OrderbookHeatmapResponse,
} from "./heatmap.schemas.js";

export interface OrderbookHeatmapProvider {
    getOrderbookHeatmap(input: GetOrderbookHeatmapInput): Promise<OrderbookHeatmapResponse>;
}

interface SubscribeHeatmapLiveInput extends BaseSubscribeInput<HeatmapLiveBucket> {
    symbolId: number;
    interval: number | string;
}

function toStreamInterval(interval: number | string): string | null {
    if (typeof interval === "number") {
        return HeatmapIntervalCodec.protoToOutput[interval] ?? null;
    }
    if (typeof interval === "string") {
        const mapped =
            HeatmapIntervalCodec.inputToProto[
                interval as keyof typeof HeatmapIntervalCodec.inputToProto
            ];
        return mapped ? interval : null;
    }
    return null;
}

export class HeatmapService implements OrderbookHeatmapProvider {
    #client: Client<typeof HeatmapRpc>;
    #realtime: RealtimeClient;

    constructor(transport: Transport, realtime: RealtimeClient) {
        this.#client = createClient(HeatmapRpc, transport);
        this.#realtime = realtime;
    }

    async getOrderbookHeatmap(input: GetOrderbookHeatmapInput): Promise<OrderbookHeatmapResponse> {
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
                          startTime: timestampFromDate(
                              parsed.mode.startTime ?? new Date(Date.now() - 5 * 60 * 1000),
                          ),
                          endTime: timestampFromDate(parsed.mode.endTime ?? new Date()),
                      }),
                  };

        return this.#client.getOrderbookHeatmap({
            symbolId: parsed.symbolId,
            interval: parsed.interval,
            depth: parsed.depth,
            quantityMode: parsed.quantityMode,
            limit: parsed.limit,
            mode,
        });
    }

    subscribeLive(input: SubscribeHeatmapLiveInput): () => void {
        const interval = toStreamInterval(input.interval);
        if (!interval) {
            if (isDev()) {
                console.error(
                    `[HeatmapService] Unsupported live interval: ${String(input.interval)}`,
                );
            }
            return () => {};
        }
        const channel = `public:spot:market:heatmap:${interval}:${input.symbolId}:proto`;
        return this.#realtime.connectProtoChannel({
            channel,
            schema: HeatmapLiveBucketSchema,
            onPublication: (data) => input.onEvent(data),
            onConnected: input.onOpen,
            onDisconnected: input.onClose,
            onError: input.onError,
        });
    }
}
