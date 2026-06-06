import * as ProtoRead from "../../gen/orders/v1/orders_read_pb.js";
import * as ProtoWrite from "../../gen/orders/v1/orders_pb.js";
import { z } from "zod";
import { SideSchema } from "../shared.js";
import {
	feeSourceLabelFor,
	formatPriceForSymbol,
	formatQtyForSymbol,
	orderStatusLabelFor,
	orderTypeLabelFor,
	sideLabelFor,
	stpModeLabelFor,
	tifLabelFor,
} from "../../catalogs/orders-catalog.js";
import {
	parseOptionalUint64Decimal,
	parsePriceTicks,
	parseQtyScaled,
	parseOptionalPositiveIntLike,
} from "../../utils/numbers.js";
import { tsNsToMs } from "../../utils/time.js";
import { formatId, idToBigInt } from "../../utils/base58-id";
import {
	baseQuantityScaleForSymbol,
	getPairBySymbolId,
	symbolForSymbolId,
} from "../../catalogs/market-data-catalog";
import { UserTradeSchema } from "../trades";
import { fromU128, u128ToDecimal } from "../../utils/u128";
import {
	formatAmountDisplay,
	LEDGER_SCALE,
	symbolForAssetId,
	transferTypeNameFor,
	accountCodeNameFor,
} from "../../catalogs/ledger-catalog";
import {
	OrderStatusFilterCodec,
	OrderSideCodec,
	OrderTypeCodec,
	TifCodec,
	FeeSourceCodec,
	StpModeCodec,
	OrderOriginScopeCodec,
	OrderTriggerTypeCodec,
	TriggerPriceSourceCodec,
	ModifyBehaviorCodec,
	ModifyActionCodec,
} from "./orders.codecs.js";

const OrderStatusSchema = z.enum(["FILLED", "CANCELED", "REJECTED"]);

export const BaseOrdersFilterInputSchema = z.object({
	subAccountId: z
		.string()
		.trim()
		.optional()
		.transform((v) => (v ? idToBigInt(v, "subaccountId") : undefined)),
	symbolId: z.array(z.number()).optional(),
	side: SideSchema.optional().transform((v) => (v ? OrderSideCodec.inputToProto[v] : undefined)),
	limit: z.number().optional(),
	pageToken: z.string().trim().optional(),
});

export const OpenOrdersInputSchema = BaseOrdersFilterInputSchema.extend({
	includeAttachedRisk: z.boolean().optional().default(true),
	includeAttachedRiskState: z.boolean().optional().default(false),
}).transform(({ subAccountId, ...rest }) => ({
	...rest,
	subaccountId: subAccountId,
}));

export const OrderHistoryInputSchema = BaseOrdersFilterInputSchema.extend({
	includeAttachedRisk: z.boolean().optional().default(true),
	includeAttachedRiskState: z.boolean().optional().default(false),
	status: OrderStatusSchema.optional().transform((v) =>
		v ? OrderStatusFilterCodec.inputToProto[v] : undefined
	),
	startTsNs: z
		.string()
		.trim()
		.optional()
		.transform((v) => (v ? parseOptionalUint64Decimal(v) : undefined)),
	endTsNs: z
		.string()
		.trim()
		.optional()
		.transform((v) => (v ? parseOptionalUint64Decimal(v) : undefined)),
}).transform(({ subAccountId, ...rest }) => ({
	...rest,
	subaccountId: subAccountId,
}));

const OrderTypeSchema = z.enum(["limit", "market"]);
const TIFSchema = z.enum(["gtc", "ioc", "fok"]);
const FeeSourceSchema = z.enum(["quote", "received"]);
const STPSchema = z.enum(["expire_taker", "expire_maker", "expire_both"]);

const TriggerPriceSourceSchema = z.enum(["last", "index", "mark"]);
const ClientOrderIdPattern = /^[A-Za-z0-9._:/-]+$/;

const TakeProfitInputSchema = z
	.object({
		triggerPrice: z.string().trim().min(1),
		triggerPriceSource: TriggerPriceSourceSchema.optional(),
		orderType: OrderTypeSchema.optional(),
		limitPrice: z.string().trim().optional(),
	})
	.transform((input) => {
		const orderType = input.orderType
			? OrderTypeCodec.inputToProto[input.orderType]
			: ProtoWrite.OrderType.MARKET;
		return {
			triggerPriceTicks: parsePriceTicks(input.triggerPrice, "takeProfit.triggerPrice"),
			triggerPriceSource: input.triggerPriceSource
				? TriggerPriceSourceCodec.inputToProto[input.triggerPriceSource]
				: ProtoWrite.TriggerPriceSource.LAST_PRICE,
			orderType,
			limitPriceTicks:
				orderType === ProtoWrite.OrderType.LIMIT && input.limitPrice
					? parsePriceTicks(input.limitPrice, "takeProfit.limitPrice")
					: 0n,
		};
	});

