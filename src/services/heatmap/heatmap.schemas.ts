import * as v from "valibot";
import type {
    HeatmapDepth,
    HeatmapInterval,
    HeatmapQuantityMode,
} from "../../gen/marketdata/v1/heatmap_pb.js";
import { OptionalTimestampSecondsInputSchema } from "../../shared/schemas.js";
import { requiredEnumLabel } from "../../shared/proto-enum-codec.js";
import {
    HEATMAP_DEPTH_VALUES,
    HEATMAP_INTERVAL_VALUES,
    HEATMAP_QUANTITY_MODE_VALUES,
    HeatmapDepthCodec,
    HeatmapIntervalCodec,
    HeatmapQuantityModeCodec,
    type HeatmapIntervalValue,
    type HeatmapQuantityModeValue,
} from "./heatmap.codecs.js";

type HeatmapMode =
    | {
          case: "cursor";
          fromTsSec: bigint;
      }
    | {
          case: "timeRange";
          startTime?: TimestampInit;
          endTime?: TimestampInit;
      };

type TimestampInit = { seconds: bigint; nanos: number };

const IntervalInputSchema = v.pipe(
    v.optional(v.picklist(HEATMAP_INTERVAL_VALUES), "1s"),
    v.transform((value): HeatmapInterval => HeatmapIntervalCodec.inputToProto[value]),
);

const DepthInputSchema = v.pipe(
    v.optional(v.picklist(HEATMAP_DEPTH_VALUES), 50),
    v.transform((value): HeatmapDepth => HeatmapDepthCodec.inputToProto[value]),
);

const QuantityModeInputSchema = v.pipe(
    v.optional(v.picklist(HEATMAP_QUANTITY_MODE_VALUES), "close"),
    v.transform((value): HeatmapQuantityMode => HeatmapQuantityModeCodec.inputToProto[value]),
);

function timestampFromTsSec(tsSec: bigint): TimestampInit {
    return { seconds: tsSec, nanos: 0 };
}

const CursorInputSchema = v.optional(
    v.pipe(
        v.number(),
        v.integer(),
        v.gtValue(0),
        v.maxValue(Number.MAX_SAFE_INTEGER),
        v.transform((value) => BigInt(value)),
    ),
);

export const GetOrderbookHeatmapInputSchema = v.pipe(
    v.object({
        symbolId: v.pipe(v.number(), v.integer(), v.gtValue(0)),
        interval: IntervalInputSchema,
        depth: DepthInputSchema,
        quantityMode: QuantityModeInputSchema,
        limit: v.optional(v.pipe(v.number(), v.integer(), v.gtValue(0), v.maxValue(20_000))),
        startTsSec: OptionalTimestampSecondsInputSchema,
        endTsSec: OptionalTimestampSecondsInputSchema,
        cursorTsSec: CursorInputSchema,
    }),
    v.check(
        (value) => value.cursorTsSec != null || value.startTsSec != null || value.endTsSec != null,
        "cursorTsSec, startTsSec, or endTsSec is required",
    ),
    v.transform((value) => {
        const mode: HeatmapMode =
            value.cursorTsSec != null
                ? { case: "cursor", fromTsSec: value.cursorTsSec }
                : {
                      case: "timeRange",
                      startTime:
                          value.startTsSec != null
                              ? timestampFromTsSec(value.startTsSec)
                              : undefined,
                      endTime:
                          value.endTsSec != null ? timestampFromTsSec(value.endTsSec) : undefined,
                  };

        return {
            symbolId: value.symbolId,
            interval: value.interval,
            depth: value.depth,
            quantityMode: value.quantityMode,
            limit: value.limit,
            mode,
        };
    }),
);

function requiredIntervalLabelFor(value: number): HeatmapIntervalValue {
    return requiredEnumLabel(
        HeatmapIntervalCodec.protoToOutput,
        value,
        "OrderbookHeatmapResponseSchema",
        "interval",
    );
}

function requiredQuantityModeLabelFor(value: number): HeatmapQuantityModeValue {
    return requiredEnumLabel(
        HeatmapQuantityModeCodec.protoToOutput,
        value,
        "OrderbookHeatmapResponseSchema",
        "quantity mode",
    );
}

const TimestampSecondsSchema = v.pipe(
    v.bigint(),
    v.transform((value) => Number(value)),
);

const Uint64StringSchema = v.pipe(
    v.bigint(),
    v.transform((value) => value.toString()),
);

