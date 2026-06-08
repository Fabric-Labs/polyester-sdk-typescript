import * as ProtoRead from "../../gen/orders/v1/orders_read_pb.js";
import * as ProtoWrite from "../../gen/orders/v1/orders_pb.js";
import * as v from "valibot";
import {
    BpsStringOrNumberInputSchema,
    NoneInputSchema,
    PercentStringOrNumberInputSchema,
    QuoteStringInputSchema,
    SideSchema,
    TicksStringInputSchema,
    TicksStringOrNumberInputSchema,
} from "../shared.js";
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
    parsePriceTicks,
    parseQtyScaled,
    parseOptionalPositiveIntLike,
} from "../../utils/numbers.js";
import { tsNsToMs } from "../../utils/time.js";
import { formatId, idToBigInt } from "../../utils/base58-id.js";
import {
    optionalSubaccountIdInputSchema,
    optionalUint64DecimalFilterSchema,
} from "../../shared/schemas.js";
import { requiredEnumLabel } from "../../shared/proto-enum-codec.js";
import {
    baseQuantityScaleForSymbol,
    getPairBySymbolId,
    symbolForSymbolId,
} from "../../catalogs/market-data-catalog.js";
import { UserTradeSchema } from "../trades/index.js";
import { fromU128, u128ToDecimal } from "../../utils/u128.js";
import {
    formatAmountDisplay,
    LEDGER_SCALE,
    symbolForAssetId,
    transferTypeNameFor,
    accountCodeNameFor,
} from "../../catalogs/ledger-catalog.js";
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

const OrderStatusSchema = v.picklist(["FILLED", "CANCELED", "REJECTED"]);

export const BaseOrdersFilterInputSchema = v.object({
    subaccountId: optionalSubaccountIdInputSchema(),
    symbolId: v.optional(v.array(v.number())),
    side: v.pipe(
        v.optional(SideSchema),
        v.transform((v) => (v ? OrderSideCodec.inputToProto[v] : undefined)),
    ),
    limit: v.optional(v.number()),
    pageToken: v.optional(v.pipe(v.string(), v.trim())),
});

export const OpenOrdersInputSchema = v.object({
    ...BaseOrdersFilterInputSchema.entries,

    includeAttachedRisk: v.optional(v.boolean(), true),
    includeAttachedRiskState: v.optional(v.boolean(), false),
});

export type OpenOrdersInput = v.InferInput<typeof OpenOrdersInputSchema>;

export const OrderHistoryInputSchema = v.object({
    ...BaseOrdersFilterInputSchema.entries,

    includeAttachedRisk: v.optional(v.boolean(), true),
    includeAttachedRiskState: v.optional(v.boolean(), false),

    status: v.pipe(
        v.optional(OrderStatusSchema),
        v.transform((v) => (v ? OrderStatusFilterCodec.inputToProto[v] : undefined)),
    ),

    startTsNs: optionalUint64DecimalFilterSchema("startTsNs"),

    endTsNs: optionalUint64DecimalFilterSchema("endTsNs"),
});

export type OrderHistoryInput = v.InferInput<typeof OrderHistoryInputSchema>;

const OrderTypeSchema = v.picklist(["limit", "market"]);
const TIFSchema = v.picklist(["gtc", "ioc", "fok"]);
const FeeSourceSchema = v.picklist(["quote", "received"]);
const STPSchema = v.picklist(["expire_taker", "expire_maker", "expire_both"]);

const TriggerPriceSourceSchema = v.picklist(["last", "index", "mark"]);
const ClientOrderIdPattern = /^[A-Za-z0-9._:/-]+$/;

const AttachedTriggerInputSchema = v.object({
    triggerPrice: v.pipe(v.string(), v.trim(), v.minLength(1)),
    triggerPriceSource: v.optional(TriggerPriceSourceSchema),
    orderType: v.optional(OrderTypeSchema),
    limitPrice: v.optional(v.pipe(v.string(), v.trim())),
});

type AttachedTriggerInput = v.InferOutput<typeof AttachedTriggerInputSchema>;

