import * as Proto from "../../gen/marketdata/v1/marketdata_pb.js";
import * as v from "valibot";
import {
    createCatalogSnapshotReader,
    type CatalogReader,
    type CatalogSnapshot,
} from "../../catalogs/index.js";
import { createCatalogSchemaCache } from "../catalog-schema-cache.js";
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

export function createCandleRowSchema(catalog: CatalogSnapshot) {
    return createCandleRowSchemaForReader(createCatalogSnapshotReader(catalog));
}

function createCandleRowSchemaForReader(reader: CatalogReader) {
    return v.pipe(
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
                open: parseFloat(reader.orders.formatPrice(data.open, data.symbolId)),
                high: parseFloat(reader.orders.formatPrice(data.high, data.symbolId)),
                low: parseFloat(reader.orders.formatPrice(data.low, data.symbolId)),
                close: parseFloat(reader.orders.formatPrice(data.close, data.symbolId)),
                volume: parseFloat(reader.orders.formatQuantity(data.volume, data.symbolId)),
                isClosed: data.isClosed,
            };
        }),
    );
}

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

export function createCandleColumnarSchema(catalog: CatalogSnapshot) {
    return createCandleColumnarSchemaForReader(createCatalogSnapshotReader(catalog));
}

function createCandleColumnarSchemaForReader(reader: CatalogReader) {
    return v.pipe(
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
                open: d.open.map((o) => parseFloat(reader.orders.formatPrice(o, d.symbolId))),
                high: d.high.map((h) => parseFloat(reader.orders.formatPrice(h, d.symbolId))),
                low: d.low.map((l) => parseFloat(reader.orders.formatPrice(l, d.symbolId))),
                close: d.close.map((c) => parseFloat(reader.orders.formatPrice(c, d.symbolId))),
                volume: d.volume.map((v) =>
                    parseFloat(reader.orders.formatQuantity(v, d.symbolId)),
                ),
                reference: hasReference
                    ? {
                          time: referenceTsSec.map((t) => Number(t)),
                          open: referenceOpen.map((o) =>
                              parseFloat(reader.orders.formatPrice(o, d.symbolId)),
                          ),
                          high: referenceHigh.map((h) =>
                              parseFloat(reader.orders.formatPrice(h, d.symbolId)),
                          ),
                          low: referenceLow.map((l) =>
                              parseFloat(reader.orders.formatPrice(l, d.symbolId)),
                          ),
                          close: referenceClose.map((c) =>
                              parseFloat(reader.orders.formatPrice(c, d.symbolId)),
                          ),
                          volume: referenceVolume.map((v) =>
                              parseFloat(reader.orders.formatQuantity(v, d.symbolId)),
                          ),
                      }
                    : null,
            };
        }),
    );
}

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

export type Candle = v.InferOutput<ReturnType<typeof createCandleRowSchema>>;
export type CandleInput = v.InferInput<ReturnType<typeof createCandleRowSchema>>;
export type CandleIntInput = v.InferInput<typeof CandleRowIntSchema>;
export type CandleInt = v.InferOutput<typeof CandleRowIntSchema>;
export type CandleColumnar = v.InferOutput<ReturnType<typeof createCandleColumnarSchema>>;
export type CandleColumnarInput = v.InferInput<ReturnType<typeof createCandleColumnarSchema>>;
export type CandleColumnarIntInput = v.InferInput<typeof CandleColumnarIntSchema>;
export type CandleColumnarInt = v.InferOutput<typeof CandleColumnarIntSchema>;

export function createListCandlesInputSchema(catalog: CatalogSnapshot) {
    return createListCandlesInputSchemaForReader(createCatalogSnapshotReader(catalog));
}

function createListCandlesInputSchemaForReader(reader: CatalogReader) {
    return v.pipe(
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
                    return d.symbol
                        ? reader.market.requireSymbolIdByPairSymbol(d.symbol)
                        : undefined;
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
}

export type GetCandlesInput = v.InferInput<ReturnType<typeof createListCandlesInputSchema>>;
export const createGetCandlesColumnsInputSchema = createListCandlesInputSchema;
export type GetCandlesColumnsInput = v.InferInput<ReturnType<typeof createListCandlesInputSchema>>;

export function createCandlesSchemas(catalog: CatalogReader) {
    return createCatalogSchemaCache(catalog, (reader) => ({
        candleRow: createCandleRowSchemaForReader(reader),
        candleColumnar: createCandleColumnarSchemaForReader(reader),
        listCandlesInput: createListCandlesInputSchemaForReader(reader),
    }));
}
