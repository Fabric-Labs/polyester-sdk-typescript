import * as Proto from "../../gen/triggers/v1/triggers_pb.js";
import * as ProtoOrders from "../../gen/orders/v1/orders_pb.js";
import { z } from "zod";
import { TimestampSchema } from "../../shared/schemas.js";
import {
	parsePriceTicks,
	parseQtyScaled,
	parseOptionalPositiveIntLike,
} from "../../utils/numbers.js";
import { tsNsToMs } from "../../utils/time.js";
import { formatId, idToBigInt } from "../../utils/base58-id.js";
import {
	formatPriceForSymbol,
	formatQtyForSymbol,
	sideLabelFor,
	orderTypeLabelFor,
	tifLabelFor,
	stpModeLabelFor,
	feeSourceLabelFor,
} from "../../catalogs/orders-catalog.js";
import {
	baseAssetForSymbolId,
	baseQuantityScaleForSymbol,
	quoteAssetForSymbolId,
	symbolForSymbolId,
} from "../../catalogs/market-data-catalog.js";
import {
	TriggerTypeCodec,
	TriggerStatusCodec,
	OrderTypeCodec,
	TifCodec,
	FeeSourceCodec,
	StpModeCodec,
	TriggerPriceSourceCodec,
	TriggerDirectionCodec,
	LadderDistributionCodec,
	TriggerSideCodec,
	TriggerEventTypeCodec,
} from "./triggers.codecs.js";

const TriggerTypeSchema = z.enum(["stop_loss", "take_profit", "trailing_stop", "twap", "ladder"]);

const TriggerStatusFilterSchema = z.enum([
	"created",
	"armed",
	"running",
	"completed",
	"cancelled",
	"failed",
	"paused",
]);

const OrderTypeSchema = z.enum(["limit", "market"]);
const TIFSchema = z.enum(["gtc", "ioc", "fok"]);
const FeeSourceSchema = z.enum(["quote", "received"]);
const STPSchema = z.enum(["expire_taker", "expire_maker", "expire_both"]);
const TriggerPriceSourceSchema = z.enum(["last", "index", "mark"]);
const TriggerDirectionSchema = z.enum(["above", "below"]);
const LadderDistributionSchema = z.enum(["linear"]);

const TrailingDistanceInputSchema = z.union([
	z.object({
		kind: z.literal("ticks"),
		ticks: z.union([z.string().trim().min(1), z.number().positive()]),
	}),
	z.object({
		kind: z.literal("bps"),
		bps: z.union([z.string().trim().min(1), z.number().positive()]),
	}),
	z.object({
		kind: z.literal("percent"),
		percent: z.union([z.string().trim().min(1), z.number().positive()]),
	}),
	z.object({
		kind: z.literal("quote"),
		quote: z.string().trim().min(1),
	}),
]);

const MaxSlippageInputSchema = z.union([
	z.object({
		kind: z.literal("ticks"),
		ticks: z.union([z.string().trim().min(1), z.number().positive()]),
	}),
	z.object({
		kind: z.literal("bps"),
		bps: z.union([z.string().trim().min(1), z.number().positive()]),
	}),
	z.object({
		kind: z.literal("percent"),
		percent: z.union([z.string().trim().min(1), z.number().positive()]),
	}),
	z.object({
		kind: z.literal("quote"),
		quote: z.string().trim().min(1),
	}),
	z.object({
		kind: z.literal("none"),
	}),
]);

type TrailingDistanceOneof = Proto.CreateTriggerRequest["trailingDistance"];
type MaxSlippageOneof = Proto.CreateTriggerRequest["maxSlippage"];

function parseTrailingDistance(
	distance: z.output<typeof TrailingDistanceInputSchema>
): TrailingDistanceOneof {
	if (distance.kind === "ticks") {
		const ticks = parseOptionalPositiveIntLike(distance.ticks);
		if (ticks === undefined || ticks <= 0) {
			throw new Error("trailingDistanceTicks must be a positive integer");
		}
		return { case: "trailingDistanceTicks", value: BigInt(ticks) };
	}
	if (distance.kind === "quote") {
		const ticks = parsePriceTicks(distance.quote, "trailingDistance");
		return { case: "trailingDistanceTicks", value: ticks };
	}
	if (distance.kind === "percent") {
		const percent =
			typeof distance.percent === "string" ? parseFloat(distance.percent) : distance.percent;
		if (!Number.isFinite(percent) || percent <= 0) {
			throw new Error("trailingDistancePercent must be a positive number");
		}
		return { case: "trailingDistanceBps", value: Math.round(percent * 100) };
	}
	const bps = parseOptionalPositiveIntLike(distance.bps);
	if (bps === undefined || bps <= 0) {
		throw new Error("trailingDistanceBps must be a positive integer");
	}
	return { case: "trailingDistanceBps", value: bps };
}