function transformAttachedTriggerInput(
    input: AttachedTriggerInput,
    fieldPrefix: "takeProfit" | "stopLoss",
) {
    const orderType = input.orderType
        ? OrderTypeCodec.inputToProto[input.orderType]
        : ProtoWrite.OrderType.MARKET;
    return {
        triggerPriceTicks: parsePriceTicks(input.triggerPrice, `${fieldPrefix}.triggerPrice`),
        triggerPriceSource: input.triggerPriceSource
            ? TriggerPriceSourceCodec.inputToProto[input.triggerPriceSource]
            : ProtoWrite.TriggerPriceSource.LAST_PRICE,
        orderType,
        limitPriceTicks:
            orderType === ProtoWrite.OrderType.LIMIT && input.limitPrice
                ? parsePriceTicks(input.limitPrice, `${fieldPrefix}.limitPrice`)
                : 0n,
    };
}

const TakeProfitInputSchema = v.pipe(
    AttachedTriggerInputSchema,
    v.transform((input) => transformAttachedTriggerInput(input, "takeProfit")),
);

const StopLossInputSchema = v.pipe(
    AttachedTriggerInputSchema,
    v.transform((input) => transformAttachedTriggerInput(input, "stopLoss")),
);

const TrailingDistanceSchema = v.union([
    TicksStringInputSchema,
    BpsStringOrNumberInputSchema,
    NoneInputSchema,
]);

const MaxSlippageSchema = v.union([
    TicksStringOrNumberInputSchema,
    BpsStringOrNumberInputSchema,
    NoneInputSchema,
]);

const MarketMaxSlippageSchema = v.union([
    TicksStringOrNumberInputSchema,
    BpsStringOrNumberInputSchema,
    PercentStringOrNumberInputSchema,
    QuoteStringInputSchema,
    NoneInputSchema,
]);

const MAX_BPS = 10_000;
const MAX_INT32 = 2_147_483_647;

