import * as Proto from "../../gen/marketdata/v1/marketdata_pb.js";
import * as v from "valibot";
import { formatPriceForSymbol, formatQtyForSymbol } from "../../catalogs/orders-catalog.js";
import { getPair } from "../../catalogs/market-data-catalog.js";
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

const OptionalSymbolIdSchema = v.pipe(
    v.optional(v.union([v.string(), v.number()])),
    v.transform((value) => parseOptionalPositiveIntLike(value)),
);

const OptionalBooleanSchema = v.optional(v.boolean(), false);

type TimestampInit = { seconds: bigint; nanos: number };

function timestampFromTsSec(tsSec: bigint): TimestampInit {
    return { seconds: tsSec, nanos: 0 };
}

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
        isClosed: v.optional(v.boolean(), false),
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
    isClosed: v.optional(v.boolean(), false),
});

export const CandlePointSchema = v.object({
    tsSec: v.bigint(),
    open: v.bigint(),
    high: v.bigint(),
    low: v.bigint(),
    close: v.bigint(),
    volume: v.bigint(),
    isClosed: v.optional(v.boolean(), false),
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
        referenceTsSec: v.optional(v.array(v.bigint()), []),
        referenceOpen: v.optional(v.array(v.bigint()), []),
        referenceHigh: v.optional(v.array(v.bigint()), []),
        referenceLow: v.optional(v.array(v.bigint()), []),
        referenceClose: v.optional(v.array(v.bigint()), []),
        referenceVolume: v.optional(v.array(v.bigint()), []),
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
        referenceTsSec: v.optional(v.array(v.bigint()), []),
        referenceOpen: v.optional(v.array(v.bigint()), []),
        referenceHigh: v.optional(v.array(v.bigint()), []),
        referenceLow: v.optional(v.array(v.bigint()), []),
        referenceClose: v.optional(v.array(v.bigint()), []),
        referenceVolume: v.optional(v.array(v.bigint()), []),
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
        includeIncomplete: v.optional(v.boolean(), false),
        includeReference: OptionalBooleanSchema,
        startTsSec: OptionalTimestampSecondsInputSchema,
        endTsSec: OptionalTimestampSecondsInputSchema,
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

        return {
            symbolId: resolvedSymbolId,
            timeframe: d.timeframe,
            limit: d.limit,
            includeIncomplete: d.includeIncomplete,
            includeReference: d.includeReference,
            startTime: d.startTsSec != null ? timestampFromTsSec(d.startTsSec) : undefined,
            endTime: d.endTsSec != null ? timestampFromTsSec(d.endTsSec) : undefined,
        };
    }),
);

export type GetCandlesInput = v.InferInput<typeof ListCandlesInputSchema>;
export const GetCandlesColumnsInputSchema = ListCandlesInputSchema;
export type GetCandlesColumnsInput = v.InferInput<typeof GetCandlesColumnsInputSchema>;