function parseMaxSlippage(
	slippage: z.output<typeof MaxSlippageInputSchema> | undefined
): MaxSlippageOneof {
	if (!slippage || slippage.kind === "none") {
		return { case: undefined, value: undefined };
	}
	if (slippage.kind === "ticks") {
		const ticks = parseOptionalPositiveIntLike(slippage.ticks);
		if (ticks === undefined || ticks <= 0) {
			throw new Error("maxSlippageTicks must be a positive integer");
		}
		return { case: "maxSlippageTicks", value: ticks };
	}
	if (slippage.kind === "quote") {
		const ticks = parsePriceTicks(slippage.quote, "maxSlippage");
		return { case: "maxSlippageTicks", value: Number(ticks) };
	}
	if (slippage.kind === "percent") {
		const percent =
			typeof slippage.percent === "string" ? parseFloat(slippage.percent) : slippage.percent;
		if (!Number.isFinite(percent) || percent <= 0) {
			throw new Error("maxSlippagePercent must be a positive number");
		}
		return { case: "maxSlippageBps", value: Math.round(percent * 100) };
	}
	const bps = parseOptionalPositiveIntLike(slippage.bps);
	if (bps === undefined || bps <= 0) {
		throw new Error("maxSlippageBps must be a positive integer");
	}
	return { case: "maxSlippageBps", value: bps };
}

const SideInputSchema = z.enum(["buy", "sell"]);

const BaseChildOrderFieldsSchema = z.object({
	subAccountId: z
		.string()
		.trim()
		.optional()
		.transform((v) => (v ? idToBigInt(v, "subaccountId") : 0n)),
	symbol: z.string().trim().min(1),
	clientTriggerId: z
		.string()
		.trim()
		.optional()
		.default(() => crypto.randomUUID()),
	side: SideInputSchema.transform((v) => TriggerSideCodec.inputToProto[v]),
	orderType: OrderTypeSchema.transform((v) => OrderTypeCodec.inputToProto[v]),
	tif: TIFSchema.transform((v) => TifCodec.inputToProto[v]),
	qty: z.string().trim().min(1),
	limitPrice: z.string().trim().optional(),
	feeSource: FeeSourceSchema.optional().transform((v) =>
		v ? FeeSourceCodec.inputToProto[v] : ProtoOrders.FeeSource.QUOTE
	),
	stpMode: STPSchema.optional().transform((v) =>
		v ? StpModeCodec.inputToProto[v] : ProtoOrders.STPMode.EXPIRE_MAKER
	),
	postOnly: z.boolean().optional().default(false),
});

const UNSET_TRAILING_DISTANCE: TrailingDistanceOneof = { case: undefined, value: undefined };
const UNSET_MAX_SLIPPAGE: MaxSlippageOneof = { case: undefined, value: undefined };

function parseQtyScaledForSymbol(symbol: string, qty: string): bigint {
	const qtyScale = baseQuantityScaleForSymbol(symbol);
	return parseQtyScaled(qty, qtyScale, "qty");
}

function buildTriggerDefaults(): Pick<
	Proto.CreateTriggerRequest,
	| "triggerPriceTicks"
	| "activationPriceTicks"
	| "twapDurationMs"
	| "twapSliceIntervalMs"
	| "ladderPriceMinTicks"
	| "ladderPriceMaxTicks"
	| "ladderLevels"
	| "ladderDistribution"
	| "trailingDistance"
	| "maxSlippage"
> {
	return {
		triggerPriceTicks: 0n,
		activationPriceTicks: 0n,
		twapDurationMs: 0n,
		twapSliceIntervalMs: 0n,
		ladderPriceMinTicks: 0n,
		ladderPriceMaxTicks: 0n,
		ladderLevels: 2,
		ladderDistribution: Proto.LadderDistribution.LADDER_DISTRIBUTION_UNSPECIFIED,
		trailingDistance: UNSET_TRAILING_DISTANCE,
		maxSlippage: UNSET_MAX_SLIPPAGE,
	};
}

