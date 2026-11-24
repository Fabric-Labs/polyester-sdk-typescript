import { SymbolIdInputSchema } from "../shared.js";
import * as v from "valibot";
import type * as ProtoMarketData from "../../gen/marketdata/v1/marketdata_pb.js";
import type { DecodedEnum } from "../../utils/types.js";
import { OptionalTimestampSecondsInputSchema } from "../../shared/schemas.js";
import { enumLabel } from "../../shared/proto-enum-codec.js";
import { scaledToDecimalOutput, type SdkScales } from "../../shared/decimal-surface.js";
import { IndexPriceCandleSourceCodec, TIMEFRAMES, TimeframeCodec } from "./candles.codecs.js";

export const TimeframeSchema = v.picklist(TIMEFRAMES);

export type Timeframe = v.InferOutput<typeof TimeframeSchema>;

function timeframeFromProto(value: number): DecodedEnum<Timeframe> {
    return enumLabel(TimeframeCodec.protoToOutput, value);
}

const TimeframeInputSchema = v.pipe(
    TimeframeSchema,
    v.transform((value) => TimeframeCodec.inputToProto[value]),
);

const OptionalPositiveNumberSchema = v.optional(
    v.pipe(v.number(), v.integer(), v.gtValue(0), v.maxValue(10_000)),
);

const OptionalBooleanSchema = v.optional(v.boolean(), false);

type TimestampInit = { seconds: bigint; nanos: number };

function timestampFromTsSec(tsSec: bigint): TimestampInit {
    return { seconds: tsSec, nanos: 0 };
}

const CandleRowRawSchema = v.object({
    symbolId: v.number(),
    timeframe: v.pipe(
        v.number(),
        v.transform((v) => timeframeFromProto(v)),
    ),
    tsSec: v.bigint(),
    open: v.bigint(),
    high: v.bigint(),
    low: v.bigint(),
    close: v.bigint(),
    volume: v.bigint(),
    quoteVolume: v.string(),
    isClosed: v.optional(v.boolean(), false),
});

function toCandleRow(
    scales: SdkScales,
    data: v.InferOutput<typeof CandleRowRawSchema>,
    priceScale = scales.price(),
) {
    return {
        symbolId: data.symbolId,
        timeframe: data.timeframe,
        time: Number(data.tsSec),
        open: scaledToDecimalOutput(data.open, priceScale),
        high: scaledToDecimalOutput(data.high, priceScale),
        low: scaledToDecimalOutput(data.low, priceScale),
        close: scaledToDecimalOutput(data.close, priceScale),
        volume: scaledToDecimalOutput(data.volume, scales.marketDataVolume(data.symbolId)),
        quoteVolume: data.quoteVolume,
        isClosed: data.isClosed,
    };
}

export function createCandleRowSchema(scales: SdkScales) {
    return v.pipe(
        CandleRowRawSchema,
        v.transform((data) => toCandleRow(scales, data)),
    );
}

/**
 * Formats a protobuf-decoded candle point like {@link createCandleRowSchema} without
 * re-validating it. `timeframe` is the proto enum value of the series. Pass `priceScale` for a
 * series priced at another scale, such as composite reference candles.
 */
export function formatCandleRow(
    scales: SdkScales,
    point: ProtoMarketData.CandlePoint,
    symbolId: number,
    timeframe: number,
    priceScale?: number,
): Candle {
    return toCandleRow(
        scales,
        {
            symbolId,
            timeframe: timeframeFromProto(timeframe),
            tsSec: point.tsSec,
            open: point.open,
            high: point.high,
            low: point.low,
            close: point.close,
            volume: point.volume,
            quoteVolume: point.quoteVolume,
            isClosed: point.isClosed ?? false,
        },
        priceScale,
    );
}

export const createCandleRowIntSchema = createCandleRowSchema;

export const CandlePointSchema = v.object({
    tsSec: v.bigint(),
    open: v.bigint(),
    high: v.bigint(),
    low: v.bigint(),
    close: v.bigint(),
    volume: v.bigint(),
    quoteVolume: v.string(),
    isClosed: v.optional(v.boolean(), false),
});

const CandleColumnarRawSchema = v.object({
    symbolId: v.number(),
    timeframe: v.pipe(
        v.number(),
        v.transform((v) => timeframeFromProto(v)),
    ),
    tsSec: v.array(v.bigint()),
    open: v.array(v.bigint()),
    high: v.array(v.bigint()),
    low: v.array(v.bigint()),
    close: v.array(v.bigint()),
    volume: v.array(v.bigint()),
    quoteVolume: v.array(v.string()),
    isClosed: v.optional(v.array(v.boolean()), []),
    referenceTsSec: v.optional(v.array(v.bigint()), []),
    referenceOpen: v.optional(v.array(v.bigint()), []),
    referenceHigh: v.optional(v.array(v.bigint()), []),
    referenceLow: v.optional(v.array(v.bigint()), []),
    referenceClose: v.optional(v.array(v.bigint()), []),
    referenceVolume: v.optional(v.array(v.bigint()), []),
    nextPageToken: v.optional(v.string(), ""),
});