function parseTrailingDistance(
    distance: v.InferOutput<typeof TrailingDistanceSchema>,
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
    slippage: v.InferOutput<typeof MaxSlippageSchema>,
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
    slippage: v.InferOutput<typeof MarketMaxSlippageSchema> | undefined,
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

const TrailingStopInputSchema = v.pipe(
    v.object({
        trailingDistance: TrailingDistanceSchema,
        maxSlippage: v.optional(MaxSlippageSchema),
        activationPrice: v.optional(v.pipe(v.string(), v.trim())),
        triggerPriceSource: v.optional(TriggerPriceSourceSchema),
        orderType: v.optional(OrderTypeSchema),
    }),
    v.transform((input) => ({
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
    })),
);

export const RiskPolicyInputSchema = v.pipe(
    v.optional(
        v.object({
            takeProfit: v.optional(TakeProfitInputSchema),
            stopLoss: v.optional(StopLossInputSchema),
            trailingStop: v.optional(TrailingStopInputSchema),
            oco: v.optional(v.boolean()),
        }),
    ),
    v.check(
        (input) => !input || !(input.stopLoss && input.trailingStop),
        "Provide exactly one stop leg: stopLoss or trailingStop",
    ),
    v.transform((input) => {
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
    }),
);

export type TakeProfitInput = v.InferInput<typeof TakeProfitInputSchema>;
export type StopLossInput = v.InferInput<typeof StopLossInputSchema>;
export type TrailingStopInput = v.InferInput<typeof TrailingStopInputSchema>;
export type RiskPolicyInput = v.InferInput<typeof RiskPolicyInputSchema>;

type TriggerPriceSource = "last" | "index" | "mark";
type RiskOrderType = "limit" | "market";
type TrailingDistance =
    | { kind: "ticks"; ticks: string }
    | { kind: "bps"; bps: number }
    | { kind: "none" };
type TrailingMaxSlippage = { kind: "ticks"; ticks: number } | { kind: "bps"; bps: number };
type MarketMaxSlippage = { kind: "ticks"; ticks: number } | { kind: "bps"; bps: number };

const ReadTakeProfitPolicySchema = v.object({
    triggerPriceTicks: v.bigint(),
    triggerPriceSource: v.number(),
    orderType: v.number(),
    limitPriceTicks: v.bigint(),
});

const ReadStopLossPolicySchema = v.object({
    triggerPriceTicks: v.bigint(),
    triggerPriceSource: v.number(),
    orderType: v.number(),
    limitPriceTicks: v.bigint(),
});

const ReadTrailingStopPolicySchema = v.object({
    trailingDistance: v.object({
        case: v.optional(
            v.union([
                v.literal("trailingDistanceTicks"),
                v.literal("trailingDistanceBps"),
                v.undefined(),
            ]),
        ),
        value: v.optional(v.union([v.bigint(), v.number(), v.undefined()])),
    }),
    maxSlippage: v.object({
        case: v.union([v.literal("maxSlippageTicks"), v.literal("maxSlippageBps"), v.undefined()]),
        value: v.optional(v.union([v.number(), v.undefined()])),
    }),
    activationPriceTicks: v.bigint(),
    triggerPriceSource: v.number(),
    orderType: v.number(),
});

const ReadAttachedRiskTakeProfitSchema = v.object({
    policy: v.optional(ReadTakeProfitPolicySchema),
});

const ReadAttachedRiskStopLossSchema = v.object({
    policy: v.optional(ReadStopLossPolicySchema),
});

const ReadAttachedRiskTrailingStopSchema = v.object({
    policy: v.optional(ReadTrailingStopPolicySchema),
});

const ReadAttachedRiskSchema = v.object({
    takeProfit: v.optional(ReadAttachedRiskTakeProfitSchema),
    stopLoss: v.optional(ReadAttachedRiskStopLossSchema),
    trailingStop: v.optional(ReadAttachedRiskTrailingStopSchema),
    oco: v.optional(v.boolean(), false),
});

const ReadOrderOriginSchema = v.object({
    scope: v.pipe(
        v.enum(ProtoRead.OrderOriginScope),
        v.transform((v) =>
            requiredEnumLabel(
                OrderOriginScopeCodec.protoToOutput,
                v,
                "ReadOrderOriginSchema",
                "scope",
            ),
        ),
    ),
    triggerType: v.pipe(
        v.enum(ProtoRead.OrderTriggerType),
        v.transform((v) =>
            requiredEnumLabel(
                OrderTriggerTypeCodec.protoToOutput,
                v,
                "ReadOrderOriginSchema",
                "trigger type",
            ),
        ),
    ),
    triggerId: v.pipe(
        v.optional(v.bigint()),
        v.transform((v) => (v ? formatId(v) : undefined)),
    ),
    parentOrderId: v.pipe(
        v.optional(v.bigint()),
        v.transform((v) => (v ? formatId(v) : undefined)),
    ),
    childSeq: v.number(),
});

function triggerPriceSourceLabelFor(v: number): TriggerPriceSource {
    if (v === ProtoWrite.TriggerPriceSource.LAST_PRICE) return "last";
    if (v === ProtoWrite.TriggerPriceSource.INDEX_PRICE) return "index";
    if (v === ProtoWrite.TriggerPriceSource.MARK_PRICE) return "mark";
    throw new Error(`[ReadAttachedRiskSchema]: invalid trigger price source ${v}`);
}

function riskOrderTypeLabelFor(v: number): RiskOrderType {
    const label = orderTypeLabelFor(v);
    if (label !== "limit" && label !== "market") {
        throw new Error(`[ReadAttachedRiskSchema]: invalid order type ${v}`);
    }
    return label;
}

function formatRiskLeg(
    leg:
        | v.InferOutput<typeof ReadTakeProfitPolicySchema>
        | v.InferOutput<typeof ReadStopLossPolicySchema>,
    symbolId: number,
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
    distance: v.InferOutput<typeof ReadTrailingStopPolicySchema>["trailingDistance"],
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
    slippage: v.InferOutput<typeof ReadTrailingStopPolicySchema>["maxSlippage"],
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
    risk: v.InferOutput<typeof ReadAttachedRiskSchema> | undefined,
    symbolId: number,
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
                            symbolId,
                        )
                      : undefined,
              triggerPriceSource: triggerPriceSourceLabelFor(
                  risk.trailingStop.policy.triggerPriceSource,
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

export const NewOrderInputSchema = v.pipe(
    v.object({
        subaccountId: optionalSubaccountIdInputSchema(),
        symbol: v.pipe(v.string(), v.trim(), v.minLength(1)),
        side: v.pipe(
            SideSchema,
            v.transform((v) => OrderSideCodec.inputToProto[v]),
        ),
        orderType: v.pipe(
            OrderTypeSchema,
            v.transform((v) => OrderTypeCodec.inputToProto[v]),
        ),
        tif: v.pipe(
            TIFSchema,
            v.transform((v) => TifCodec.inputToProto[v]),
        ),
        price: v.optional(v.pipe(v.string(), v.trim())),
        qty: v.pipe(v.string(), v.trim(), v.minLength(1)),
        postOnly: v.optional(v.boolean(), false),
        clientOrderId: v.optional(v.pipe(v.string(), v.trim())),
        feeSource: v.pipe(
            v.optional(FeeSourceSchema),
            v.transform((v) => (v ? FeeSourceCodec.inputToProto[v] : ProtoWrite.FeeSource.QUOTE)),
        ),
        stpMode: v.pipe(
            v.optional(STPSchema),
            v.transform((v) => (v ? StpModeCodec.inputToProto[v] : undefined)),
        ),
        risk: RiskPolicyInputSchema,
        marketMaxSlippage: v.optional(MarketMaxSlippageSchema),
        marketClientRefPrice: v.optional(v.pipe(v.string(), v.trim())),
    }),
    v.check((input) => {
        const hasMarketClientRefPrice = (input.marketClientRefPrice ?? "").length > 0;
        const hasMarketMaxSlippage =
            input.marketMaxSlippage !== undefined && input.marketMaxSlippage.kind !== "none";
        return input.orderType !== ProtoWrite.OrderType.MARKET &&
            (hasMarketClientRefPrice || hasMarketMaxSlippage)
            ? false
            : true;
    }, "market max slippage and client reference price are only valid for market orders"),
    v.transform(
        ({ qty, price, subaccountId, risk, marketMaxSlippage, marketClientRefPrice, ...input }) => {
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
                subaccountId,
                attachedRisk: risk,
                marketMaxSlippage: parseMarketMaxSlippage(marketMaxSlippage),
                marketClientRefPriceTicks: parseMarketClientRefPriceTicks(marketClientRefPrice),
            };
        },
    ),
);

export type NewOrderInput = v.InferInput<typeof NewOrderInputSchema>;

export const OrderSchema = v.pipe(
    v.object({
        orderId: v.bigint(),
        symbolId: v.number(),
        clientOrderId: v.string(),
        side: v.enum(ProtoWrite.Side),
        status: v.number(),
        orderType: v.number(),
        tif: v.number(),
        stpMode: v.number(),
        feeSource: v.number(),
        postOnly: v.boolean(),
        origQty: v.bigint(),
        cumQty: v.bigint(),
        leavesQty: v.bigint(),
        avgPxTicks: v.bigint(),
        priceTicks: v.bigint(),
        createdTsNs: v.bigint(),
        terminalTsNs: v.bigint(),
        terminalReason: v.optional(v.string(), ""),
        terminalReasonCode: v.number(),
        attachedRisk: v.optional(ReadAttachedRiskSchema),
        origin: v.optional(ReadOrderOriginSchema),
        marketClientRefPriceTicks: v.bigint(),
        marketMaxSlippageTicks: v.number(),
        marketMaxSlippageBps: v.number(),
    }),
    v.transform((o) => {
        const sideNum = o.side;
        const isPartial = o.status === ProtoRead.OrderStatus.WORKING && Number(o.cumQty) > 0;
        const pair = getPairBySymbolId(o.symbolId);
        const marketClientRefPrice =
            o.marketClientRefPriceTicks > 0n
                ? formatPriceForSymbol(o.marketClientRefPriceTicks, o.symbolId)
                : undefined;
        const marketMaxSlippage = formatMarketMaxSlippage(
            o.marketMaxSlippageTicks,
            o.marketMaxSlippageBps,
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
            feeSource: feeSourceLabelFor(o.feeSource),
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
    }),
);

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

export type Order = v.InferOutput<typeof OrderSchema>;

export const CancelOrderInputSchema = v.object({
    orderId: v.pipe(
        v.string(),
        v.trim(),
        v.transform((v) => idToBigInt(v, "orderId")),
    ),
    symbolId: v.optional(v.number()),
    subaccountId: optionalSubaccountIdInputSchema(),
});

export type CancelOrderInput = v.InferInput<typeof CancelOrderInputSchema>;

export const CancelOrderResultSchema = v.object({
    status: v.string(),
    orderId: v.pipe(
        v.bigint(),
        v.transform((v) => formatId(v)),
    ),
    tsNs: v.pipe(
        v.bigint(),
        v.transform((v) => tsNsToMs(v)),
    ),
});

export type CancelOrderResult = v.InferOutput<typeof CancelOrderResultSchema>;

export const CancelAllOrdersInputSchema = v.object({
    subaccountId: optionalSubaccountIdInputSchema(),
    symbol: v.optional(v.pipe(v.string(), v.trim())),
    side: v.pipe(
        v.optional(SideSchema),
        v.transform((v) => (v ? OrderSideCodec.inputToProto[v] : undefined)),
    ),
    dryRun: v.optional(v.boolean(), false),
    maxOrders: v.optional(v.pipe(v.number(), v.integer(), v.gtValue(0))),
    requestId: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(64))),
});