const StopLossTriggerInputSchema = BaseChildOrderFieldsSchema.extend({
	triggerType: z.literal("stop_loss"),
	triggerPrice: z
		.string()
		.trim()
		.min(1)
		.transform((v) => parsePriceTicks(v, "triggerPrice")),
	triggerPriceSource: TriggerPriceSourceSchema.optional().transform((v) =>
		v ? TriggerPriceSourceCodec.inputToProto[v] : ProtoOrders.TriggerPriceSource.LAST_PRICE
	),
}).transform((input) => {
	const isBuy = input.side === ProtoOrders.Side.BUY;
	return {
		...buildTriggerDefaults(),
		subaccountId: input.subAccountId,
		symbol: input.symbol,
		triggerType: Proto.TriggerType.STOP_LOSS,
		side: input.side,
		orderType: input.orderType,
		tif: input.tif,
		qtyScaled: parseQtyScaledForSymbol(input.symbol, input.qty),
		limitPriceTicks:
			input.orderType === ProtoOrders.OrderType.LIMIT && input.limitPrice
				? parsePriceTicks(input.limitPrice, "limitPrice")
				: 0n,
		feeSource: input.feeSource,
		stpMode: input.stpMode,
		postOnly: input.postOnly,
		clientTriggerId: input.clientTriggerId,
		triggerPriceTicks: input.triggerPrice,
		triggerPriceSource: input.triggerPriceSource,
		triggerDirection: isBuy
			? ProtoOrders.TriggerDirection.ABOVE
			: ProtoOrders.TriggerDirection.BELOW,
	};
});

const TakeProfitTriggerInputSchema = BaseChildOrderFieldsSchema.extend({
	triggerType: z.literal("take_profit"),
	triggerPrice: z
		.string()
		.trim()
		.min(1)
		.transform((v) => parsePriceTicks(v, "triggerPrice")),
	triggerPriceSource: TriggerPriceSourceSchema.optional().transform((v) =>
		v ? TriggerPriceSourceCodec.inputToProto[v] : ProtoOrders.TriggerPriceSource.LAST_PRICE
	),
}).transform((input) => {
	const isBuy = input.side === ProtoOrders.Side.BUY;
	return {
		...buildTriggerDefaults(),
		subaccountId: input.subAccountId,
		symbol: input.symbol,
		triggerType: Proto.TriggerType.TAKE_PROFIT,
		side: input.side,
		orderType: input.orderType,
		tif: input.tif,
		qtyScaled: parseQtyScaledForSymbol(input.symbol, input.qty),
		limitPriceTicks:
			input.orderType === ProtoOrders.OrderType.LIMIT && input.limitPrice
				? parsePriceTicks(input.limitPrice, "limitPrice")
				: 0n,
		feeSource: input.feeSource,
		stpMode: input.stpMode,
		postOnly: input.postOnly,
		clientTriggerId: input.clientTriggerId,
		triggerPriceTicks: input.triggerPrice,
		triggerPriceSource: input.triggerPriceSource,
		triggerDirection: isBuy
			? ProtoOrders.TriggerDirection.BELOW
			: ProtoOrders.TriggerDirection.ABOVE,
	};
});

const TrailingStopTriggerInputSchema = BaseChildOrderFieldsSchema.extend({
	triggerType: z.literal("trailing_stop"),
	trailingDistance: TrailingDistanceInputSchema.transform(parseTrailingDistance),
	activationPrice: z
		.string()
		.trim()
		.optional()
		.transform((v) => (v ? parsePriceTicks(v, "activationPrice") : 0n)),
	maxSlippage: MaxSlippageInputSchema.optional().transform(parseMaxSlippage),
	triggerPriceSource: TriggerPriceSourceSchema.optional().transform((v) =>
		v ? TriggerPriceSourceCodec.inputToProto[v] : ProtoOrders.TriggerPriceSource.LAST_PRICE
	),
	triggerDirection: TriggerDirectionSchema.optional().transform((v) =>
		v ? TriggerDirectionCodec.inputToProto[v] : ProtoOrders.TriggerDirection.ABOVE
	),
}).transform((input) => ({
	...buildTriggerDefaults(),
	subaccountId: input.subAccountId,
	symbol: input.symbol,
	triggerType: Proto.TriggerType.TRAILING_STOP,
	side: input.side,
	orderType: input.orderType,
	tif: input.tif,
	qtyScaled: parseQtyScaledForSymbol(input.symbol, input.qty),
	limitPriceTicks:
		input.orderType === ProtoOrders.OrderType.LIMIT && input.limitPrice
			? parsePriceTicks(input.limitPrice, "limitPrice")
			: 0n,
	feeSource: input.feeSource,
	stpMode: input.stpMode,
	postOnly: input.postOnly,
	clientTriggerId: input.clientTriggerId,
	trailingDistance: input.trailingDistance,
	activationPriceTicks: input.activationPrice,
	maxSlippage: input.maxSlippage,
	triggerPriceSource: input.triggerPriceSource,
	triggerDirection: input.triggerDirection,
}));

