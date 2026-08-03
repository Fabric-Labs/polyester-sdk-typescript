import * as Proto from "../../gen/marketdata/v1/marketdata_pb.js";
import * as v from "valibot";
import { parseOptionalPositiveIntLike } from "../../utils/numbers.js";
import type { DecodedEnum } from "../../utils/types.js";
import { OptionalTimestampSecondsInputSchema } from "../../shared/schemas.js";
import { requiredEnumLabel } from "../../shared/proto-enum-codec.js";
import { scaledToDecimalOutput, type SdkScales } from "../../shared/decimal-surface.js";
import { TIMEFRAMES, TimeframeCodec } from "./candles.codecs.js";

export const TimeframeSchema = v.picklist(TIMEFRAMES);

export type Timeframe = v.InferOutput<typeof TimeframeSchema>;

function timeframeFromProto(value: Proto.Timeframe, schemaName: string): DecodedEnum<Timeframe> {
    return requiredEnumLabel(
        TimeframeCodec.protoToOutput,
        value,
        `CandlesService.${schemaName}`,
        "timeframe",
    );
}

const TimeframeInputSchema = v.pipe(
    TimeframeSchema,
    v.transform((value) => TimeframeCodec.inputToProto[value]),
);

const OptionalPositiveNumberSchema = v.pipe(
    v.optional(v.union([v.string(), v.number()])),
    v.transform((value) => parseOptionalPositiveIntLike(value)),
);

const OptionalBooleanSchema = v.optional(v.boolean(), false);

type TimestampInit = { seconds: bigint; nanos: number };

function timestampFromTsSec(tsSec: bigint): TimestampInit {
    return { seconds: tsSec, nanos: 0 };
}

const CandleRowRawSchema = v.object({
    symbolId: v.number(),
    timeframe: v.pipe(
        v.enum(Proto.Timeframe),
        v.transform((v) => timeframeFromProto(v, "CandleRowSchema")),
    ),
    tsSec: v.bigint(),
    open: v.bigint(),
    high: v.bigint(),
    low: v.bigint(),
    close: v.bigint(),
    volume: v.bigint(),
    isClosed: v.optional(v.boolean(), false),
});

export function createCandleRowSchema(scales: SdkScales) {
    return v.pipe(
        CandleRowRawSchema,
        v.transform((data) => {
            const priceScale = scales.price();
            return {
                symbolId: data.symbolId,
                timeframe: data.timeframe,
                time: Number(data.tsSec),
                open: scaledToDecimalOutput(data.open, priceScale),
                high: scaledToDecimalOutput(data.high, priceScale),
                low: scaledToDecimalOutput(data.low, priceScale),
                close: scaledToDecimalOutput(data.close, priceScale),
                volume: scaledToDecimalOutput(data.volume, scales.baseQty(data.symbolId)),
                isClosed: data.isClosed,
            };
        }),
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
    isClosed: v.optional(v.boolean(), false),
});

const CandleColumnarRawSchema = v.object({
    symbolId: v.number(),
    timeframe: v.pipe(
        v.enum(Proto.Timeframe),
        v.transform((v) => timeframeFromProto(v, "CandleColumnarSchema")),
    ),
    tsSec: v.array(v.bigint()),
    open: v.array(v.bigint()),
    high: v.array(v.bigint()),
    low: v.array(v.bigint()),
    close: v.array(v.bigint()),
    volume: v.array(v.bigint()),
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
            const volumeScale = scales.baseQty(d.symbolId);
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
                nextPageToken: d.nextPageToken,
                reference: hasReference
                    ? {
                          time: referenceTsSec.map((t) => Number(t)),
                          open: scaledArrayToDecimal(d.referenceOpen ?? [], priceScale),
                          high: scaledArrayToDecimal(d.referenceHigh ?? [], priceScale),
                          low: scaledArrayToDecimal(d.referenceLow ?? [], priceScale),
                          close: scaledArrayToDecimal(d.referenceClose ?? [], priceScale),
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
            const volumeScale = scales.baseQty(d.symbolId);
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
                nextPageToken: d.nextPageToken,
                reference:
                    referenceTsSec.length > 0
                        ? {
                              tsSec: referenceTsSec.map((t) => Number(t)),
                              open: scaledArrayToDecimal(d.referenceOpen ?? [], priceScale),
                              high: scaledArrayToDecimal(d.referenceHigh ?? [], priceScale),
                              low: scaledArrayToDecimal(d.referenceLow ?? [], priceScale),
                              close: scaledArrayToDecimal(d.referenceClose ?? [], priceScale),
                              volume: scaledArrayToDecimal(d.referenceVolume ?? [], volumeScale),
                          }
                        : null,
            };
        }),
    );
}

export type Candle = v.InferOutput<ReturnType<typeof createCandleRowSchema>>;
export type CandleInput = v.InferInput<ReturnType<typeof createCandleRowSchema>>;
export type CandleIntInput = v.InferInput<ReturnType<typeof createCandleRowIntSchema>>;
export type CandleInt = v.InferOutput<ReturnType<typeof createCandleRowIntSchema>>;
export type CandleColumnar = v.InferOutput<ReturnType<typeof createCandleColumnarSchema>>;
export type CandleColumnarInput = v.InferInput<ReturnType<typeof createCandleColumnarSchema>>;
export type CandleColumnarIntInput = v.InferInput<ReturnType<typeof createCandleColumnarIntSchema>>;
export type CandleColumnarInt = v.InferOutput<ReturnType<typeof createCandleColumnarIntSchema>>;

export const ListCandlesInputSchema = v.pipe(
    v.object({
        symbolId: v.pipe(v.number(), v.integer(), v.gtValue(0)),
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
