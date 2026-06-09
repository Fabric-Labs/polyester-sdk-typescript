import * as Proto from "../../gen/marketdata/v1/marketdata_pb.js";
import * as v from "valibot";
import { parseOptionalPositiveIntLike } from "../../utils/numbers.js";
import { OptionalTimestampSecondsInputSchema } from "../../shared/schemas.js";
import { requiredEnumLabel } from "../../shared/proto-enum-codec.js";
import { TIMEFRAMES, TimeframeCodec } from "./candles.codecs.js";

export const TimeframeSchema = v.picklist(TIMEFRAMES);

export type Timeframe = v.InferOutput<typeof TimeframeSchema>;

function timeframeFromProto(value: Proto.Timeframe, schemaName: string): Timeframe {
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

export const CandleRowSchema = v.pipe(
    CandleRowRawSchema,
    v.transform((data) => ({
        symbolId: data.symbolId,
        timeframe: data.timeframe,
        time: Number(data.tsSec),
        openTicks: data.open.toString(),
        highTicks: data.high.toString(),
        lowTicks: data.low.toString(),
        closeTicks: data.close.toString(),
        volumeScaled: data.volume.toString(),
        isClosed: data.isClosed,
    })),
);

export function createCandleRowSchema() {
    return CandleRowSchema;
}

export const CandleRowIntSchema = CandleRowSchema;

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
});

function stringifyBigints(values: bigint[]): string[] {
    return values.map((value) => value.toString());
}

export const CandleColumnarSchema = v.pipe(
    CandleColumnarRawSchema,
    v.transform((d) => {
        const referenceTsSec = d.referenceTsSec ?? [];
        const hasReference = referenceTsSec.length > 0;
        return {
            symbolId: d.symbolId,
            timeframe: d.timeframe,
            time: d.tsSec.map((t) => Number(t)),
            openTicks: stringifyBigints(d.open),
            highTicks: stringifyBigints(d.high),
            lowTicks: stringifyBigints(d.low),
            closeTicks: stringifyBigints(d.close),
            volumeScaled: stringifyBigints(d.volume),
            reference: hasReference
                ? {
                      time: referenceTsSec.map((t) => Number(t)),
                      openTicks: stringifyBigints(d.referenceOpen ?? []),
                      highTicks: stringifyBigints(d.referenceHigh ?? []),
                      lowTicks: stringifyBigints(d.referenceLow ?? []),
                      closeTicks: stringifyBigints(d.referenceClose ?? []),
                      volumeScaled: stringifyBigints(d.referenceVolume ?? []),
                  }
                : null,
        };
    }),
);

export function createCandleColumnarSchema() {
    return CandleColumnarSchema;
}

export const CandleColumnarIntSchema = v.pipe(
    CandleColumnarRawSchema,
    v.transform((d) => {
        const referenceTsSec = d.referenceTsSec ?? [];
        return {
            symbolId: d.symbolId,
            timeframe: d.timeframe,
            tsSec: stringifyBigints(d.tsSec),
            openTicks: stringifyBigints(d.open),
            highTicks: stringifyBigints(d.high),
            lowTicks: stringifyBigints(d.low),
            closeTicks: stringifyBigints(d.close),
            volumeScaled: stringifyBigints(d.volume),
            reference:
                referenceTsSec.length > 0
                    ? {
                          tsSec: stringifyBigints(referenceTsSec),
                          openTicks: stringifyBigints(d.referenceOpen ?? []),
                          highTicks: stringifyBigints(d.referenceHigh ?? []),
                          lowTicks: stringifyBigints(d.referenceLow ?? []),
                          closeTicks: stringifyBigints(d.referenceClose ?? []),
                          volumeScaled: stringifyBigints(d.referenceVolume ?? []),
                      }
                    : null,
        };
    }),
);

export type Candle = v.InferOutput<ReturnType<typeof createCandleRowSchema>>;
export type CandleInput = v.InferInput<ReturnType<typeof createCandleRowSchema>>;
export type CandleIntInput = v.InferInput<typeof CandleRowIntSchema>;
export type CandleInt = v.InferOutput<typeof CandleRowIntSchema>;
export type CandleColumnar = v.InferOutput<ReturnType<typeof createCandleColumnarSchema>>;
export type CandleColumnarInput = v.InferInput<ReturnType<typeof createCandleColumnarSchema>>;
export type CandleColumnarIntInput = v.InferInput<typeof CandleColumnarIntSchema>;
export type CandleColumnarInt = v.InferOutput<typeof CandleColumnarIntSchema>;

export const ListCandlesInputSchema = v.pipe(
    v.object({
        symbolId: v.pipe(v.number(), v.integer(), v.gtValue(0)),
        timeframe: TimeframeInputSchema,
        limit: OptionalPositiveNumberSchema,
        includeIncomplete: v.optional(v.boolean(), false),
        includeReference: OptionalBooleanSchema,
        startTsSec: OptionalTimestampSecondsInputSchema,
        endTsSec: OptionalTimestampSecondsInputSchema,
    }),
    v.transform((d) => ({
        symbolId: d.symbolId,
        timeframe: d.timeframe,
        limit: d.limit,
        includeIncomplete: d.includeIncomplete,
        includeReference: d.includeReference,
        startTime: d.startTsSec != null ? timestampFromTsSec(d.startTsSec) : undefined,
        endTime: d.endTsSec != null ? timestampFromTsSec(d.endTsSec) : undefined,
    })),
);

export function createListCandlesInputSchema() {
    return ListCandlesInputSchema;
}

export type GetCandlesInput = v.InferInput<ReturnType<typeof createListCandlesInputSchema>>;
export const createGetCandlesColumnsInputSchema = createListCandlesInputSchema;
export type GetCandlesColumnsInput = v.InferInput<ReturnType<typeof createListCandlesInputSchema>>;