export type CancelAllOrdersInput = v.InferInput<typeof CancelAllOrdersInputSchema>;

export const CancelAllOrdersResponseSchema = v.pipe(
    v.object({
        status: v.string(),
        matchedOrders: v.number(),
        submittedCancels: v.number(),
        failedCancels: v.number(),
        tsNs: v.bigint(),
    }),
    v.transform((o) => ({
        status: o.status,
        matchedOrders: o.matchedOrders,
        submittedCancels: o.submittedCancels,
        failedCancels: o.failedCancels,
        ts: tsNsToMs(o.tsNs),
    })),
);

export type CancelAllOrdersResponse = v.InferOutput<typeof CancelAllOrdersResponseSchema>;

const ModifyBehaviorInputSchema = v.picklist(["AMEND_OR_REPLACE", "AMEND_ONLY", "REPLACE_ONLY"]);

export const ModifyOrderInputSchema = v.pipe(
    v.object({
        orderId: v.optional(v.pipe(v.string(), v.trim())),
        clientOrderId: v.optional(
            v.pipe(
                v.string(),
                v.trim(),
                v.maxLength(36),
                v.regex(ClientOrderIdPattern, "clientOrderId has an invalid format"),
            ),
        ),
        subaccountId: optionalSubaccountIdInputSchema(),
        requestId: v.optional(
            v.pipe(
                v.string(),
                v.trim(),
                v.minLength(1),
                v.maxLength(64),
                v.regex(ClientOrderIdPattern, "requestId has an invalid format"),
            ),
        ),
        symbol: v.pipe(v.string(), v.trim(), v.minLength(1)),
        newPrice: v.optional(v.pipe(v.string(), v.trim())),
        newQty: v.optional(v.pipe(v.string(), v.trim())),
        behavior: v.optional(ModifyBehaviorInputSchema),
        newClientOrderId: v.optional(
            v.pipe(
                v.string(),
                v.trim(),
                v.maxLength(36),
                v.regex(ClientOrderIdPattern, "newClientOrderId has an invalid format"),
            ),
        ),
        risk: RiskPolicyInputSchema,
        clearRisk: v.optional(v.boolean(), false),
    }),
    v.check((input) => {
        const hasOrderId = (input.orderId ?? "").trim().length > 0;
        const hasClientOrderId = (input.clientOrderId ?? "").trim().length > 0;
        return hasOrderId !== hasClientOrderId;
    }, "Provide exactly one of orderId or clientOrderId"),
    v.check((input) => {
        const hasNewPrice = (input.newPrice ?? "").trim().length > 0;
        const hasNewQty = (input.newQty ?? "").trim().length > 0;
        const hasRiskPatch = input.clearRisk === true || input.risk !== undefined;
        return hasNewPrice || hasNewQty || hasRiskPatch;
    }, "At least one patch field is required"),
    v.check(
        (input) => !(input.clearRisk === true && input.risk !== undefined),
        "Provide risk or clearRisk, not both",
    ),
    v.transform((input) => {
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
            subaccountId: input.subaccountId,
            key,
            requestId: input.requestId,
            newPriceTicks,
            newQtyScaled,
            newAttachedRisk,
            behavior,
            newClientOrderId: input.newClientOrderId ?? "",
        };
    }),
);