const TwapTriggerInputSchema = BaseChildOrderFieldsSchema.extend({
	triggerType: z.literal("twap"),
	twapDurationMs: z.union([z.string().trim(), z.number()]).transform((v) => {
		const durationMs = parseOptionalPositiveIntLike(v);
		if (!durationMs || durationMs < 1000) {
			throw new Error("twapDurationMs must be at least 1000ms");
		}
		return BigInt(durationMs);
	}),
	twapSliceIntervalMs: z.union([z.string().trim(), z.number()]).transform((v) => {
		const sliceIntervalMs = parseOptionalPositiveIntLike(v);
		if (!sliceIntervalMs || sliceIntervalMs < 100) {
			throw new Error("twapSliceIntervalMs must be at least 100ms");
		}
		return BigInt(sliceIntervalMs);
	}),
	maxSlippage: MaxSlippageInputSchema.optional().transform(parseMaxSlippage),
})
	.refine((data) => data.twapSliceIntervalMs <= data.twapDurationMs, {
		message: "twapSliceIntervalMs cannot exceed twapDurationMs",
	})
	.transform((input) => ({
		...buildTriggerDefaults(),
		subaccountId: input.subAccountId,
		symbol: input.symbol,
		triggerType: Proto.TriggerType.TWAP,
		side: input.side,
		orderType: input.orderType,
		tif: input.tif,
		qtyScaled: parseQtyScaledForSymbol(input.symbol, input.qty),
		limitPriceTicks:
			input.orderType === ProtoOrders.OrderType.LIMIT && input.limitPrice
				? parsePriceTicks(input.limitPrice, "limitPrice")
				: 0n,
		feeSource: input.feeSource,
		stpMode: input.stpMode,
		postOnly: input.postOnly,
		clientTriggerId: input.clientTriggerId,
		triggerPriceSource: ProtoOrders.TriggerPriceSource.LAST_PRICE,
		triggerDirection: ProtoOrders.TriggerDirection.ABOVE,
		twapDurationMs: input.twapDurationMs,
		twapSliceIntervalMs: input.twapSliceIntervalMs,
		maxSlippage: input.maxSlippage,
	}));

const LadderTriggerInputSchema = BaseChildOrderFieldsSchema.extend({
	triggerType: z.literal("ladder"),
	ladderPriceMin: z
		.string()
		.trim()
		.min(1)
		.transform((v) => parsePriceTicks(v, "ladderPriceMin")),
	ladderPriceMax: z
		.string()
		.trim()
		.min(1)
		.transform((v) => parsePriceTicks(v, "ladderPriceMax")),
	ladderLevels: z.union([z.string().trim(), z.number().int()]).transform((v) => {
		const levels = parseOptionalPositiveIntLike(v);
		if (!levels || levels < 2 || levels > 100) {
			throw new Error("ladderLevels must be between 2 and 100");
		}
		return levels;
	}),
	ladderDistribution: LadderDistributionSchema.optional().transform((v) =>
		v ? LadderDistributionCodec.inputToProto[v] : Proto.LadderDistribution.LINEAR
	),
}).transform((input) => ({
	...buildTriggerDefaults(),
	subaccountId: input.subAccountId,
	symbol: input.symbol,
	triggerType: Proto.TriggerType.LADDER,
	side: input.side,
	orderType: input.orderType,
	tif: input.tif,
	qtyScaled: parseQtyScaledForSymbol(input.symbol, input.qty),
	limitPriceTicks:
		input.orderType === ProtoOrders.OrderType.LIMIT && input.limitPrice
			? parsePriceTicks(input.limitPrice, "limitPrice")
			: 0n,
	feeSource: input.feeSource,
	stpMode: input.stpMode,
	postOnly: input.postOnly,
	clientTriggerId: input.clientTriggerId,
	triggerPriceSource: ProtoOrders.TriggerPriceSource.LAST_PRICE,
	triggerDirection: ProtoOrders.TriggerDirection.ABOVE,
	ladderPriceMinTicks: input.ladderPriceMin,
	ladderPriceMaxTicks: input.ladderPriceMax,
	ladderLevels: input.ladderLevels,
	ladderDistribution: input.ladderDistribution,
}));

export const CreateTriggerInputSchema = z.discriminatedUnion("triggerType", [
	StopLossTriggerInputSchema,
	TakeProfitTriggerInputSchema,
	TrailingStopTriggerInputSchema,
	TwapTriggerInputSchema,
	LadderTriggerInputSchema,
]);

