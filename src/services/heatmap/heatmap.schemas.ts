import * as v from "../../shared/validation.js";
import type {
    HeatmapDepth,
    HeatmapInterval,
    HeatmapQuantityMode,
} from "../../gen/marketdata/v1/heatmap_pb.js";
import { OptionalTimestampSecondsInputSchema } from "../../shared/schemas.js";
import { requiredEnumLabel } from "../../shared/proto-enum-codec.js";
import type { DecodedEnum } from "../../utils/types.js";
import { scaledToDecimalOutput, type SdkScales } from "../../shared/decimal-surface.js";
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

type HeatmapTimeRangeInit = {
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

export const GetOrderbookHeatmapInputSchema = v.pipe(
    v.object({
        symbolId: v.pipe(v.number(), v.integer(), v.gtValue(0)),
        interval: IntervalInputSchema,
        depth: DepthInputSchema,
        quantityMode: QuantityModeInputSchema,
        limit: v.pipe(v.number(), v.integer(), v.gtValue(0), v.maxValue(20_000)),
        startTsSec: OptionalTimestampSecondsInputSchema,
        endTsSec: OptionalTimestampSecondsInputSchema,
        pageToken: v.optional(v.pipe(v.string(), v.trim()), ""),
    }),
    v.check(
        (value) => value.pageToken !== "" || value.startTsSec != null || value.endTsSec != null,
        "pageToken, startTsSec, or endTsSec is required",
    ),
    v.transform((value) => {
        const timeRange: HeatmapTimeRangeInit | undefined =
            value.pageToken !== ""
                ? undefined
                : {
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
            pageToken: value.pageToken,
            timeRange,
        };
    }),
);

function requiredIntervalLabelFor(value: number): DecodedEnum<HeatmapIntervalValue> {
    return requiredEnumLabel(
        HeatmapIntervalCodec.protoToOutput,
        value,
        "OrderbookHeatmapResponseSchema",
        "interval",
    );
}

function requiredQuantityModeLabelFor(value: number): DecodedEnum<HeatmapQuantityModeValue> {
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

const OrderbookHeatmapLevelsRawSchema = v.object({
    priceTicks: v.array(v.bigint()),
    qtyScaled: v.array(v.bigint()),
});

type OrderbookHeatmapLevelsRaw = v.InferOutput<typeof OrderbookHeatmapLevelsRawSchema>;

function convertHeatmapLevels(
    levels: OrderbookHeatmapLevelsRaw,
    priceScale: number,
    qtyScale: number,
) {
    return {
        price: levels.priceTicks.map((tick) => scaledToDecimalOutput(tick, priceScale)),
        qty: levels.qtyScaled.map((qty) => scaledToDecimalOutput(qty, qtyScale)),
    };
}

export type OrderbookHeatmapLevels = ReturnType<typeof convertHeatmapLevels>;

export type OrderbookHeatmapDeltaLevels = OrderbookHeatmapLevels;

const OrderbookHeatmapKeyframeRawSchema = v.object({
    tsSec: TimestampSecondsSchema,
    bestBidTicks: v.bigint(),
    bestAskTicks: v.bigint(),
    midTicks: v.bigint(),
    bids: v.optional(OrderbookHeatmapLevelsRawSchema),
    asks: v.optional(OrderbookHeatmapLevelsRawSchema),
    bookSeq: Uint64StringSchema,
});

type OrderbookHeatmapKeyframeRaw = v.InferOutput<typeof OrderbookHeatmapKeyframeRawSchema>;

function convertHeatmapKeyframe(
    keyframe: OrderbookHeatmapKeyframeRaw,
    priceScale: number,
    qtyScale: number,
) {
    return {
        tsSec: keyframe.tsSec,
        bestBid: scaledToDecimalOutput(keyframe.bestBidTicks, priceScale),
        bestAsk: scaledToDecimalOutput(keyframe.bestAskTicks, priceScale),
        mid: scaledToDecimalOutput(keyframe.midTicks, priceScale),
        bids: keyframe.bids ? convertHeatmapLevels(keyframe.bids, priceScale, qtyScale) : undefined,
        asks: keyframe.asks ? convertHeatmapLevels(keyframe.asks, priceScale, qtyScale) : undefined,
        bookSeq: keyframe.bookSeq,
    };
}

export type OrderbookHeatmapKeyframe = ReturnType<typeof convertHeatmapKeyframe>;

const OrderbookHeatmapDeltaBucketRawSchema = v.object({
    tsSec: TimestampSecondsSchema,
    bids: v.optional(OrderbookHeatmapLevelsRawSchema),
    asks: v.optional(OrderbookHeatmapLevelsRawSchema),
    updatesInBucket: v.number(),
    bookSeqStart: Uint64StringSchema,
    bookSeqEnd: Uint64StringSchema,
});

type OrderbookHeatmapDeltaBucketRaw = v.InferOutput<typeof OrderbookHeatmapDeltaBucketRawSchema>;

function convertHeatmapDeltaBucket(
    bucket: OrderbookHeatmapDeltaBucketRaw,
    priceScale: number,
    qtyScale: number,
) {
    return {
        tsSec: bucket.tsSec,
        bids: bucket.bids ? convertHeatmapLevels(bucket.bids, priceScale, qtyScale) : undefined,
        asks: bucket.asks ? convertHeatmapLevels(bucket.asks, priceScale, qtyScale) : undefined,
        updatesInBucket: bucket.updatesInBucket,
        bookSeqStart: bucket.bookSeqStart,
        bookSeqEnd: bucket.bookSeqEnd,
    };
}

export type OrderbookHeatmapDeltaBucket = ReturnType<typeof convertHeatmapDeltaBucket>;

const OrderbookHeatmapLiveBucketRawSchema = v.object({
    symbolId: v.number(),
    interval: v.pipe(v.number(), v.transform(requiredIntervalLabelFor)),
    tsSec: TimestampSecondsSchema,
    isFinal: v.boolean(),
    bids: v.optional(OrderbookHeatmapLevelsRawSchema),
    asks: v.optional(OrderbookHeatmapLevelsRawSchema),
    updatesInBucket: v.number(),
    bookSeqStart: Uint64StringSchema,
    bookSeqEnd: Uint64StringSchema,
    quantityMode: v.pipe(v.number(), v.transform(requiredQuantityModeLabelFor)),
    effectiveBinTicks: v.bigint(),
});

type OrderbookHeatmapLiveBucketRaw = v.InferOutput<typeof OrderbookHeatmapLiveBucketRawSchema>;

function convertHeatmapLiveBucket(bucket: OrderbookHeatmapLiveBucketRaw, scales: SdkScales) {
    const priceScale = scales.price();
    const qtyScale = scales.baseQty(bucket.symbolId);
    return {
        symbolId: bucket.symbolId,
        interval: bucket.interval,
        tsSec: bucket.tsSec,
        isFinal: bucket.isFinal,
        bids: bucket.bids ? convertHeatmapLevels(bucket.bids, priceScale, qtyScale) : undefined,
        asks: bucket.asks ? convertHeatmapLevels(bucket.asks, priceScale, qtyScale) : undefined,
        updatesInBucket: bucket.updatesInBucket,
        bookSeqStart: bucket.bookSeqStart,
        bookSeqEnd: bucket.bookSeqEnd,
        quantityMode: bucket.quantityMode,
        effectiveBinSize: scaledToDecimalOutput(bucket.effectiveBinTicks, priceScale),
    };
}

export type OrderbookHeatmapLiveBucket = ReturnType<typeof convertHeatmapLiveBucket>;

export function createOrderbookHeatmapLiveBucketSchema(scales: SdkScales) {
    return v.pipe(
        OrderbookHeatmapLiveBucketRawSchema,
        v.transform((bucket) => convertHeatmapLiveBucket(bucket, scales)),
    );
}

const OrderbookHeatmapDeltaChainRawSchema = v.object({
    baseKeyframe: v.optional(OrderbookHeatmapKeyframeRawSchema),
    deltas: v.optional(v.array(OrderbookHeatmapDeltaBucketRawSchema), []),
});

type OrderbookHeatmapDeltaChainRaw = v.InferOutput<typeof OrderbookHeatmapDeltaChainRawSchema>;

function convertHeatmapDeltaChain(
    chain: OrderbookHeatmapDeltaChainRaw,
    priceScale: number,
    qtyScale: number,
) {
    return {
        baseKeyframe: chain.baseKeyframe
            ? convertHeatmapKeyframe(chain.baseKeyframe, priceScale, qtyScale)
            : undefined,
        deltas: chain.deltas.map((bucket) =>
            convertHeatmapDeltaBucket(bucket, priceScale, qtyScale),
        ),
    };
}

export type OrderbookHeatmapDeltaChain = ReturnType<typeof convertHeatmapDeltaChain>;

const OrderbookHeatmapResponseRawSchema = v.object({
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
    chain: v.optional(OrderbookHeatmapDeltaChainRawSchema),
    lastPersistedTsSec: TimestampSecondsSchema,
    liveFromBookSeqEnd: Uint64StringSchema,
    hasLiveAnchor: v.boolean(),
    nextPageToken: v.optional(v.string(), ""),
    serverTimeSec: TimestampSecondsSchema,
    quantityMode: v.pipe(v.number(), v.transform(requiredQuantityModeLabelFor)),
    liveBucket: v.optional(OrderbookHeatmapLiveBucketRawSchema),
});

export function createOrderbookHeatmapResponseSchema(scales: SdkScales) {
    return v.pipe(
        OrderbookHeatmapResponseRawSchema,
        v.transform((res) => {
            const priceScale = scales.price();
            const qtyScale = scales.baseQty(res.symbolId);
            return {
                symbolId: res.symbolId,
                interval: res.interval,
                depth: res.depth,
                chain: res.chain
                    ? convertHeatmapDeltaChain(res.chain, priceScale, qtyScale)
                    : undefined,
                lastPersistedTsSec: res.lastPersistedTsSec,
                liveFromBookSeqEnd: res.liveFromBookSeqEnd,
                hasLiveAnchor: res.hasLiveAnchor,
                nextPageToken: res.nextPageToken,
                serverTimeSec: res.serverTimeSec,
                quantityMode: res.quantityMode,
                liveBucket: res.liveBucket
                    ? convertHeatmapLiveBucket(res.liveBucket, scales)
                    : undefined,
            };
        }),
    );
}

export type GetOrderbookHeatmapInput = v.InferInput<typeof GetOrderbookHeatmapInputSchema>;
export type ParsedGetOrderbookHeatmapInput = v.InferOutput<typeof GetOrderbookHeatmapInputSchema>;
export type OrderbookHeatmapResponse = v.InferOutput<
    ReturnType<typeof createOrderbookHeatmapResponseSchema>
>;
export type ParsedHeatmapTimeRange = HeatmapTimeRangeInit;