function scaledArrayToDecimal(values: bigint[], scale: number): string[] {
    return values.map((value) => scaledToDecimalOutput(value, scale));
}

export function createCandleColumnarSchema(scales: SdkScales) {
    return v.pipe(
        CandleColumnarRawSchema,
        v.transform((d) => {
            const priceScale = scales.price();
            const referencePriceScale = scales.referencePrice(d.symbolId);
            const volumeScale = scales.marketDataVolume(d.symbolId);
            const referenceTsSec = d.referenceTsSec ?? [];
            const hasReference = referenceTsSec.length > 0;
            return {
                symbolId: d.symbolId,
                timeframe: d.timeframe,
                time: d.tsSec.map((t) => Number(t)),
                open: scaledArrayToDecimal(d.open, priceScale),
                high: scaledArrayToDecimal(d.high, priceScale),
                low: scaledArrayToDecimal(d.low, priceScale),
                close: scaledArrayToDecimal(d.close, priceScale),
                volume: scaledArrayToDecimal(d.volume, volumeScale),
                quoteVolume: d.quoteVolume,
                /** Closed-bucket flag per row; only an `includeIncomplete` open candle, last, is false. */
                isClosed: d.isClosed,
                nextPageToken: d.nextPageToken,
                reference: hasReference
                    ? {
                          time: referenceTsSec.map((t) => Number(t)),
                          open: scaledArrayToDecimal(d.referenceOpen ?? [], referencePriceScale),
                          high: scaledArrayToDecimal(d.referenceHigh ?? [], referencePriceScale),
                          low: scaledArrayToDecimal(d.referenceLow ?? [], referencePriceScale),
                          close: scaledArrayToDecimal(d.referenceClose ?? [], referencePriceScale),
                          volume: scaledArrayToDecimal(d.referenceVolume ?? [], volumeScale),
                      }
                    : null,
            };
        }),
    );
}

export function createCandleColumnarIntSchema(scales: SdkScales) {
    return v.pipe(
        CandleColumnarRawSchema,
        v.transform((d) => {
            const priceScale = scales.price();
            const referencePriceScale = scales.referencePrice(d.symbolId);
            const volumeScale = scales.marketDataVolume(d.symbolId);
            const referenceTsSec = d.referenceTsSec ?? [];
            return {
                symbolId: d.symbolId,
                timeframe: d.timeframe,
                tsSec: d.tsSec.map((t) => Number(t)),
                open: scaledArrayToDecimal(d.open, priceScale),
                high: scaledArrayToDecimal(d.high, priceScale),
                low: scaledArrayToDecimal(d.low, priceScale),
                close: scaledArrayToDecimal(d.close, priceScale),
                volume: scaledArrayToDecimal(d.volume, volumeScale),
                quoteVolume: d.quoteVolume,
                /** Closed-bucket flag per row; only an `includeIncomplete` open candle, last, is false. */
                isClosed: d.isClosed,
                nextPageToken: d.nextPageToken,
                reference:
                    referenceTsSec.length > 0
                        ? {
                              tsSec: referenceTsSec.map((t) => Number(t)),
                              open: scaledArrayToDecimal(
                                  d.referenceOpen ?? [],
                                  referencePriceScale,
                              ),
                              high: scaledArrayToDecimal(
                                  d.referenceHigh ?? [],
                                  referencePriceScale,
                              ),
                              low: scaledArrayToDecimal(d.referenceLow ?? [], referencePriceScale),
                              close: scaledArrayToDecimal(
                                  d.referenceClose ?? [],
                                  referencePriceScale,
                              ),
                              volume: scaledArrayToDecimal(d.referenceVolume ?? [], volumeScale),
                          }
                        : null,
            };
        }),
    );
}

export type Candle = v.InferOutput<ReturnType<typeof createCandleRowSchema>>;

/** One page of `candles.list`. */
export interface CandlePage {
    /** The market's candles, newest first. */
    candles: Candle[];
    /**
     * Composite reference market candles, newest first, priced at the pair's reference price
     * scale. Empty unless `includeReference` is set and reference data is available.
     */
    reference: Candle[];
    /** Pass as `pageToken` with the same request for older candles; `""` on the last page. */
    nextPageToken: string;
}
export type CandleInput = v.InferInput<ReturnType<typeof createCandleRowSchema>>;
export type CandleIntInput = v.InferInput<ReturnType<typeof createCandleRowIntSchema>>;
export type CandleInt = v.InferOutput<ReturnType<typeof createCandleRowIntSchema>>;
export type CandleColumnar = v.InferOutput<ReturnType<typeof createCandleColumnarSchema>>;
export type CandleColumnarInput = v.InferInput<ReturnType<typeof createCandleColumnarSchema>>;
export type CandleColumnarIntInput = v.InferInput<ReturnType<typeof createCandleColumnarIntSchema>>;
export type CandleColumnarInt = v.InferOutput<ReturnType<typeof createCandleColumnarIntSchema>>;