export type CreateTriggerInput = z.input<typeof CreateTriggerInputSchema>;

export const ListTriggersInputSchema = z
	.object({
		subAccountId: z
			.string()
			.trim()
			.optional()
			.transform((v) => (v ? idToBigInt(v, "subaccountId") : undefined)),
		parentOrderId: z
			.string()
			.trim()
			.optional()
			.transform((v) => (v ? idToBigInt(v, "parentOrderId") : undefined)),
		symbol: z.string().trim().optional(),
		status: z
			.array(TriggerStatusFilterSchema)
			.optional()
			.transform((arr) => arr?.map((s) => TriggerStatusCodec.filterToProto[s]) ?? []),
		triggerType: TriggerTypeSchema.optional().transform((v) =>
			v ? TriggerTypeCodec.inputToProto[v] : Proto.TriggerType.TRIGGER_TYPE_UNSPECIFIED
		),
		limit: z.number().int().positive().max(1000).optional().default(50),
		offset: z.number().int().min(0).optional().default(0),
	})
	.transform(({ subAccountId, ...rest }) => ({
		...rest,
		subaccountId: subAccountId,
	}));

export type ListTriggersInput = z.input<typeof ListTriggersInputSchema>;

export const CancelTriggerInputSchema = z
	.object({
		triggerId: z
			.string()
			.trim()
			.transform((v) => idToBigInt(v, "triggerId")),
		subAccountId: z
			.string()
			.trim()
			.optional()
			.transform((v) => (v ? idToBigInt(v, "subaccountId") : undefined)),
	})
	.transform(({ subAccountId, ...rest }) => ({
		...rest,
		subaccountId: subAccountId,
	}));

export type CancelTriggerInput = z.input<typeof CancelTriggerInputSchema>;

export const GetTriggerInputSchema = z
	.object({
		triggerId: z
			.string()
			.trim()
			.transform((v) => idToBigInt(v, "triggerId")),
		subAccountId: z
			.string()
			.trim()
			.optional()
			.transform((v) => (v ? idToBigInt(v, "subaccountId") : undefined)),
	})
	.transform(({ subAccountId, ...rest }) => ({
		...rest,
		subaccountId: subAccountId,
	}));

export type GetTriggerInput = z.input<typeof GetTriggerInputSchema>;

export const ModifyTriggerInputSchema = z
	.object({
		triggerId: z
			.string()
			.trim()
			.transform((v) => idToBigInt(v, "triggerId")),
		subAccountId: z
			.string()
			.trim()
			.optional()
			.transform((v) => (v ? idToBigInt(v, "subaccountId") : undefined)),
		triggerPrice: z
			.string()
			.trim()
			.optional()
			.transform((v) => (v ? parsePriceTicks(v, "triggerPrice") : undefined)),
		limitPrice: z
			.string()
			.trim()
			.optional()
			.transform((v) => (v ? parsePriceTicks(v, "limitPrice") : undefined)),
		trailingDistance: TrailingDistanceInputSchema.optional().transform((v) =>
			v ? parseTrailingDistance(v) : undefined
		),
		activationPrice: z
			.string()
			.trim()
			.optional()
			.transform((v) => (v ? parsePriceTicks(v, "activationPrice") : undefined)),
		maxSlippage: MaxSlippageInputSchema.optional().transform((v) =>
			v ? parseMaxSlippage(v) : undefined
		),
	})
	.superRefine((input, ctx) => {
		const hasPatch =
			input.triggerPrice !== undefined ||
			input.limitPrice !== undefined ||
			input.trailingDistance !== undefined ||
			input.activationPrice !== undefined ||
			input.maxSlippage !== undefined;
		if (!hasPatch) {
			ctx.addIssue({
				code: "custom",
				message: "At least one patch field is required",
				path: ["triggerPrice"],
			});
		}
	})
	.transform(({ subAccountId, ...input }) => ({
		triggerId: input.triggerId,
		subaccountId: subAccountId,
		triggerPriceTicks: input.triggerPrice,
		limitPriceTicks: input.limitPrice,
		trailingDistance: input.trailingDistance ?? UNSET_TRAILING_DISTANCE,
		activationPriceTicks: input.activationPrice,
		maxSlippage: input.maxSlippage ?? UNSET_MAX_SLIPPAGE,
	}));

export type ModifyTriggerInput = z.input<typeof ModifyTriggerInputSchema>;