export type ModifyOrderInput = v.InferInput<typeof ModifyOrderInputSchema>;

export const GetOrderDetailsInputSchema = v.pipe(
    v.object({
        orderId: v.optional(v.pipe(v.string(), v.trim())),
        clientOrderId: v.optional(v.pipe(v.string(), v.trim())),
        subaccountId: optionalSubaccountIdInputSchema(),
        includeAttachedRisk: v.optional(v.boolean(), true),
        includeAttachedRiskState: v.optional(v.boolean(), true),
    }),
    v.check((input) => {
        const hasOrderId = (input.orderId ?? "").length > 0;
        const hasClientOrderId = (input.clientOrderId ?? "").length > 0;
        return hasOrderId !== hasClientOrderId;
    }, "Provide exactly one of orderId or clientOrderId"),
    v.transform(({ subaccountId, orderId, clientOrderId, ...rest }) => {
        const hasOrderId = (orderId ?? "").length > 0;
        const key = hasOrderId
            ? ({ case: "orderId", value: idToBigInt(orderId ?? "", "orderId") } as const)
            : ({ case: "clientOrderId", value: clientOrderId ?? "" } as const);
        return {
            ...rest,
            subaccountId,
            key,
        };
    }),
);

export type GetOrderDetailsInput = v.InferInput<typeof GetOrderDetailsInputSchema>;