const StopLossInputSchema = z
	.object({
		triggerPrice: z.string().trim().min(1),
		triggerPriceSource: TriggerPriceSourceSchema.optional(),
		orderType: OrderTypeSchema.optional(),
		limitPrice: z.string().trim().optional(),
	})
	.transform((input) => {
		const orderType = input.orderType
			? OrderTypeCodec.inputToProto[input.orderType]
			: ProtoWrite.OrderType.MARKET;
		return {
			triggerPriceTicks: parsePriceTicks(input.triggerPrice, "stopLoss.triggerPrice"),
			triggerPriceSource: input.triggerPriceSource
				? TriggerPriceSourceCodec.inputToProto[input.triggerPriceSource]
				: ProtoWrite.TriggerPriceSource.LAST_PRICE,
			orderType,
			limitPriceTicks:
				orderType === ProtoWrite.OrderType.LIMIT && input.limitPrice
					? parsePriceTicks(input.limitPrice, "stopLoss.limitPrice")
					: 0n,
		};
	});

const TrailingDistanceSchema = z.union([
	z.object({
		kind: z.literal("ticks"),
		ticks: z.string().trim().min(1),
	}),
	z.object({
		kind: z.literal("bps"),
		bps: z.union([z.string().trim().min(1), z.number().positive()]),
	}),
	z.object({
		kind: z.literal("none"),
	}),
]);

const MaxSlippageSchema = z.union([
	z.object({
		kind: z.literal("ticks"),
		ticks: z.union([z.string().trim().min(1), z.number().positive()]),
	}),
	z.object({
		kind: z.literal("bps"),
		bps: z.union([z.string().trim().min(1), z.number().positive()]),
	}),
	z.object({
		kind: z.literal("none"),
	}),
]);