export const PauseTriggerInputSchema = z
	.object({
		triggerId: z
			.string()
			.trim()
			.transform((v) => idToBigInt(v, "triggerId")),
		subAccountId: z
			.string()
			.trim()
			.optional()
			.transform((v) => (v ? idToBigInt(v, "subaccountId") : undefined)),
	})
	.transform((input) => ({
		triggerId: input.triggerId,
		subaccountId: input.subAccountId,
	}));

export type PauseTriggerInput = z.input<typeof PauseTriggerInputSchema>;
export type ResumeTriggerInput = z.input<typeof PauseTriggerInputSchema>;

export const ListTriggerEventsInputSchema = z
	.object({
		triggerId: z
			.string()
			.trim()
			.transform((v) => idToBigInt(v, "triggerId")),
		subAccountId: z
			.string()
			.trim()
			.optional()
			.transform((v) => (v ? idToBigInt(v, "subaccountId") : undefined)),
		limit: z.number().int().positive().max(1000).optional(),
		beforeTsNs: z.string().trim().optional(),
	})
	.transform(({ subAccountId, ...rest }) => ({
		...rest,
		subaccountId: subAccountId,
	}));

export type ListTriggerEventsInput = z.input<typeof ListTriggerEventsInputSchema>;

type TriggerPriceSourceLabel = "last" | "index" | "mark";

type TriggerDirectionLabel = "above" | "below";

type LadderDistributionLabel = "linear" | "geometric" | "weighted_favorable";

export const CreateTriggerResultSchema = z.object({
	triggerId: z.bigint().transform((id) => formatId(id)),
	status: z
		.enum(Proto.TriggerStatus)
		.transform((status) => TriggerStatusCodec.protoToLabel[status]),
	clientTriggerId: z.string(),
	tsNs: z.bigint().transform((tsNs) => tsNsToMs(tsNs)),
});

export type CreateTriggerResult = z.output<typeof CreateTriggerResultSchema>;

export const CancelTriggerResultSchema = z.object({
	triggerId: z.bigint().transform((id) => formatId(id)),
	status: z
		.enum(Proto.TriggerStatus)
		.transform((status) => TriggerStatusCodec.protoToLabel[status]),
	tsNs: z.bigint().transform((tsNs) => tsNsToMs(tsNs)),
});

export type CancelTriggerResult = z.output<typeof CancelTriggerResultSchema>;

export const ModifyTriggerResultSchema = z.object({
	triggerId: z.bigint().transform((id) => formatId(id)),
	status: z
		.enum(Proto.TriggerStatus)
		.transform((status) => TriggerStatusCodec.protoToLabel[status]),
	tsNs: z.bigint().transform((tsNs) => tsNsToMs(tsNs)),
});

export type ModifyTriggerResult = z.output<typeof ModifyTriggerResultSchema>;

export const PauseTriggerResultSchema = z.object({
	triggerId: z.bigint().transform((id) => formatId(id)),
	status: z
		.enum(Proto.TriggerStatus)
		.transform((status) => TriggerStatusCodec.protoToLabel[status]),
	tsNs: z.bigint().transform((tsNs) => tsNsToMs(tsNs)),
});

export type PauseTriggerResult = z.output<typeof PauseTriggerResultSchema>;
export type ResumeTriggerResult = z.output<typeof PauseTriggerResultSchema>;

export type ListTriggerEventsResult = {
	events: TriggerEvent[];
	nextBeforeTsNs: number;
};

const StopDetailsRawSchema = z.object({
	triggerPriceTicks: z.bigint(),
	triggerPriceSource: z.enum(ProtoOrders.TriggerPriceSource),
	triggerDirection: z.enum(ProtoOrders.TriggerDirection),
});

const TrailingDetailsRawSchema = z.object({
	trailingDistanceTicks: z.bigint(),
	activationPriceTicks: z.bigint(),
	peakPriceTicks: z.bigint(),
	troughPriceTicks: z.bigint(),
	trailingDistanceBps: z.number(),
	maxSlippageTicks: z.number(),
	maxSlippageBps: z.number(),
	triggerPriceSource: z.enum(ProtoOrders.TriggerPriceSource),
	triggerDirection: z.enum(ProtoOrders.TriggerDirection),
});

const TwapDetailsRawSchema = z.object({
	twapDurationMs: z.bigint(),
	twapSliceIntervalMs: z.bigint(),
	sliceIdx: z.number(),
	sliceCount: z.number(),
	executedQtyScaled: z.bigint(),
});

