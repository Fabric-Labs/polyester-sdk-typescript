import { z } from "zod";
import {
	HeatmapDepth,
	HeatmapInterval,
	HeatmapQuantityMode,
	type GetOrderbookHeatmapResponse,
} from "../../gen/marketdata/v1/heatmap_pb.js";
import { getPair } from "../../catalogs/market-data-catalog.js";
import {
	HeatmapDepthCodec,
	HeatmapIntervalCodec,
	HeatmapQuantityModeCodec,
	type HeatmapDepthValue,
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
			startTime?: Date;
			endTime?: Date;
	  };

const IntervalInputSchema = z
	.union([z.number(), z.string()])
	.optional()
	.transform((value): HeatmapInterval => {
		if (typeof value === "number" && value in HeatmapIntervalCodec.protoToOutput) {
			return value as HeatmapInterval;
		}
		if (typeof value !== "string" || !value) return HeatmapIntervalCodec.inputToProto["1s"];
		const mapped = HeatmapIntervalCodec.inputToProto[value as HeatmapIntervalValue];
		return mapped ?? HeatmapIntervalCodec.inputToProto["1s"];
	});

function parseDepthValue(value: unknown): HeatmapDepth {
	if (typeof value === "number" && value in HeatmapDepthCodec.protoToOutput) {
		return value as HeatmapDepth;
	}
	const numeric = Number(value);
	if (!Number.isFinite(numeric)) return HeatmapDepthCodec.inputToProto[50];
	const rounded = Math.trunc(numeric);
	const closest = HeatmapDepthCodec.supportedDepths.reduce((previous, current) =>
		Math.abs(current - rounded) < Math.abs(previous - rounded) ? current : previous
	);
	return HeatmapDepthCodec.inputToProto[closest as HeatmapDepthValue];
}

const DepthInputSchema = z
	.union([z.number(), z.string()])
	.optional()
	.transform((value): HeatmapDepth => parseDepthValue(value));

const QuantityModeInputSchema = z
	.union([z.number(), z.string()])
	.optional()
	.transform((value): HeatmapQuantityMode => {
		if (typeof value === "number" && value in HeatmapQuantityModeCodec.protoToOutput) {
			return value as HeatmapQuantityMode;
		}
		if (typeof value !== "string" || !value) return HeatmapQuantityModeCodec.inputToProto.close;
		const mapped = HeatmapQuantityModeCodec.inputToProto[value as HeatmapQuantityModeValue];
		return mapped ?? HeatmapQuantityModeCodec.inputToProto.close;
	});

function toDate(value: unknown): Date | undefined {
	if (value == null) return undefined;
	if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : undefined;
	if (typeof value === "number") {
		if (!Number.isFinite(value)) return undefined;
		return new Date(value);
	}
	if (typeof value === "bigint") return new Date(Number(value));
	if (typeof value === "string") {
		const trimmed = value.trim();
		if (!trimmed) return undefined;
		const epochSecondsMatch = /^\d+$/.test(trimmed);
		if (epochSecondsMatch) return new Date(Number(trimmed) * 1000);
		const parsed = Date.parse(trimmed);
		return Number.isFinite(parsed) ? new Date(parsed) : undefined;
	}
	return undefined;
}

const TimestampLikeSchema = z
	.union([z.number(), z.bigint(), z.string(), z.date()])
	.optional()
	.transform(toDate);

const CursorInputSchema = z
	.union([z.number(), z.bigint(), z.string()])
	.optional()
	.transform((value): bigint | undefined => {
		if (value == null) return undefined;
		if (typeof value === "bigint") return value;
		if (typeof value === "number") {
			if (!Number.isFinite(value)) return undefined;
			const truncated = Math.trunc(value);
			return truncated > 0 ? BigInt(truncated) : undefined;
		}
		const trimmed = value.trim();
		if (!trimmed) return undefined;
		const bigint = BigInt(trimmed);
		return bigint > 0n ? bigint : undefined;
	});

export const GetOrderbookHeatmapInputSchema = z
	.object({
		symbol: z.string().min(1).optional(),
		symbolId: z.number().int().positive().optional(),
		interval: IntervalInputSchema,
		depth: DepthInputSchema,
		quantityMode: QuantityModeInputSchema,
		limit: z.number().int().positive().max(20_000).optional(),
		startTime: TimestampLikeSchema,
		endTime: TimestampLikeSchema,
		cursorTsSec: CursorInputSchema,
	})
	.transform((value) => {
		const symbolId =
			value.symbolId ??
			(() => {
				const pair = value.symbol ? getPair(value.symbol) : undefined;
				return pair?.symbolId;
			})();
		if (!symbolId || symbolId <= 0) {
			throw new Error("symbolId is required and must be > 0");
		}

		const mode: HeatmapMode =
			value.cursorTsSec != null
				? { case: "cursor", fromTsSec: value.cursorTsSec }
				: {
						case: "timeRange",
						startTime: value.startTime,
						endTime: value.endTime,
					};

		return {
			symbolId,
			interval: value.interval,
			depth: value.depth,
			quantityMode: value.quantityMode,
			limit: value.limit,
			mode,
		};
	});

export type GetOrderbookHeatmapInput = z.input<typeof GetOrderbookHeatmapInputSchema>;
export type ParsedGetOrderbookHeatmapInput = z.output<typeof GetOrderbookHeatmapInputSchema>;
export type OrderbookHeatmapResponse = GetOrderbookHeatmapResponse;
export type ParsedHeatmapMode = HeatmapMode;