const OrderTransferSchema = v.pipe(
    v.object({
        txId: v.string(),
        matchId: v.pipe(
            v.bigint(),
            v.transform((v) => Number(v)),
        ),
        assetId: v.number(),
        amountHi: v.bigint(),
        amountLo: v.bigint(),
        isDebit: v.boolean(),
        type: v.number(),
        accountCode: v.number(),
        timestamp: v.bigint(),
    }),
    v.transform((tr) => {
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
    }),
);

export type OrderTransfer = v.InferOutput<typeof OrderTransferSchema>;

export const OrderDetailsSchema = v.object({
    order: OrderSchema,
    trades: v.optional(v.array(UserTradeSchema), []),
    transfers: v.optional(v.array(OrderTransferSchema), []),
});

export type OrderDetails = v.InferOutput<typeof OrderDetailsSchema>;

const OptionalTriggerIdSchema = v.pipe(
    v.optional(v.bigint()),
    v.transform((v) => (v ? formatId(v) : undefined)),
);

export const CreateOrderResultSchema = v.object({
    status: v.string(),
    orderId: v.pipe(
        v.bigint(),
        v.transform((v) => formatId(v)),
    ),
    clientOrderId: v.string(),
    tsNs: v.pipe(
        v.bigint(),
        v.transform((v) => tsNsToMs(v)),
    ),
    takeProfitTriggerId: OptionalTriggerIdSchema,
    stopLossTriggerId: OptionalTriggerIdSchema,
    trailingStopTriggerId: OptionalTriggerIdSchema,
});

export type CreateOrderResult = v.InferOutput<typeof CreateOrderResultSchema>;

export const ModifyOrderResultSchema = v.object({
    actionTaken: v.pipe(
        v.enum(ProtoWrite.ModifyActionTaken),
        v.transform((v) =>
            requiredEnumLabel(
                ModifyActionCodec.protoToOutput,
                v,
                "ModifyOrderResultSchema",
                "action taken",
            ),
        ),
    ),
    oldOrderId: v.pipe(
        v.bigint(),
        v.transform((v) => formatId(v)),
    ),
    finalOrderId: v.pipe(
        v.bigint(),
        v.transform((v) => formatId(v)),
    ),
    code: v.string(),
    takeProfitTriggerId: OptionalTriggerIdSchema,
    stopLossTriggerId: OptionalTriggerIdSchema,
    trailingStopTriggerId: OptionalTriggerIdSchema,
    tsNs: v.pipe(
        v.bigint(),
        v.transform((v) => tsNsToMs(v)),
    ),
});

export type ModifyOrderResult = v.InferOutput<typeof ModifyOrderResultSchema>;