const Int64StringArraySchema = v.pipe(
    v.array(v.bigint()),
    v.transform((values) => values.map((value) => value.toString())),
);

export const OrderbookHeatmapLevelsSchema = v.object({
    priceTicks: Int64StringArraySchema,
    qtyScaled: Int64StringArraySchema,
});

export type OrderbookHeatmapLevels = v.InferOutput<typeof OrderbookHeatmapLevelsSchema>;

export const OrderbookHeatmapDeltaLevelsSchema = OrderbookHeatmapLevelsSchema;

export type OrderbookHeatmapDeltaLevels = v.InferOutput<typeof OrderbookHeatmapDeltaLevelsSchema>;

export const OrderbookHeatmapKeyframeSchema = v.object({
    tsSec: TimestampSecondsSchema,
    bestBidTick: Uint64StringSchema,
    bestAskTick: Uint64StringSchema,
    midTick: Uint64StringSchema,
    bids: v.optional(OrderbookHeatmapLevelsSchema),
    asks: v.optional(OrderbookHeatmapLevelsSchema),
    bookSeq: Uint64StringSchema,
});

export type OrderbookHeatmapKeyframe = v.InferOutput<typeof OrderbookHeatmapKeyframeSchema>;

export const OrderbookHeatmapDeltaBucketSchema = v.object({
    tsSec: TimestampSecondsSchema,
    bids: v.optional(OrderbookHeatmapDeltaLevelsSchema),
    asks: v.optional(OrderbookHeatmapDeltaLevelsSchema),
    updatesInBucket: v.number(),
    bookSeqStart: Uint64StringSchema,
    bookSeqEnd: Uint64StringSchema,
});

export type OrderbookHeatmapDeltaBucket = v.InferOutput<typeof OrderbookHeatmapDeltaBucketSchema>;

export const OrderbookHeatmapLiveBucketSchema = v.object({
    symbolId: v.number(),
    interval: v.pipe(v.number(), v.transform(requiredIntervalLabelFor)),
    tsSec: TimestampSecondsSchema,
    isFinal: v.boolean(),
    bids: v.optional(OrderbookHeatmapDeltaLevelsSchema),
    asks: v.optional(OrderbookHeatmapDeltaLevelsSchema),
    updatesInBucket: v.number(),
    bookSeqStart: Uint64StringSchema,
    bookSeqEnd: Uint64StringSchema,
    quantityMode: v.pipe(v.number(), v.transform(requiredQuantityModeLabelFor)),
    effectiveBinTicks: Uint64StringSchema,
});

export type OrderbookHeatmapLiveBucket = v.InferOutput<typeof OrderbookHeatmapLiveBucketSchema>;

export const OrderbookHeatmapDeltaChainSchema = v.object({
    baseKeyframe: v.optional(OrderbookHeatmapKeyframeSchema),
    deltas: v.optional(v.array(OrderbookHeatmapDeltaBucketSchema), []),
});

export type OrderbookHeatmapDeltaChain = v.InferOutput<typeof OrderbookHeatmapDeltaChainSchema>;

export const OrderbookHeatmapResponseSchema = v.object({
    symbolId: v.number(),
    interval: v.pipe(v.number(), v.transform(requiredIntervalLabelFor)),
    depth: v.pipe(
        v.number(),
        v.transform((value) =>
            requiredEnumLabel(
                HeatmapDepthCodec.protoToOutput,
                value,
                "OrderbookHeatmapResponseSchema",
                "depth",
            ),
        ),
    ),
    chain: v.optional(OrderbookHeatmapDeltaChainSchema),
    lastPersistedTsSec: TimestampSecondsSchema,
    liveFromBookSeqEnd: Uint64StringSchema,
    hasLiveAnchor: v.boolean(),
    hasMore: v.boolean(),
    nextTsSec: TimestampSecondsSchema,
    serverTimeSec: TimestampSecondsSchema,
    quantityMode: v.pipe(v.number(), v.transform(requiredQuantityModeLabelFor)),
    liveBucket: v.optional(OrderbookHeatmapLiveBucketSchema),
});

export type GetOrderbookHeatmapInput = v.InferInput<typeof GetOrderbookHeatmapInputSchema>;
export type ParsedGetOrderbookHeatmapInput = v.InferOutput<typeof GetOrderbookHeatmapInputSchema>;
export type OrderbookHeatmapResponse = v.InferOutput<typeof OrderbookHeatmapResponseSchema>;
export type ParsedHeatmapMode = HeatmapMode;
