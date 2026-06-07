import * as Proto from "../../gen/marketdata/v1/marketdata_pb.js";
import { z } from "zod";
import { formatPriceForSymbol, formatQtyForSymbol } from "../../catalogs/orders-catalog.js";
import { getPair } from "../../catalogs/market-data-catalog.js";
import { parseOptionalPositiveIntLike, parseOptionalUint64Like } from "../../utils/numbers.js";
import { TIMEFRAMES, TimeframeCodec } from "./candles.codecs.js";
import type { ProtoTimeframe, SupportedProtoTimeframe } from "./candles.codecs.js";

export const TimeframeSchema = z.enum(TIMEFRAMES);

export type Timeframe = z.output<typeof TimeframeSchema>;

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

const TimeframeInputSchema = z
	.union([TimeframeSchema, z.enum(Proto.Timeframe)])
	.transform(parseTimeframeInput)
	.refine(
		(v): v is SupportedProtoTimeframe =>
			v !== Proto.Timeframe.TIMEFRAME_UNSPECIFIED && TimeframeCodec.protoToOutput[v] !== undefined,
		{
			message: "timeframe is required",
		}
	);

const OptionalPositiveNumberSchema = z
	.union([z.string(), z.number()])
	.optional()
	.transform(parseOptionalPositiveIntLike);

const OptionalSymbolIdSchema = z
	.union([z.string(), z.number()])
	.optional()
	.transform(parseOptionalPositiveIntLike);

const OptionalBooleanSchema = z.boolean().optional().default(false);

const OptionalBigIntSchema = z
	.union([z.string(), z.number(), z.bigint()])
	.optional()
	.transform(parseOptionalUint64Like);

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

const OptionalTimestampSchema = z
	.union([z.string(), z.number(), z.bigint(), z.date(), z.custom<TimestampInit>(isTimestampLike)])
	.optional()
	.transform(toOptionalTimestamp);

export const CandleRowSchema = z
	.object({
		symbolId: z.number(),
		timeframe: z
			.enum(Proto.Timeframe)
			.transform((v) => timeframeFromProto(v, "CandleRowSchema")),
		tsSec: z.bigint(),
		open: z.bigint(),
		high: z.bigint(),
		low: z.bigint(),
		close: z.bigint(),
		volume: z.bigint(),
		isClosed: z.boolean().optional().default(false),
	})
	.transform((data) => {
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
	});

export const CandleRowIntSchema = z.object({
	symbolId: z.number(),
	timeframe: z
		.enum(Proto.Timeframe)
		.transform((v) => timeframeFromProto(v, "CandleRowIntSchema")),
	tsSec: z.bigint(),
	open: z.bigint(),
	high: z.bigint(),
	low: z.bigint(),
	close: z.bigint(),
	volume: z.bigint(),
	isClosed: z.boolean().optional().default(false),
});

export const CandlePointSchema = z.object({
	tsSec: z.bigint(),
	open: z.bigint(),
	high: z.bigint(),
	low: z.bigint(),
	close: z.bigint(),
	volume: z.bigint(),
	isClosed: z.boolean().optional().default(false),
});