const LadderDetailsRawSchema = z.object({
	ladderPriceMinTicks: z.bigint(),
	ladderPriceMaxTicks: z.bigint(),
	ladderLevels: z.number(),
	ladderDistribution: z.enum(Proto.LadderDistribution),
});

const TriggerDetailsRawSchema = z.discriminatedUnion("case", [
	z.object({ case: z.literal("stop"), value: StopDetailsRawSchema }),
	z.object({ case: z.literal("trailing"), value: TrailingDetailsRawSchema }),
	z.object({ case: z.literal("twap"), value: TwapDetailsRawSchema }),
	z.object({ case: z.literal("ladder"), value: LadderDetailsRawSchema }),
	z.object({ case: z.literal(undefined), value: z.undefined().optional() }),
]);

export type StopDetailsOutput = {
	case: "stop";
	triggerPrice: string;
	triggerPriceSource: TriggerPriceSourceLabel;
	triggerDirection: TriggerDirectionLabel;
};

export type TrailingDetailsOutput = {
	case: "trailing";
	trailingDistancePrice: string | undefined;
	trailingDistanceBps: number;
	activationPrice: string | undefined;
	peakPrice: string | undefined;
	troughPrice: string | undefined;
	maxSlippageTicks: number;
	maxSlippageBps: number;
	triggerPriceSource: TriggerPriceSourceLabel;
	triggerDirection: TriggerDirectionLabel;
};

export type TwapDetailsOutput = {
	case: "twap";
	twapDurationMs: number;
	twapSliceIntervalMs: number;
	sliceIdx: number;
	sliceCount: number;
	executedQty: string;
};

export type LadderDetailsOutput = {
	case: "ladder";
	ladderPriceMin: string;
	ladderPriceMax: string;
	ladderLevels: number;
	ladderDistribution: LadderDistributionLabel;
};

export type TriggerDetailsOutput =
	| StopDetailsOutput
	| TrailingDetailsOutput
	| TwapDetailsOutput
	| LadderDetailsOutput
	| { case: undefined };

function transformTriggerDetails(
	details: z.output<typeof TriggerDetailsRawSchema>,
	symbolId: number
): TriggerDetailsOutput {
	switch (details.case) {
		case "stop":
			return {
				case: "stop",
				triggerPrice: formatPriceForSymbol(details.value.triggerPriceTicks, symbolId),
				triggerPriceSource:
					TriggerPriceSourceCodec.protoToLabel[details.value.triggerPriceSource],
				triggerDirection:
					TriggerDirectionCodec.protoToLabel[details.value.triggerDirection],
			};
		case "trailing":
			return {
				case: "trailing",
				trailingDistancePrice:
					details.value.trailingDistanceTicks > 0n
						? formatPriceForSymbol(details.value.trailingDistanceTicks, symbolId)
						: undefined,
				trailingDistanceBps: details.value.trailingDistanceBps,
				activationPrice:
					details.value.activationPriceTicks > 0n
						? formatPriceForSymbol(details.value.activationPriceTicks, symbolId)
						: undefined,
				peakPrice:
					details.value.peakPriceTicks > 0n
						? formatPriceForSymbol(details.value.peakPriceTicks, symbolId)
						: undefined,
				troughPrice:
					details.value.troughPriceTicks > 0n
						? formatPriceForSymbol(details.value.troughPriceTicks, symbolId)
						: undefined,
				maxSlippageTicks: details.value.maxSlippageTicks,
				maxSlippageBps: details.value.maxSlippageBps,
				triggerPriceSource:
					TriggerPriceSourceCodec.protoToLabel[details.value.triggerPriceSource],
				triggerDirection:
					TriggerDirectionCodec.protoToLabel[details.value.triggerDirection],
			};
		case "twap":
			return {
				case: "twap",
				twapDurationMs: Number(details.value.twapDurationMs),
				twapSliceIntervalMs: Number(details.value.twapSliceIntervalMs),
				sliceIdx: details.value.sliceIdx,
				sliceCount: details.value.sliceCount,
				executedQty: formatQtyForSymbol(details.value.executedQtyScaled, symbolId),
			};
		case "ladder":
			return {
				case: "ladder",
				ladderPriceMin: formatPriceForSymbol(details.value.ladderPriceMinTicks, symbolId),
				ladderPriceMax: formatPriceForSymbol(details.value.ladderPriceMaxTicks, symbolId),
				ladderLevels: details.value.ladderLevels,
				ladderDistribution:
					LadderDistributionCodec.protoToLabel[details.value.ladderDistribution],
			};
		default:
			return { case: undefined };
	}
}