const MarketMaxSlippageSchema = z.union([
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

const MAX_BPS = 10_000;
const MAX_INT32 = 2_147_483_647;

function parseTrailingDistance(
	distance: z.output<typeof TrailingDistanceSchema>
): ProtoWrite.TrailingStopPolicy["trailingDistance"] {
	if (distance.kind === "ticks") {
		const ticks = parseOptionalPositiveIntLike(distance.ticks);
		if (ticks === undefined || ticks <= 0) {
			throw new Error("trailingStop.trailingDistanceTicks must be a positive integer");
		}
		return { case: "trailingDistanceTicks", value: BigInt(ticks) };
	}
	if (distance.kind === "bps") {
		const bps = parseOptionalPositiveIntLike(distance.bps);
		if (bps === undefined || bps <= 0) {
			throw new Error("trailingStop.trailingDistanceBps must be a positive integer");
		}
		return { case: "trailingDistanceBps", value: bps };
	}
	return { case: undefined, value: undefined };
}

function parseMaxSlippage(
	slippage: z.output<typeof MaxSlippageSchema>
): ProtoWrite.TrailingStopPolicy["maxSlippage"] {
	if (slippage.kind === "ticks") {
		const ticks = parseOptionalPositiveIntLike(slippage.ticks);
		if (ticks === undefined || ticks <= 0) {
			throw new Error("trailingStop.maxSlippageTicks must be a positive integer");
		}
		return { case: "maxSlippageTicks", value: ticks };
	}
	if (slippage.kind === "bps") {
		const bps = parseOptionalPositiveIntLike(slippage.bps);
		if (bps === undefined || bps <= 0) {
			throw new Error("trailingStop.maxSlippageBps must be a positive integer");
		}
		return { case: "maxSlippageBps", value: bps };
	}
	return { case: undefined, value: undefined };
}

function parseMarketMaxSlippage(
	slippage: z.output<typeof MarketMaxSlippageSchema> | undefined
): ProtoWrite.CreateOrderRequest["marketMaxSlippage"] {
	if (!slippage || slippage.kind === "none") {
		return { case: undefined, value: undefined };
	}
	if (slippage.kind === "ticks") {
		const ticks = parseOptionalPositiveIntLike(slippage.ticks);
		if (ticks === undefined || ticks <= 0 || ticks > MAX_INT32) {
			throw new Error("marketMaxSlippageTicks must be a positive int32");
		}
		return { case: "marketMaxSlippageTicks", value: ticks };
	}
	if (slippage.kind === "quote") {
		const ticks = parsePriceTicks(slippage.quote, "marketMaxSlippage");
		if (ticks <= 0n || ticks > BigInt(MAX_INT32)) {
			throw new Error("marketMaxSlippageTicks must be a positive int32");
		}
		return { case: "marketMaxSlippageTicks", value: Number(ticks) };
	}
	if (slippage.kind === "percent") {
		const percent =
			typeof slippage.percent === "string"
				? Number.parseFloat(slippage.percent)
				: slippage.percent;
		if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
			throw new Error("marketMaxSlippagePercent must be between 0 and 100");
		}
		return { case: "marketMaxSlippageBps", value: Math.round(percent * 100) };
	}
	const bps = parseOptionalPositiveIntLike(slippage.bps);
	if (bps === undefined || bps <= 0 || bps > MAX_BPS) {
		throw new Error("marketMaxSlippageBps must be between 1 and 10000");
	}
	return { case: "marketMaxSlippageBps", value: bps };
}

function parseMarketClientRefPriceTicks(price: string | undefined): bigint {
	const trimmed = (price ?? "").trim();
	if (!trimmed) return 0n;
	const ticks = parsePriceTicks(trimmed, "marketClientRefPrice");
	if (ticks <= 0n) {
		throw new Error("marketClientRefPrice must be greater than 0");
	}
	return ticks;
}

const TrailingStopInputSchema = z
	.object({
		trailingDistance: TrailingDistanceSchema,
		maxSlippage: MaxSlippageSchema.optional(),
		activationPrice: z.string().trim().optional(),
		triggerPriceSource: TriggerPriceSourceSchema.optional(),
		orderType: OrderTypeSchema.optional(),
	})
	.transform((input) => ({
		trailingDistance: parseTrailingDistance(input.trailingDistance),
		maxSlippage: input.maxSlippage
			? parseMaxSlippage(input.maxSlippage)
			: { case: undefined as undefined, value: undefined as undefined },
		activationPriceTicks: input.activationPrice
			? parsePriceTicks(input.activationPrice, "trailingStop.activationPrice")
			: 0n,
		triggerPriceSource: input.triggerPriceSource
			? TriggerPriceSourceCodec.inputToProto[input.triggerPriceSource]
			: ProtoWrite.TriggerPriceSource.LAST_PRICE,
		orderType: input.orderType
			? OrderTypeCodec.inputToProto[input.orderType]
			: ProtoWrite.OrderType.MARKET,
	}));

export const RiskPolicyInputSchema = z
	.object({
		takeProfit: TakeProfitInputSchema.optional(),
		stopLoss: StopLossInputSchema.optional(),
		trailingStop: TrailingStopInputSchema.optional(),
		oco: z.boolean().optional(),
	})
	.optional()
	.superRefine((input, ctx) => {
		if (!input) return;
		if (input.stopLoss && input.trailingStop) {
			ctx.addIssue({
				code: "custom",
				message: "Provide exactly one stop leg: stopLoss or trailingStop",
				path: ["stopLoss"],
			});
		}
	})
	.transform((input) => {
		if (!input) return undefined;
		const hasAny = input.takeProfit || input.stopLoss || input.trailingStop;
		if (!hasAny) return undefined;
		const stopLeg = input.stopLoss
			? ({ case: "stopLoss", value: input.stopLoss } as const)
			: input.trailingStop
				? ({ case: "trailingStop", value: input.trailingStop } as const)
				: ({ case: undefined, value: undefined } as const);
		const oco = input.oco === true && !!input.takeProfit && stopLeg.case !== undefined;
		return {
			takeProfit: input.takeProfit,
			stopLeg,
			oco,
		};
	});

export type TakeProfitInput = z.input<typeof TakeProfitInputSchema>;
export type StopLossInput = z.input<typeof StopLossInputSchema>;
export type TrailingStopInput = z.input<typeof TrailingStopInputSchema>;
export type RiskPolicyInput = z.input<typeof RiskPolicyInputSchema>;

type TriggerPriceSource = "last" | "index" | "mark";
type RiskOrderType = "limit" | "market";
type TrailingDistance =
	| { kind: "ticks"; ticks: string }
	| { kind: "bps"; bps: number }
	| { kind: "none" };
type TrailingMaxSlippage = { kind: "ticks"; ticks: number } | { kind: "bps"; bps: number };
type MarketMaxSlippage = { kind: "ticks"; ticks: number } | { kind: "bps"; bps: number };

const ReadTakeProfitPolicySchema = z.object({
	triggerPriceTicks: z.bigint(),
	triggerPriceSource: z.number(),
	orderType: z.number(),
	limitPriceTicks: z.bigint(),
});

const ReadStopLossPolicySchema = z.object({
	triggerPriceTicks: z.bigint(),
	triggerPriceSource: z.number(),
	orderType: z.number(),
	limitPriceTicks: z.bigint(),
});

const ReadTrailingStopPolicySchema = z.object({
	trailingDistance: z.object({
		case: z
			.union([
				z.literal("trailingDistanceTicks"),
				z.literal("trailingDistanceBps"),
				z.undefined(),
			])
			.optional(),
		value: z.union([z.bigint(), z.number(), z.undefined()]).optional(),
	}),
	maxSlippage: z.object({
		case: z.union([z.literal("maxSlippageTicks"), z.literal("maxSlippageBps"), z.undefined()]),
		value: z.union([z.number(), z.undefined()]).optional(),
	}),
	activationPriceTicks: z.bigint(),
	triggerPriceSource: z.number(),
	orderType: z.number(),
});

const ReadAttachedRiskTakeProfitSchema = z.object({
	policy: ReadTakeProfitPolicySchema.optional(),
});

const ReadAttachedRiskStopLossSchema = z.object({
	policy: ReadStopLossPolicySchema.optional(),
});

const ReadAttachedRiskTrailingStopSchema = z.object({
	policy: ReadTrailingStopPolicySchema.optional(),
});

const ReadAttachedRiskSchema = z.object({
	takeProfit: ReadAttachedRiskTakeProfitSchema.optional(),
	stopLoss: ReadAttachedRiskStopLossSchema.optional(),
	trailingStop: ReadAttachedRiskTrailingStopSchema.optional(),
	oco: z.boolean().optional().default(false),
});

const ReadOrderOriginSchema = z.object({
	scope: z
		.enum(ProtoRead.OrderOriginScope)
		.transform((v) => OrderOriginScopeCodec.protoToLabel[v]),
	triggerType: z
		.enum(ProtoRead.OrderTriggerType)
		.transform((v) => OrderTriggerTypeCodec.protoToLabel[v]),
	triggerId: z
		.bigint()
		.optional()
		.transform((v) => (v ? formatId(v) : undefined)),
	parentOrderId: z
		.bigint()
		.optional()
		.transform((v) => (v ? formatId(v) : undefined)),
	childSeq: z.number(),
});

function triggerPriceSourceLabelFor(v: number): TriggerPriceSource {
	if (v === ProtoWrite.TriggerPriceSource.INDEX_PRICE) return "index";
	if (v === ProtoWrite.TriggerPriceSource.MARK_PRICE) return "mark";
	return "last";
}

function riskOrderTypeLabelFor(v: number): RiskOrderType {
	return v === ProtoWrite.OrderType.LIMIT ? "limit" : "market";
}

function formatRiskLeg(
	leg: z.output<typeof ReadTakeProfitPolicySchema> | z.output<typeof ReadStopLossPolicySchema>,
	symbolId: number
) {
	const orderType = riskOrderTypeLabelFor(leg.orderType);
	return {
		triggerPrice: formatPriceForSymbol(leg.triggerPriceTicks, symbolId),
		triggerPriceSource: triggerPriceSourceLabelFor(leg.triggerPriceSource),
		orderType,
		limitPrice:
			orderType === "limit" ? formatPriceForSymbol(leg.limitPriceTicks, symbolId) : undefined,
	};
}

function formatTrailingDistance(
	distance: z.output<typeof ReadTrailingStopPolicySchema>["trailingDistance"]
): TrailingDistance {
	if (distance.case === "trailingDistanceTicks" && typeof distance.value === "bigint") {
		return { kind: "ticks", ticks: distance.value.toString() };
	}
	if (distance.case === "trailingDistanceBps" && typeof distance.value === "number") {
		return { kind: "bps", bps: distance.value };
	}
	return { kind: "none" };
}

function formatTrailingMaxSlippage(
	slippage: z.output<typeof ReadTrailingStopPolicySchema>["maxSlippage"]
): TrailingMaxSlippage | undefined {
	if (slippage.case === "maxSlippageTicks" && typeof slippage.value === "number") {
		return { kind: "ticks", ticks: slippage.value };
	}
	if (slippage.case === "maxSlippageBps" && typeof slippage.value === "number") {
		return { kind: "bps", bps: slippage.value };
	}
	return undefined;
}

function formatMarketMaxSlippage(ticks: number, bps: number): MarketMaxSlippage | undefined {
	if (ticks > 0) {
		return { kind: "ticks", ticks };
	}
	if (bps > 0) {
		return { kind: "bps", bps };
	}
	return undefined;
}

function formatAttachedRisk(
	risk: z.output<typeof ReadAttachedRiskSchema> | undefined,
	symbolId: number
) {
	if (!risk) return undefined;

	const takeProfit = risk.takeProfit?.policy
		? formatRiskLeg(risk.takeProfit.policy, symbolId)
		: undefined;
	const stopLoss = risk.stopLoss?.policy
		? formatRiskLeg(risk.stopLoss.policy, symbolId)
		: undefined;
	const trailingStop = risk.trailingStop?.policy
		? {
				trailingDistance: formatTrailingDistance(risk.trailingStop.policy.trailingDistance),
				maxSlippage: formatTrailingMaxSlippage(risk.trailingStop.policy.maxSlippage),
				activationPrice:
					risk.trailingStop.policy.activationPriceTicks > 0n
						? formatPriceForSymbol(
								risk.trailingStop.policy.activationPriceTicks,
								symbolId
							)
						: undefined,
				triggerPriceSource: triggerPriceSourceLabelFor(
					risk.trailingStop.policy.triggerPriceSource
				),
				orderType: riskOrderTypeLabelFor(risk.trailingStop.policy.orderType),
			}
		: undefined;

	if (!takeProfit && !stopLoss && !trailingStop) return undefined;

	// stop legs are mutually exclusive (oneof on the write side);
	// if the server sends both, prefer trailing stop as it's the newer leg
	const effectiveStopLoss = trailingStop ? undefined : stopLoss;

	return {
		takeProfit,
		stopLoss: effectiveStopLoss,
		trailingStop,
		oco: risk.oco,
	};
}

export const NewOrderInputSchema = z
	.object({
		subAccountId: z
			.string()
			.trim()
			.optional()
			.transform((v) => (v ? idToBigInt(v, "subaccountId") : undefined)),
		symbol: z.string().trim().min(1),
		side: SideSchema.transform((v) => OrderSideCodec.inputToProto[v]),
		orderType: OrderTypeSchema.transform((v) => OrderTypeCodec.inputToProto[v]),
		tif: TIFSchema.transform((v) => TifCodec.inputToProto[v]),
		price: z.string().trim().optional(),
		qty: z.string().trim().min(1),
		postOnly: z.boolean().optional().default(false),
		clientOrderId: z.string().trim().optional(),
		feeSource: FeeSourceSchema.optional().transform((v) =>
			v ? FeeSourceCodec.inputToProto[v] : ProtoWrite.FeeSource.QUOTE
		),
		stpMode: STPSchema.optional().transform((v) =>
			v ? StpModeCodec.inputToProto[v] : undefined
		),
		risk: RiskPolicyInputSchema,
		marketMaxSlippage: MarketMaxSlippageSchema.optional(),
		marketClientRefPrice: z.string().trim().optional(),
	})
	.superRefine((input, ctx) => {
		const hasMarketClientRefPrice = (input.marketClientRefPrice ?? "").length > 0;
		const hasMarketMaxSlippage =
			input.marketMaxSlippage !== undefined && input.marketMaxSlippage.kind !== "none";
		if (
			input.orderType !== ProtoWrite.OrderType.MARKET &&
			(hasMarketClientRefPrice || hasMarketMaxSlippage)
		) {
			ctx.addIssue({
				code: "custom",
				message:
					"market max slippage and client reference price are only valid for market orders",
				path: ["marketMaxSlippage"],
			});
		}
	})
	.transform(
		({ qty, price, subAccountId, risk, marketMaxSlippage, marketClientRefPrice, ...input }) => {
			const qtyScale = baseQuantityScaleForSymbol(input.symbol);
			const qtyScaled = parseQtyScaled(qty, qtyScale, "qty");
			const priceTicks =
				input.orderType === ProtoWrite.OrderType.LIMIT && price
					? parsePriceTicks(price, "price")
					: 0n;
			return {
				...input,
				qtyScaled,
				priceTicks,
				subaccountId: subAccountId,
				attachedRisk: risk,
				marketMaxSlippage: parseMarketMaxSlippage(marketMaxSlippage),
				marketClientRefPriceTicks: parseMarketClientRefPriceTicks(marketClientRefPrice),
			};
		}
	);

export type NewOrderInput = z.input<typeof NewOrderInputSchema>;

export const OrderSchema = z
	.object({
		orderId: z.bigint(),
		symbolId: z.number(),
		clientOrderId: z.string(),
		side: z.enum(ProtoWrite.Side),
		status: z.number(),
		orderType: z.number(),
		tif: z.number(),
		stpMode: z.number(),
		feeSource: z.number(),
		postOnly: z.boolean(),
		origQty: z.bigint(),
		cumQty: z.bigint(),
		leavesQty: z.bigint(),
		avgPxTicks: z.bigint(),
		priceTicks: z.bigint(),
		createdTsNs: z.bigint(),
		terminalTsNs: z.bigint(),
		terminalReason: z.string().optional().default(""),
		terminalReasonCode: z.number(),
		attachedRisk: ReadAttachedRiskSchema.optional(),
		origin: ReadOrderOriginSchema.optional(),
		marketClientRefPriceTicks: z.bigint(),
		marketMaxSlippageTicks: z.number(),
		marketMaxSlippageBps: z.number(),
	})
	.transform((o) => {
		const sideNum = o.side;
		const isPartial = o.status === ProtoRead.OrderStatus.WORKING && Number(o.cumQty) > 0;
		const pair = getPairBySymbolId(o.symbolId);
		const marketClientRefPrice =
			o.marketClientRefPriceTicks > 0n
				? formatPriceForSymbol(o.marketClientRefPriceTicks, o.symbolId)
				: undefined;
		const marketMaxSlippage = formatMarketMaxSlippage(
			o.marketMaxSlippageTicks,
			o.marketMaxSlippageBps
		);
		return {
			orderId: formatId(o.orderId),
			symbolId: o.symbolId,
			clientOrderId: o.clientOrderId,
			pair,
			status: isPartial ? ("partial" as const) : orderStatusLabelFor(o.status),
			side: sideLabelFor(sideNum),
			orderType: orderTypeLabelFor(o.orderType),
			tif: tifLabelFor(o.tif),
			stpMode: stpModeLabelFor(o.stpMode),
			feeSource: o.feeSource !== 0 ? feeSourceLabelFor(o.feeSource) : undefined,
			postOnly: o.postOnly,
			origQty: formatQtyForSymbol(o.origQty, o.symbolId),
			cumQty: formatQtyForSymbol(o.cumQty, o.symbolId),
			leavesQty: formatQtyForSymbol(o.leavesQty, o.symbolId),
			avgPx: formatPriceForSymbol(o.avgPxTicks, o.symbolId),
			price: formatPriceForSymbol(o.priceTicks, o.symbolId),
			createdTs: tsNsToMs(o.createdTsNs),
			terminalTs: tsNsToMs(o.terminalTsNs),
			symbol: symbolForSymbolId(o.symbolId),
			terminalReason: humanizeTerminalReason(o.terminalReason),
			terminalReasonCode: o.terminalReasonCode,
			attachedRisk: formatAttachedRisk(o.attachedRisk, o.symbolId),
			...(o.origin ? { origin: o.origin } : {}),
			...(marketClientRefPrice ? { marketClientRefPrice } : {}),
			...(marketMaxSlippage ? { marketMaxSlippage } : {}),
		};
	});

function humanizeTerminalReason(raw: string | null | undefined): string {
	const key = (raw ?? "").trim();
	if (!key) return "";
	const uppercaseAcronyms = ["GTC", "IOC", "FOK", "DAY", "GTD", "STP"];
	return key
		.split("_")
		.filter(Boolean)
		.map((part) => {
			const upper = part.toUpperCase();
			if (uppercaseAcronyms.includes(upper)) return upper;
			return upper[0] ? upper[0] + upper.slice(1).toLowerCase() : "";
		})
		.filter(Boolean)
		.join(" ");
}

export type Order = z.output<typeof OrderSchema>;

export const CancelOrderInputSchema = z
	.object({
		orderId: z
			.string()
			.trim()
			.transform((v) => idToBigInt(v, "orderId")),
		symbolId: z.number().optional(),
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

export const CancelAllOrdersInputSchema = z
	.object({
		subAccountId: z
			.string()
			.trim()
			.optional()
			.transform((v) => (v ? idToBigInt(v, "subaccountId") : undefined)),
		symbol: z.string().trim().optional(),
		side: SideSchema.optional().transform((v) =>
			v ? OrderSideCodec.inputToProto[v] : undefined
		),
		dryRun: z.boolean().optional().default(false),
		maxOrders: z.number().int().positive().optional(),
		requestId: z.string().trim().min(1).max(64),
	})
	.transform(({ subAccountId, ...rest }) => ({
		...rest,
		subaccountId: subAccountId,
	}));

export const CancelAllOrdersResponseSchema = z
	.object({
		status: z.string(),
		matchedOrders: z.number(),
		submittedCancels: z.number(),
		failedCancels: z.number(),
		tsNs: z.bigint(),
	})
	.transform((o) => ({
		status: o.status,
		matchedOrders: o.matchedOrders,
		submittedCancels: o.submittedCancels,
		failedCancels: o.failedCancels,
		ts: tsNsToMs(o.tsNs),
	}));

export type CancelAllOrdersResponse = z.output<typeof CancelAllOrdersResponseSchema>;

const ModifyBehaviorInputSchema = z.enum(["AMEND_OR_REPLACE", "AMEND_ONLY", "REPLACE_ONLY"]);

export const ModifyOrderInputSchema = z
	.object({
		orderId: z.string().trim().optional(),
		clientOrderId: z
			.string()
			.trim()
			.max(36)
			.regex(ClientOrderIdPattern, "clientOrderId has an invalid format")
			.optional(),
		subAccountId: z
			.string()
			.trim()
			.optional()
			.transform((v) => (v ? idToBigInt(v, "subaccountId") : undefined)),
		requestId: z
			.string()
			.trim()
			.min(1)
			.max(64)
			.regex(ClientOrderIdPattern, "requestId has an invalid format")
			.optional(),
		symbol: z.string().trim().min(1),
		newPrice: z.string().trim().optional(),
		newQty: z.string().trim().optional(),
		behavior: ModifyBehaviorInputSchema.optional(),
		newClientOrderId: z
			.string()
			.trim()
			.max(36)
			.regex(ClientOrderIdPattern, "newClientOrderId has an invalid format")
			.optional(),
		risk: RiskPolicyInputSchema,
		clearRisk: z.boolean().optional().default(false),
	})
	.superRefine((input, ctx) => {
		const hasOrderId = (input.orderId ?? "").trim().length > 0;
		const hasClientOrderId = (input.clientOrderId ?? "").trim().length > 0;
		if (hasOrderId === hasClientOrderId) {
			ctx.addIssue({
				code: "custom",
				message: "Provide exactly one of orderId or clientOrderId",
				path: ["orderId"],
			});
		}

		const hasNewPrice = (input.newPrice ?? "").trim().length > 0;
		const hasNewQty = (input.newQty ?? "").trim().length > 0;
		const hasRiskPatch = input.clearRisk === true || input.risk !== undefined;
		if (!hasNewPrice && !hasNewQty && !hasRiskPatch) {
			ctx.addIssue({
				code: "custom",
				message: "At least one patch field is required",
				path: ["newPrice"],
			});
		}

		if (input.clearRisk === true && input.risk !== undefined) {
			ctx.addIssue({
				code: "custom",
				message: "Provide risk or clearRisk, not both",
				path: ["risk"],
			});
		}
	})
	.transform((input) => {
		const orderIdRaw = (input.orderId ?? "").trim();
		const clientOrderId = (input.clientOrderId ?? "").trim();
		const hasOrderId = orderIdRaw.length > 0;
		const key = hasOrderId
			? { case: "orderId" as const, value: idToBigInt(orderIdRaw, "orderId") }
			: { case: "clientOrderId" as const, value: clientOrderId };
		const newPriceTicks = input.newPrice
			? parsePriceTicks(input.newPrice, "newPrice")
			: undefined;
		const newQtyScaled = input.newQty
			? parseQtyScaled(input.newQty, baseQuantityScaleForSymbol(input.symbol), "newQty")
			: undefined;
		const behavior = input.behavior
			? ModifyBehaviorCodec.inputToProto[input.behavior]
			: ProtoWrite.ModifyBehavior.AMEND_OR_REPLACE;
		const newAttachedRisk =
			input.clearRisk === true
				? ({} as NonNullable<ProtoWrite.ModifyOrderRequest["newAttachedRisk"]>)
				: input.risk;

		return {
			subaccountId: input.subAccountId,
			key,
			requestId: input.requestId,
			newPriceTicks,
			newQtyScaled,
			newAttachedRisk,
			behavior,
			newClientOrderId: input.newClientOrderId ?? "",
		};
	});

export type ModifyOrderInput = z.input<typeof ModifyOrderInputSchema>;

export const GetOrderInputSchema = z
	.object({
		orderId: z.string().trim().optional(),
		clientOrderId: z.string().trim().optional(),
		subAccountId: z
			.string()
			.trim()
			.optional()
			.transform((v) => (v ? idToBigInt(v, "subaccountId") : undefined)),
		includeAttachedRisk: z.boolean().optional().default(true),
		includeAttachedRiskState: z.boolean().optional().default(true),
	})
	.superRefine((input, ctx) => {
		const hasOrderId = (input.orderId ?? "").length > 0;
		const hasClientOrderId = (input.clientOrderId ?? "").length > 0;
		if (hasOrderId === hasClientOrderId) {
			ctx.addIssue({
				code: "custom",
				message: "Provide exactly one of orderId or clientOrderId",
				path: ["orderId"],
			});
		}
	})
	.transform(({ subAccountId, orderId, clientOrderId, ...rest }) => {
		const hasOrderId = (orderId ?? "").length > 0;
		const key = hasOrderId
			? ({ case: "orderId", value: idToBigInt(orderId ?? "", "orderId") } as const)
			: ({ case: "clientOrderId", value: clientOrderId ?? "" } as const);
		return {
			...rest,
			subaccountId: subAccountId,
			key,
		};
	});

const OrderTransferSchema = z
	.object({
		txId: z.string(),
		matchId: z.bigint().transform((v) => Number(v)),
		assetId: z.number(),
		amountHi: z.bigint(),
		amountLo: z.bigint(),
		isDebit: z.boolean(),
		type: z.number(),
		accountCode: z.number(),
		timestamp: z.bigint(),
	})
	.transform((tr) => {
		const aid = tr.assetId;
		const amt128 = fromU128({ hi: tr.amountHi, lo: tr.amountLo });
		let amount =
			aid !== 0
				? formatAmountDisplay(u128ToDecimal(amt128, LEDGER_SCALE), aid)
				: u128ToDecimal(amt128, LEDGER_SCALE);
		if (tr.isDebit) amount = `-${amount}`;
		else amount = `+${amount}`;
		return {
			txId: tr.txId,
			matchId: tr.matchId,
			assetId: tr.assetId,
			isDebit: tr.isDebit,
			timestamp: tsNsToMs(tr.timestamp),
			amount,
			symbol: symbolForAssetId(aid),
			type: transferTypeNameFor(tr.type),
			accountCode: accountCodeNameFor(tr.accountCode),
		};
	});

export type OrderTransfer = z.output<typeof OrderTransferSchema>;

export const GetOrderResponseSchema = z.object({
	order: OrderSchema,
	trades: z.array(UserTradeSchema).optional().default([]),
	transfers: z.array(OrderTransferSchema).optional().default([]),
});

export const CreateOrderResultSchema = z.object({
	status: z.string(),
	orderId: z.bigint().transform((v) => formatId(v)),
	clientOrderId: z.string(),
	tsNs: z.bigint().transform((v) => tsNsToMs(v)),
	takeProfitTriggerId: z
		.bigint()
		.optional()
		.transform((v) => (v ? formatId(v) : undefined)),
	stopLossTriggerId: z
		.bigint()
		.optional()
		.transform((v) => (v ? formatId(v) : undefined)),
	trailingStopTriggerId: z
		.bigint()
		.optional()
		.transform((v) => (v ? formatId(v) : undefined)),
});

export type CreateOrderResult = z.output<typeof CreateOrderResultSchema>;

export const ModifyOrderResultSchema = z.object({
	actionTaken: z
		.enum(ProtoWrite.ModifyActionTaken)
		.transform((v) => ModifyActionCodec.protoToLabel[v]),
	oldOrderId: z.bigint().transform((v) => formatId(v)),
	finalOrderId: z.bigint().transform((v) => formatId(v)),
	code: z.string(),
	takeProfitTriggerId: z
		.bigint()
		.optional()
		.transform((v) => (v ? formatId(v) : undefined)),
	stopLossTriggerId: z
		.bigint()
		.optional()
		.transform((v) => (v ? formatId(v) : undefined)),
	trailingStopTriggerId: z
		.bigint()
		.optional()
		.transform((v) => (v ? formatId(v) : undefined)),
	tsNs: z.bigint().transform((v) => tsNsToMs(v)),
});

export type ModifyOrderResult = z.output<typeof ModifyOrderResultSchema>;
