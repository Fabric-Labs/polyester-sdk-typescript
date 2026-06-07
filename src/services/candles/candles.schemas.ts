import * as Proto from "../../gen/marketdata/v1/marketdata_pb.js";
import * as v from "valibot";
import { formatPriceForSymbol, formatQtyForSymbol } from "../../catalogs/orders-catalog.js";
import { getPair } from "../../catalogs/market-data-catalog.js";
import { parseOptionalPositiveIntLike, parseOptionalUint64Like } from "../../utils/numbers.js";
import { TIMEFRAMES, TimeframeCodec } from "./candles.codecs.js";
import type { ProtoTimeframe, SupportedProtoTimeframe } from "./candles.codecs.js";

export const TimeframeSchema = v.picklist(TIMEFRAMES);

export type Timeframe = v.InferOutput<typeof TimeframeSchema>;

function timeframeFromProto(value: Proto.Timeframe, schemaName: string): Timeframe {
    if (value === Proto.Timeframe.TIMEFRAME_UNSPECIFIED) {
        throw new Error(`[CandlesService.${schemaName}]: timeframe is required`);
    }
    const mapped = TimeframeCodec.protoToOutput[value];
    if (!mapped) {
        const name =
            (Proto.Timeframe as Record<number, string | undefined>)[value] ?? String(value);
        throw new Error(`[CandlesService.${schemaName}]: unsupported timeframe ${name}`);
    }
    return mapped;
}

function parseTimeframeInput(value: unknown): Proto.Timeframe {
    if (typeof value === "number") return value as Proto.Timeframe;
    if (typeof value !== "string") return Proto.Timeframe.TIMEFRAME_UNSPECIFIED;

    const trimmed = value.trim();
    if (!trimmed) return Proto.Timeframe.TIMEFRAME_UNSPECIFIED;

    // Alias support:
    // - chart UI often emits "1M"
    // - API/backend contract uses "1mo"
    if (trimmed === "1M") return TimeframeCodec.inputToProto["1mo"];

    // UI-friendly "1m" style
    if (trimmed in TimeframeCodec.inputToProto) {
        return TimeframeCodec.inputToProto[trimmed as Timeframe];
    }

    // Proto JSON "SEC_1" (enum name)
    const fromEnum = (Proto.Timeframe as Record<string, unknown>)[trimmed];
    if (typeof fromEnum === "number") return fromEnum as ProtoTimeframe;

    return Proto.Timeframe.TIMEFRAME_UNSPECIFIED;
}

const TimeframeInputSchema = v.pipe(
    v.union([TimeframeSchema, v.enum(Proto.Timeframe)]),
    v.transform((value) => parseTimeframeInput(value)),
    v.check(
        (v): v is SupportedProtoTimeframe =>
            v !== Proto.Timeframe.TIMEFRAME_UNSPECIFIED &&
            TimeframeCodec.protoToOutput[v] !== undefined,
        "timeframe is required",
    ),
);

const OptionalPositiveNumberSchema = v.pipe(
    v.optional(v.union([v.string(), v.number()])),
    v.transform((value) => parseOptionalPositiveIntLike(value)),
);

const OptionalSymbolIdSchema = v.pipe(
    v.optional(v.union([v.string(), v.number()])),
    v.transform((value) => parseOptionalPositiveIntLike(value)),
);

const OptionalBooleanSchema = v.optional(v.optional(v.boolean()), false);

const OptionalBigIntSchema = v.pipe(
    v.optional(v.union([v.string(), v.number(), v.bigint()])),
    v.transform((value) => parseOptionalUint64Like(value)),
);

// MessageInit-compatible timestamp (without $typeName which must be undefined for MessageInit)
type TimestampInit = { seconds: bigint; nanos: number };

function isTimestampLike(value: unknown): value is TimestampInit {
    if (typeof value !== "object" || value === null) return false;
    const v = value as Record<string, unknown>;
    return typeof v.seconds === "bigint" && typeof v.nanos === "number";
}

function dateToTimestampInit(date: Date): TimestampInit {
    const ms = date.getTime();
    const seconds = BigInt(Math.floor(ms / 1000));
    const nanos = (ms % 1000) * 1_000_000;
    return { seconds, nanos };
}