export const TriggerSchema = z
	.object({
		triggerId: z.bigint(),
		subaccountId: z.bigint(),
		symbolId: z.number(),
		symbol: z.string(),
		triggerType: z.enum(Proto.TriggerType),
		status: z.enum(Proto.TriggerStatus),
		parentOrderId: z.bigint().optional(),
		side: z.enum(ProtoOrders.Side),
		orderType: z.enum(ProtoOrders.OrderType),
		tif: z.enum(ProtoOrders.TIF),
		qtyScaled: z.bigint(),
		limitPriceTicks: z.bigint(),
		feeSource: z.enum(ProtoOrders.FeeSource),
		stpMode: z.enum(ProtoOrders.STPMode),
		postOnly: z.boolean(),
		clientTriggerId: z.string(),
		createdAt: TimestampSchema.optional(),
		updatedAt: TimestampSchema.optional(),
		armedAt: TimestampSchema.optional(),
		completedAt: TimestampSchema.optional(),
		childOrderIds: z.array(z.bigint()).optional(),
		details: TriggerDetailsRawSchema.optional(),
	})
	.transform((t) => ({
		triggerId: formatId(t.triggerId),
		subAccountId: formatId(t.subaccountId),
		symbolId: t.symbolId,
		symbol: symbolForSymbolId(t.symbolId),
		baseAsset: baseAssetForSymbolId(t.symbolId)!,
		quoteAsset: quoteAssetForSymbolId(t.symbolId)!,
		triggerType: TriggerTypeCodec.protoToLabel[t.triggerType],
		status: TriggerStatusCodec.protoToLabel[t.status],
		parentOrderId: t.parentOrderId ? formatId(t.parentOrderId) : undefined,
		side: sideLabelFor(t.side),
		isBuy: t.side === ProtoOrders.Side.BUY,
		orderType: orderTypeLabelFor(t.orderType),
		tif: tifLabelFor(t.tif),
		qty: formatQtyForSymbol(t.qtyScaled, t.symbolId),
		limitPrice:
			t.limitPriceTicks > 0n
				? formatPriceForSymbol(t.limitPriceTicks, t.symbolId)
				: undefined,
		feeSource:
			t.feeSource !== ProtoOrders.FeeSource.FEE_SOURCE_UNSPECIFIED
				? feeSourceLabelFor(t.feeSource)
				: undefined,
		stpMode: stpModeLabelFor(t.stpMode),
		postOnly: t.postOnly,
		clientTriggerId: t.clientTriggerId,
		createdTs: t.createdAt?.seconds ? Number(t.createdAt.seconds) * 1000 : undefined,
		updatedTs: t.updatedAt?.seconds ? Number(t.updatedAt.seconds) * 1000 : undefined,
		armedTs: t.armedAt?.seconds ? Number(t.armedAt.seconds) * 1000 : undefined,
		completedTs: t.completedAt?.seconds ? Number(t.completedAt.seconds) * 1000 : undefined,
		childOrderIds: t.childOrderIds?.map((id) => formatId(id)) ?? [],
		details: t.details ? transformTriggerDetails(t.details, t.symbolId) : undefined,
	}));

export type Trigger = z.output<typeof TriggerSchema>;

export const TriggerEventSchema = z
	.object({
		triggerId: z.bigint(),
		subaccountId: z.bigint(),
		symbolId: z.number(),
		triggerType: z.enum(Proto.TriggerType),
		eventType: z.enum(Proto.TriggerEventType),
		tsNs: z.bigint(),
		childSeq: z.number(),
		childOrderId: z.bigint(),
		firePxTicks: z.bigint(),
		reason: z.string(),
	})
	.transform((e) => {
		return {
			triggerId: formatId(e.triggerId),
			subAccountId: formatId(e.subaccountId),
			symbolId: e.symbolId,
			symbol: symbolForSymbolId(e.symbolId) || "",
			baseAsset: baseAssetForSymbolId(e.symbolId)!,
			quoteAsset: quoteAssetForSymbolId(e.symbolId)!,
			triggerType: TriggerTypeCodec.protoToLabel[e.triggerType],
			eventType: TriggerEventTypeCodec.protoToLabel[e.eventType],
			ts: tsNsToMs(e.tsNs),
			childSeq: e.childSeq,
			childOrderId: e.childOrderId > 0n ? formatId(e.childOrderId) : undefined,
			firePrice:
				e.firePxTicks > 0n ? formatPriceForSymbol(e.firePxTicks, e.symbolId) : undefined,
			reason: e.reason || undefined,
		};
	});

export type TriggerEvent = z.output<typeof TriggerEventSchema>;