export const ListCandlesInputSchema = v.pipe(
    v.strictObject({
        symbolId: SymbolIdInputSchema,
        timeframe: TimeframeInputSchema,
        limit: OptionalPositiveNumberSchema,
        includeIncomplete: v.optional(v.boolean(), false),
        includeReference: OptionalBooleanSchema,
        startTsSec: OptionalTimestampSecondsInputSchema,
        endTsSec: OptionalTimestampSecondsInputSchema,
        pageToken: v.optional(v.pipe(v.string(), v.trim()), ""),
    }),
    v.transform((d) => ({
        symbolId: d.symbolId,
        timeframe: d.timeframe,
        limit: d.limit,
        includeIncomplete: d.includeIncomplete,
        includeReference: d.includeReference,
        startTime: d.startTsSec != null ? timestampFromTsSec(d.startTsSec) : undefined,
        endTime: d.endTsSec != null ? timestampFromTsSec(d.endTsSec) : undefined,
        pageToken: d.pageToken,
    })),
);

export function createListCandlesInputSchema() {
    return ListCandlesInputSchema;
}

export type GetCandlesInput = v.InferInput<ReturnType<typeof createListCandlesInputSchema>>;
export const createGetCandlesColumnsInputSchema = createListCandlesInputSchema;
export type GetCandlesColumnsInput = v.InferInput<ReturnType<typeof createListCandlesInputSchema>>;

/** Every timeframe but `1s`, which has no index price candles. */
const IndexPriceTimeframeInputSchema = v.pipe(
    v.picklist(TIMEFRAMES.filter((t): t is Exclude<Timeframe, "1s"> => t !== "1s")),
    v.transform((value) => TimeframeCodec.inputToProto[value]),
);

export const ListIndexPriceCandlesInputSchema = v.pipe(
    v.strictObject({
        symbolId: SymbolIdInputSchema,
        timeframe: IndexPriceTimeframeInputSchema,
        /** Default 500, at most 10000. */
        limit: OptionalPositiveNumberSchema,
        /** Inclusive lower bound on bucket start, epoch seconds. */
        startTsSec: OptionalTimestampSecondsInputSchema,
        /** Inclusive upper bound on bucket start, epoch seconds. */
        endTsSec: OptionalTimestampSecondsInputSchema,
        /** Previous `nextPageToken`; reuse only with the same symbol, timeframe and bounds. */
        pageToken: v.optional(v.pipe(v.string(), v.trim()), ""),
    }),
    v.transform((d) => ({
        symbolId: d.symbolId,
        timeframe: d.timeframe,
        limit: d.limit,
        startTime: d.startTsSec != null ? timestampFromTsSec(d.startTsSec) : undefined,
        endTime: d.endTsSec != null ? timestampFromTsSec(d.endTsSec) : undefined,
        pageToken: d.pageToken,
    })),
);

export type ListIndexPriceCandlesInput = v.InferInput<typeof ListIndexPriceCandlesInputSchema>;

/**
 * Formats one page of index price candles. Prices use the pair's reference price scale, the
 * scale of both series, not the primary candle price scale.
 */
export function formatIndexPriceCandles(
    scales: SdkScales,
    r: ProtoMarketData.GetIndexPriceCandlesResponse,
) {
    const scale = scales.referencePrice(r.symbolId);
    return {
        symbolId: r.symbolId,
        timeframe: timeframeFromProto(r.timeframe),
        /** Bucket start, epoch seconds, newest first. A missing bucket is a gap, never filled. */
        time: r.tsSec.map((t) => Number(t)),
        open: scaledArrayToDecimal(r.open, scale),
        high: scaledArrayToDecimal(r.high, scale),
        low: scaledArrayToDecimal(r.low, scale),
        close: scaledArrayToDecimal(r.close, scale),
        /** The series each candle comes from. */
        source: r.source.map((s) => enumLabel(IndexPriceCandleSourceCodec.protoToOutput, s)),
        /** Cursor for the next, older page; empty when none. */
        nextPageToken: r.nextPageToken,
    };
}

/** One page of a market's index price candles in columns: element i of each array is one candle. */
export type IndexPriceCandles = ReturnType<typeof formatIndexPriceCandles>;