function toOptionalTimestamp(value: unknown): TimestampInit | undefined {
    if (value === undefined || value === null) return undefined;

    if (isTimestampLike(value)) return { seconds: value.seconds, nanos: value.nanos };

    if (value instanceof Date) {
        const ms = value.getTime();
        if (!Number.isFinite(ms)) return undefined;
        return dateToTimestampInit(value);
    }

    if (typeof value === "bigint") {
        if (value < 0n) return undefined;
        return dateToTimestampInit(new Date(Number(value) * 1000));
    }

    if (typeof value === "number") {
        if (!Number.isFinite(value)) return undefined;
        const sec = Math.trunc(value);
        if (sec < 0) return undefined;
        return dateToTimestampInit(new Date(sec * 1000));
    }

    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) return undefined;

        // Epoch seconds as string (protobuf JSON sometimes encodes int64/uint64 as string).
        if (/^\d+$/.test(trimmed)) return dateToTimestampInit(new Date(Number(trimmed) * 1000));

        // RFC3339 / ISO.
        const ms = Date.parse(trimmed);
        if (!Number.isFinite(ms)) return undefined;
        return dateToTimestampInit(new Date(ms));
    }

    return undefined;
}

const OptionalTimestampSchema = v.pipe(
    v.optional(
        v.union([
            v.string(),
            v.number(),
            v.bigint(),
            v.date(),
            v.custom<TimestampInit>(isTimestampLike),
        ]),
    ),
    v.transform((value) => toOptionalTimestamp(value)),
);

export const CandleRowSchema = v.pipe(
    v.object({
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
        isClosed: v.optional(v.optional(v.boolean()), false),
    }),
    v.transform((data) => {
        return {
            symbolId: data.symbolId,
            timeframe: data.timeframe,
            time: Number(data.tsSec),
            open: parseFloat(formatPriceForSymbol(data.open, data.symbolId)),
            high: parseFloat(formatPriceForSymbol(data.high, data.symbolId)),
            low: parseFloat(formatPriceForSymbol(data.low, data.symbolId)),
            close: parseFloat(formatPriceForSymbol(data.close, data.symbolId)),
            volume: parseFloat(formatQtyForSymbol(data.volume, data.symbolId)),
            isClosed: data.isClosed,
        };
    }),
);

export const CandleRowIntSchema = v.object({
    symbolId: v.number(),
    timeframe: v.pipe(
        v.enum(Proto.Timeframe),
        v.transform((v) => timeframeFromProto(v, "CandleRowIntSchema")),
    ),
    tsSec: v.bigint(),
    open: v.bigint(),
    high: v.bigint(),
    low: v.bigint(),
    close: v.bigint(),
    volume: v.bigint(),
    isClosed: v.optional(v.optional(v.boolean()), false),
});

export const CandlePointSchema = v.object({
    tsSec: v.bigint(),
    open: v.bigint(),
    high: v.bigint(),
    low: v.bigint(),
    close: v.bigint(),
    volume: v.bigint(),
    isClosed: v.optional(v.optional(v.boolean()), false),
});

export const CandleColumnarSchema = v.pipe(
    v.object({
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
        referenceTsSec: v.optional(v.optional(v.array(v.bigint())), []),
        referenceOpen: v.optional(v.optional(v.array(v.bigint())), []),
        referenceHigh: v.optional(v.optional(v.array(v.bigint())), []),
        referenceLow: v.optional(v.optional(v.array(v.bigint())), []),
        referenceClose: v.optional(v.optional(v.array(v.bigint())), []),
        referenceVolume: v.optional(v.optional(v.array(v.bigint())), []),
    }),
    v.transform((d) => {
        const referenceTsSec = d.referenceTsSec ?? [];
        const referenceOpen = d.referenceOpen ?? [];
        const referenceHigh = d.referenceHigh ?? [];
        const referenceLow = d.referenceLow ?? [];
        const referenceClose = d.referenceClose ?? [];
        const referenceVolume = d.referenceVolume ?? [];
        const hasReference = referenceTsSec.length > 0;
        return {
            symbolId: d.symbolId,
            timeframe: d.timeframe,
            time: d.tsSec.map((t) => Number(t)),
            open: d.open.map((o) => parseFloat(formatPriceForSymbol(o, d.symbolId))),
            high: d.high.map((h) => parseFloat(formatPriceForSymbol(h, d.symbolId))),
            low: d.low.map((l) => parseFloat(formatPriceForSymbol(l, d.symbolId))),
            close: d.close.map((c) => parseFloat(formatPriceForSymbol(c, d.symbolId))),
            volume: d.volume.map((v) => parseFloat(formatQtyForSymbol(v, d.symbolId))),
            reference: hasReference
                ? {
                      time: referenceTsSec.map((t) => Number(t)),
                      open: referenceOpen.map((o) =>
                          parseFloat(formatPriceForSymbol(o, d.symbolId)),
                      ),
                      high: referenceHigh.map((h) =>
                          parseFloat(formatPriceForSymbol(h, d.symbolId)),
                      ),
                      low: referenceLow.map((l) => parseFloat(formatPriceForSymbol(l, d.symbolId))),
                      close: referenceClose.map((c) =>
                          parseFloat(formatPriceForSymbol(c, d.symbolId)),
                      ),
                      volume: referenceVolume.map((v) =>
                          parseFloat(formatQtyForSymbol(v, d.symbolId)),
                      ),
                  }
                : null,
        };
    }),
);

