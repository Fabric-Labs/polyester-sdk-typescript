import * as ProtoWrite from "../../gen/orders/v1/orders_pb.js";
import * as v from "valibot";
import {
    BpsStringOrNumberInputSchema,
    NoneInputSchema,
    PercentStringOrNumberInputSchema,
    QuoteStringInputSchema,
    TicksStringInputSchema,
    TicksStringOrNumberInputSchema,
} from "../shared.js";
import { parsePriceTicks } from "../../utils/numbers.js";
import {
    ORDER_TYPE_VALUES,
    OrderTypeCodec,
    TRIGGER_PRICE_SOURCE_VALUES,
    TriggerPriceSourceCodec,
} from "./orders.codecs.js";
import { requiredEnumLabel } from "../../shared/proto-enum-codec.js";
import { parseSlippageInput, parseTrailingDistanceInput } from "../trailing-oneof-inputs.js";

const OrderTypeSchema = v.picklist(ORDER_TYPE_VALUES);
const TriggerPriceSourceSchema = v.picklist(TRIGGER_PRICE_SOURCE_VALUES);

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

export const MarketMaxSlippageSchema = v.union([
    TicksStringOrNumberInputSchema,
    BpsStringOrNumberInputSchema,
    PercentStringOrNumberInputSchema,
    QuoteStringInputSchema,
    NoneInputSchema,
]);

const MAX_BPS = 10_000;
const MAX_INT32 = 2_147_483_647;
const UNSET_TRAILING_STOP_MAX_SLIPPAGE: ProtoWrite.TrailingStopPolicy["maxSlippage"] = {
    case: undefined,
    value: undefined,
};

function parseTrailingDistance(
    distance: v.InferOutput<typeof TrailingDistanceSchema>,
): ProtoWrite.TrailingStopPolicy["trailingDistance"] {
    return parseTrailingDistanceInput(distance, "trailingStop.trailingDistance");
}

function parseMaxSlippage(
    slippage: v.InferOutput<typeof MaxSlippageSchema>,
): ProtoWrite.TrailingStopPolicy["maxSlippage"] {
    return parseSlippageInput(slippage, {
        fieldName: "trailingStop.maxSlippage",
        ticksCase: "maxSlippageTicks",
        bpsCase: "maxSlippageBps",
    });
}