export const CandleColumnarSchema = z
	.object({
		symbolId: z.number(),
		timeframe: z
			.enum(Proto.Timeframe)
			.transform((v) => timeframeFromProto(v, "CandleColumnarSchema")),
		tsSec: z.array(z.bigint()),
		open: z.array(z.bigint()),
		high: z.array(z.bigint()),
		low: z.array(z.bigint()),
		close: z.array(z.bigint()),
		volume: z.array(z.bigint()),
		referenceTsSec: z.array(z.bigint()).optional().default([]),
		referenceOpen: z.array(z.bigint()).optional().default([]),
		referenceHigh: z.array(z.bigint()).optional().default([]),
		referenceLow: z.array(z.bigint()).optional().default([]),
		referenceClose: z.array(z.bigint()).optional().default([]),
		referenceVolume: z.array(z.bigint()).optional().default([]),
	})
	.transform((d) => {
		const hasReference = d.referenceTsSec.length > 0;
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
						time: d.referenceTsSec.map((t) => Number(t)),
						open: d.referenceOpen.map((o) =>
							parseFloat(formatPriceForSymbol(o, d.symbolId))
						),
						high: d.referenceHigh.map((h) =>
							parseFloat(formatPriceForSymbol(h, d.symbolId))
						),
						low: d.referenceLow.map((l) =>
							parseFloat(formatPriceForSymbol(l, d.symbolId))
						),
						close: d.referenceClose.map((c) =>
							parseFloat(formatPriceForSymbol(c, d.symbolId))
						),
						volume: d.referenceVolume.map((v) =>
							parseFloat(formatQtyForSymbol(v, d.symbolId))
						),
					}
				: null,
		};
	});

export const CandleColumnarIntSchema = z
	.object({
		symbolId: z.number(),
		timeframe: z
			.enum(Proto.Timeframe)
			.transform((v) => timeframeFromProto(v, "CandleColumnarIntSchema")),
		tsSec: z.array(z.bigint()),
		open: z.array(z.bigint()),
		high: z.array(z.bigint()),
		low: z.array(z.bigint()),
		close: z.array(z.bigint()),
		volume: z.array(z.bigint()),
		referenceTsSec: z.array(z.bigint()).optional().default([]),
		referenceOpen: z.array(z.bigint()).optional().default([]),
		referenceHigh: z.array(z.bigint()).optional().default([]),
		referenceLow: z.array(z.bigint()).optional().default([]),
		referenceClose: z.array(z.bigint()).optional().default([]),
		referenceVolume: z.array(z.bigint()).optional().default([]),
	})
	.transform((d) => ({
		symbolId: d.symbolId,
		timeframe: d.timeframe,
		tsSec: d.tsSec,
		open: d.open,
		high: d.high,
		low: d.low,
		close: d.close,
		volume: d.volume,
		reference:
			d.referenceTsSec.length > 0
				? {
						tsSec: d.referenceTsSec,
						open: d.referenceOpen,
						high: d.referenceHigh,
						low: d.referenceLow,
						close: d.referenceClose,
						volume: d.referenceVolume,
					}
				: null,
	}));

export type Candle = z.output<typeof CandleRowSchema>;
export type CandleInput = z.input<typeof CandleRowSchema>;
export type CandleIntInput = z.input<typeof CandleRowIntSchema>;
export type CandleInt = z.output<typeof CandleRowIntSchema>;
export type CandleColumnar = z.output<typeof CandleColumnarSchema>;
export type CandleColumnarInput = z.input<typeof CandleColumnarSchema>;
export type CandleColumnarIntInput = z.input<typeof CandleColumnarIntSchema>;
export type CandleColumnarInt = z.output<typeof CandleColumnarIntSchema>;

export const ListCandlesInputSchema = z
	.object({
		symbol: z.string().min(1).optional(),
		symbolId: OptionalSymbolIdSchema,
		timeframe: TimeframeInputSchema,
		limit: OptionalPositiveNumberSchema,
		includeIncomplete: z.boolean().optional().default(false),
		includeReference: OptionalBooleanSchema,
		// Proto fields (preferred): google.protobuf.Timestamp
		startTime: OptionalTimestampSchema,
		endTime: OptionalTimestampSchema,
		// Back-compat: older callers pass epoch seconds. We map these to startTime/endTime.
		startTsSec: OptionalBigIntSchema,
		endTsSec: OptionalBigIntSchema,
	})
	.transform((d) => {
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
	});

export type GetCandlesInput = z.input<typeof ListCandlesInputSchema>;
export const GetCandlesColumnsInputSchema = ListCandlesInputSchema;
export type GetCandlesColumnsInput = z.input<typeof GetCandlesColumnsInputSchema>;