export const CandleColumnarIntSchema = v.pipe(
    v.object({
        symbolId: v.number(),
        timeframe: v.pipe(
            v.enum(Proto.Timeframe),
            v.transform((v) => timeframeFromProto(v, "CandleColumnarIntSchema")),
        ),
        tsSec: v.array(v.bigint()),
        open: v.array(v.bigint()),
        high: v.array(v.bigint()),
        low: v.array(v.bigint()),
        close: v.array(v.bigint()),
        volume: v.array(v.bigint()),
        referenceTsSec: v.optional(v.optional(v.array(v.bigint())), []),
        referenceOpen: v.optional(v.optional(v.array(v.bigint())), []),
        referenceHigh: v.optional(v.optional(v.array(v.bigint())), []),
        referenceLow: v.optional(v.optional(v.array(v.bigint())), []),
        referenceClose: v.optional(v.optional(v.array(v.bigint())), []),
        referenceVolume: v.optional(v.optional(v.array(v.bigint())), []),
    }),
    v.transform((d) => {
        const referenceTsSec = d.referenceTsSec ?? [];
        return {
            symbolId: d.symbolId,
            timeframe: d.timeframe,
            tsSec: d.tsSec,
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close,
            volume: d.volume,
            reference:
                referenceTsSec.length > 0
                    ? {
                          tsSec: referenceTsSec,
                          open: d.referenceOpen ?? [],
                          high: d.referenceHigh ?? [],
                          low: d.referenceLow ?? [],
                          close: d.referenceClose ?? [],
                          volume: d.referenceVolume ?? [],
                      }
                    : null,
        };
    }),
);

export type Candle = v.InferOutput<typeof CandleRowSchema>;
export type CandleInput = v.InferInput<typeof CandleRowSchema>;
export type CandleIntInput = v.InferInput<typeof CandleRowIntSchema>;
export type CandleInt = v.InferOutput<typeof CandleRowIntSchema>;
export type CandleColumnar = v.InferOutput<typeof CandleColumnarSchema>;
export type CandleColumnarInput = v.InferInput<typeof CandleColumnarSchema>;
export type CandleColumnarIntInput = v.InferInput<typeof CandleColumnarIntSchema>;
export type CandleColumnarInt = v.InferOutput<typeof CandleColumnarIntSchema>;

export const ListCandlesInputSchema = v.pipe(
    v.object({
        symbol: v.optional(v.pipe(v.string(), v.minLength(1))),
        symbolId: OptionalSymbolIdSchema,
        timeframe: TimeframeInputSchema,
        limit: OptionalPositiveNumberSchema,
        includeIncomplete: v.optional(v.optional(v.boolean()), false),
        includeReference: OptionalBooleanSchema,
        // Proto fields (preferred): google.protobuf.Timestamp
        startTime: OptionalTimestampSchema,
        endTime: OptionalTimestampSchema,
        // Back-compat: older callers pass epoch seconds. We map these to startTime/endTime.
        startTsSec: OptionalBigIntSchema,
        endTsSec: OptionalBigIntSchema,
    }),
    v.transform((d) => {
        const resolvedSymbolId =
            d.symbolId ??
            (() => {
                const pair = d.symbol ? getPair(d.symbol) : undefined;
                return pair?.symbolId;
            })();

        if (!resolvedSymbolId || resolvedSymbolId <= 0) {
            throw new Error("symbolId is required and must be > 0");
        }

        const startTime =
            d.startTime ??
            (d.startTsSec != null
                ? dateToTimestampInit(new Date(Number(d.startTsSec) * 1000))
                : undefined);
        const endTime =
            d.endTime ??
            (d.endTsSec != null
                ? dateToTimestampInit(new Date(Number(d.endTsSec) * 1000))
                : undefined);

        return {
            symbolId: resolvedSymbolId,
            timeframe: d.timeframe,
            limit: d.limit,
            includeIncomplete: d.includeIncomplete,
            includeReference: d.includeReference,
            startTime,
            endTime,
        };
    }),
);

export type GetCandlesInput = v.InferInput<typeof ListCandlesInputSchema>;
export const GetCandlesColumnsInputSchema = ListCandlesInputSchema;
export type GetCandlesColumnsInput = v.InferInput<typeof GetCandlesColumnsInputSchema>;