export function parseMarketMaxSlippage(
    slippage: v.InferOutput<typeof MarketMaxSlippageSchema> | undefined,
): ProtoWrite.CreateOrderRequest["marketMaxSlippage"] {
    return parseSlippageInput(slippage, {
        fieldName: "marketMaxSlippage",
        ticksCase: "marketMaxSlippageTicks",
        bpsCase: "marketMaxSlippageBps",
        maxTicks: MAX_INT32,
        maxBps: MAX_BPS,
        maxPercent: 100,
    });
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
            : UNSET_TRAILING_STOP_MAX_SLIPPAGE,
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

const RiskPolicyObjectInputSchema = v.union([
    v.object({
        takeProfit: TakeProfitInputSchema,
        stopLoss: StopLossInputSchema,
        trailingStop: v.optional(v.never()),
        oco: v.optional(v.boolean()),
    }),
    v.object({
        takeProfit: TakeProfitInputSchema,
        stopLoss: v.optional(v.never()),
        trailingStop: TrailingStopInputSchema,
        oco: v.optional(v.boolean()),
    }),
    v.object({
        takeProfit: TakeProfitInputSchema,
        stopLoss: v.optional(v.never()),
        trailingStop: v.optional(v.never()),
        oco: v.optional(v.boolean()),
    }),
    v.object({
        takeProfit: v.optional(v.never()),
        stopLoss: StopLossInputSchema,
        trailingStop: v.optional(v.never()),
        oco: v.optional(v.boolean()),
    }),
    v.object({
        takeProfit: v.optional(v.never()),
        stopLoss: v.optional(v.never()),
        trailingStop: TrailingStopInputSchema,
        oco: v.optional(v.boolean()),
    }),
]);

type RiskPolicyObjectInput = v.InferOutput<typeof RiskPolicyObjectInputSchema>;

function transformRiskPolicyInput(input: RiskPolicyObjectInput) {
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
}

export const RiskPolicyInputSchema = v.pipe(
    v.optional(RiskPolicyObjectInputSchema),
    v.transform((input) => (input ? transformRiskPolicyInput(input) : undefined)),
);

export const RequiredRiskPolicyInputSchema = v.pipe(
    RiskPolicyObjectInputSchema,
    v.transform((input) => transformRiskPolicyInput(input)),
);

export type TakeProfitInput = v.InferInput<typeof TakeProfitInputSchema>;
export type StopLossInput = v.InferInput<typeof StopLossInputSchema>;
export type TrailingStopInput = v.InferInput<typeof TrailingStopInputSchema>;
export type RiskPolicyInput = v.InferInput<typeof RiskPolicyInputSchema>;

type TrailingDistance =
    | { kind: "ticks"; ticks: string }
    | { kind: "bps"; bps: number }
    | { kind: "none" };
type TrailingMaxSlippage = { kind: "ticks"; ticks: number } | { kind: "bps"; bps: number };
export type MarketMaxSlippage = { kind: "ticks"; ticks: number } | { kind: "bps"; bps: number };

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

export const ReadAttachedRiskSchema = v.object({
    takeProfit: v.optional(ReadAttachedRiskTakeProfitSchema),
    stopLoss: v.optional(ReadAttachedRiskStopLossSchema),
    trailingStop: v.optional(ReadAttachedRiskTrailingStopSchema),
    oco: v.optional(v.boolean(), false),
});

function formatRiskLeg(
    leg:
        | v.InferOutput<typeof ReadTakeProfitPolicySchema>
        | v.InferOutput<typeof ReadStopLossPolicySchema>,
) {
    const orderType = requiredEnumLabel(
        OrderTypeCodec.protoToOutput,
        leg.orderType,
        "ReadAttachedRiskSchema",
        "order type",
    );
    return {
        triggerPriceTicks: leg.triggerPriceTicks.toString(),
        triggerPriceSource: requiredEnumLabel(
            TriggerPriceSourceCodec.protoToOutput,
            leg.triggerPriceSource,
            "ReadAttachedRiskSchema",
            "trigger price source",
        ),
        orderType,
        limitPriceTicks: orderType === "limit" ? leg.limitPriceTicks.toString() : undefined,
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

export function formatMarketMaxSlippage(ticks: number, bps: number): MarketMaxSlippage | undefined {
    if (ticks > 0) {
        return { kind: "ticks", ticks };
    }
    if (bps > 0) {
        return { kind: "bps", bps };
    }
    return undefined;
}

export function formatAttachedRisk(risk: v.InferOutput<typeof ReadAttachedRiskSchema> | undefined) {
    if (!risk) return undefined;

    const takeProfit = risk.takeProfit?.policy ? formatRiskLeg(risk.takeProfit.policy) : undefined;
    const stopLoss = risk.stopLoss?.policy ? formatRiskLeg(risk.stopLoss.policy) : undefined;
    const trailingStop = risk.trailingStop?.policy
        ? {
              trailingDistance: formatTrailingDistance(risk.trailingStop.policy.trailingDistance),
              maxSlippage: formatTrailingMaxSlippage(risk.trailingStop.policy.maxSlippage),
              activationPriceTicks:
                  risk.trailingStop.policy.activationPriceTicks > 0n
                      ? risk.trailingStop.policy.activationPriceTicks.toString()
                      : undefined,
              triggerPriceSource: requiredEnumLabel(
                  TriggerPriceSourceCodec.protoToOutput,
                  risk.trailingStop.policy.triggerPriceSource,
                  "ReadAttachedRiskSchema",
                  "trigger price source",
              ),
              orderType: requiredEnumLabel(
                  OrderTypeCodec.protoToOutput,
                  risk.trailingStop.policy.orderType,
                  "ReadAttachedRiskSchema",
                  "order type",
              ),
          }
        : undefined;

    if (!takeProfit && !stopLoss && !trailingStop) return undefined;

    const effectiveStopLoss = trailingStop ? undefined : stopLoss;

    return {
        takeProfit,
        stopLoss: effectiveStopLoss,
        trailingStop,
        oco: risk.oco,
    };
}
