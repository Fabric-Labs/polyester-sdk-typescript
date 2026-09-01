import * as ProtoWrite from "../../gen/orders/v1/orders_pb.js";
import * as ProtoRead from "../../gen/orders/v1/orders_read_pb.js";
import { create } from "@bufbuild/protobuf";
import * as v from "valibot";
import {
    BpsStringOrNumberInputSchema,
    NoneInputSchema,
    PriceDistanceInputSchema,
    PriceSlippageInputSchema,
} from "../shared.js";
import {
    positiveDecimalInputToScaled,
    scaledToDecimalOutput,
    type SdkScales,
} from "../../shared/decimal-surface.js";
import {
    MAX_SLIPPAGE_BPS,
    parseSlippageInput,
    parseTrailingDistanceInput,
} from "../trailing-oneof-inputs.js";
import { requiredEnumLabel } from "../../shared/proto-enum-codec.js";
import { formatId } from "../../utils/base58-id.js";
import { tsNsToMs } from "../../utils/time.js";
import { AttachedRiskLegStatusCodec } from "./orders.codecs.js";

const DecimalInputStringSchema = v.pipe(v.string(), v.trim(), v.minLength(1));

function attachedTriggerInputSchema(scales: SdkScales, fieldPrefix: "takeProfit" | "stopLoss") {
    return v.pipe(
        v.strictObject({
            triggerPrice: DecimalInputStringSchema,
            execution: v.variant("type", [
                v.strictObject({
                    type: v.literal("market_ioc"),
                }),
                v.strictObject({
                    type: v.literal("limit_gtc"),
                    price: DecimalInputStringSchema,
                }),
            ]),
        }),
        v.transform((input) => {
            const execution: ProtoWrite.RiskExecution["execution"] =
                input.execution.type === "market_ioc"
                    ? {
                          case: "marketIoc",
                          value: create(ProtoWrite.RiskMarketIocSchema),
                      }
                    : {
                          case: "limitGtc",
                          value: create(ProtoWrite.RiskLimitGtcSchema, {
                              priceTicks: positiveDecimalInputToScaled(
                                  `${fieldPrefix}.execution.price`,
                                  input.execution.price,
                                  scales.price(),
                              ),
                          }),
                      };
            return {
                triggerPriceTicks: positiveDecimalInputToScaled(
                    `${fieldPrefix}.triggerPrice`,
                    input.triggerPrice,
                    scales.price(),
                ),
                child: { execution },
            };
        }),
    );
}

const TrailingDistanceSchema = v.union([PriceDistanceInputSchema, BpsStringOrNumberInputSchema]);

const MaxSlippageSchema = v.union([
    PriceSlippageInputSchema,
    BpsStringOrNumberInputSchema,
    NoneInputSchema,
]);

export const MarketMaxSlippageSchema = v.union([
    PriceSlippageInputSchema,
    BpsStringOrNumberInputSchema,
    NoneInputSchema,
]);

const UNSET_TRAILING_STOP_MAX_SLIPPAGE: ProtoWrite.TrailingStopPolicy["maxSlippage"] = {
    case: undefined,
    value: undefined,
};

function parseTrailingDistance(
    scales: SdkScales,
    distance: v.InferOutput<typeof TrailingDistanceSchema>,
): ProtoWrite.TrailingStopPolicy["trailingDistance"] {
    return parseTrailingDistanceInput(scales, distance, "trailingStop.trailingDistance");
}

function parseMaxSlippage(
    scales: SdkScales,
    slippage: v.InferOutput<typeof MaxSlippageSchema>,
): ProtoWrite.TrailingStopPolicy["maxSlippage"] {
    return parseSlippageInput(scales, slippage, {
        fieldName: "trailingStop.maxSlippage",
        ticksCase: "maxSlippageTicks",
        bpsCase: "maxSlippageBps",
        maxBps: MAX_SLIPPAGE_BPS,
    });
}

export function parseMarketMaxSlippage(
    scales: SdkScales,
    slippage: v.InferOutput<typeof MarketMaxSlippageSchema> | undefined,
): ProtoWrite.MarketIoc["maxSlippage"] {
    return parseSlippageInput(scales, slippage, {
        fieldName: "execution.maxSlippage",
        ticksCase: "maxSlippageTicks",
        bpsCase: "maxSlippageBps",
        maxBps: MAX_SLIPPAGE_BPS,
    });
}

function createTrailingStopInputSchema(scales: SdkScales) {
    return v.pipe(
        v.strictObject({
            trailingDistance: TrailingDistanceSchema,
            maxSlippage: v.optional(MaxSlippageSchema),
            activationPrice: v.optional(DecimalInputStringSchema),
        }),
        v.transform((input) => ({
            trailingDistance: parseTrailingDistance(scales, input.trailingDistance),
            maxSlippage: input.maxSlippage
                ? parseMaxSlippage(scales, input.maxSlippage)
                : UNSET_TRAILING_STOP_MAX_SLIPPAGE,
            activationPriceTicks:
                input.activationPrice === undefined
                    ? 0n
                    : positiveDecimalInputToScaled(
                          "trailingStop.activationPrice",
                          input.activationPrice,
                          scales.price(),
                      ),
        })),
    );
}

function createRiskPolicyObjectInputSchema(scales: SdkScales) {
    const TakeProfitInputSchema = attachedTriggerInputSchema(scales, "takeProfit");
    const StopLossInputSchema = attachedTriggerInputSchema(scales, "stopLoss");
    const TrailingStopInputSchema = createTrailingStopInputSchema(scales);
    const InactiveOcoInputSchema = v.optional(
        v.literal(false, "oco requires takeProfit and exactly one stop leg"),
    );
    return v.union([
        v.strictObject({
            takeProfit: TakeProfitInputSchema,
            stopLoss: StopLossInputSchema,
            trailingStop: v.optional(v.never()),
            oco: v.optional(v.boolean()),
        }),
        v.strictObject({
            takeProfit: TakeProfitInputSchema,
            stopLoss: v.optional(v.never()),
            trailingStop: TrailingStopInputSchema,
            oco: v.optional(v.boolean()),
        }),
        v.strictObject({
            takeProfit: TakeProfitInputSchema,
            stopLoss: v.optional(v.never()),
            trailingStop: v.optional(v.never()),
            oco: InactiveOcoInputSchema,
        }),
        v.strictObject({
            takeProfit: v.optional(v.never()),
            stopLoss: StopLossInputSchema,
            trailingStop: v.optional(v.never()),
            oco: InactiveOcoInputSchema,
        }),
        v.strictObject({
            takeProfit: v.optional(v.never()),
            stopLoss: v.optional(v.never()),
            trailingStop: TrailingStopInputSchema,
            oco: InactiveOcoInputSchema,
        }),
    ]);
}

type RiskPolicyObjectInput = v.InferOutput<ReturnType<typeof createRiskPolicyObjectInputSchema>>;

function transformRiskPolicyInput(input: RiskPolicyObjectInput) {
    const stopLeg = input.stopLoss
        ? ({ case: "stopLoss", value: input.stopLoss } as const)
        : input.trailingStop
          ? ({ case: "trailingStop", value: input.trailingStop } as const)
          : ({ case: undefined, value: undefined } as const);
    return {
        takeProfit: input.takeProfit,
        stopLeg,
        oco: input.oco ?? false,
    };
}

export function createRiskPolicyInputSchema(scales: SdkScales) {
    return v.pipe(
        v.optional(createRiskPolicyObjectInputSchema(scales)),
        v.transform((input) => (input ? transformRiskPolicyInput(input) : undefined)),
    );
}

export function createRequiredRiskPolicyInputSchema(scales: SdkScales) {
    return v.pipe(
        createRiskPolicyObjectInputSchema(scales),
        v.transform((input) => transformRiskPolicyInput(input)),
    );
}

export type TakeProfitInput = v.InferInput<ReturnType<typeof attachedTriggerInputSchema>>;
export type StopLossInput = v.InferInput<ReturnType<typeof attachedTriggerInputSchema>>;
export type TrailingStopInput = v.InferInput<ReturnType<typeof createTrailingStopInputSchema>>;
export type RiskPolicyInput = v.InferInput<ReturnType<typeof createRiskPolicyInputSchema>>;

type TrailingDistance =
    | { kind: "distance"; distance: string }
    | { kind: "bps"; bps: number }
    | { kind: "none" };
type TrailingMaxSlippage = { kind: "slippage"; slippage: string } | { kind: "bps"; bps: number };
export type MarketMaxSlippage =
    | { kind: "slippage"; slippage: string }
    | { kind: "bps"; bps: number };

const ReadRiskExecutionSchema = v.object({
    execution: v.variant("case", [
        v.object({
            case: v.literal("marketIoc"),
            value: v.object({}),
        }),
        v.object({
            case: v.literal("limitGtc"),
            value: v.object({
                priceTicks: v.bigint(),
            }),
        }),
    ]),
});

const ReadTakeProfitPolicySchema = v.object({
    triggerPriceTicks: v.bigint(),
    child: ReadRiskExecutionSchema,
});

const ReadStopLossPolicySchema = v.object({
    triggerPriceTicks: v.bigint(),
    child: ReadRiskExecutionSchema,
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
});

const ReadAttachedRiskLegStateSchema = v.object({
    status: v.enum(ProtoRead.AttachedRiskLegState_Status),
    armedTsNs: v.bigint(),
    terminalTsNs: v.bigint(),
    triggerId: v.optional(v.bigint()),
    childOrderId: v.optional(v.bigint()),
});

const ReadAttachedRiskTakeProfitSchema = v.object({
    policy: v.optional(ReadTakeProfitPolicySchema),
    state: v.optional(ReadAttachedRiskLegStateSchema),
});

const ReadAttachedRiskStopLossSchema = v.object({
    policy: v.optional(ReadStopLossPolicySchema),
    state: v.optional(ReadAttachedRiskLegStateSchema),
});

const ReadAttachedRiskTrailingStopSchema = v.object({
    policy: v.optional(ReadTrailingStopPolicySchema),
    state: v.optional(ReadAttachedRiskLegStateSchema),
});

export const ReadAttachedRiskSchema = v.object({
    takeProfit: v.optional(ReadAttachedRiskTakeProfitSchema),
    stopLoss: v.optional(ReadAttachedRiskStopLossSchema),
    trailingStop: v.optional(ReadAttachedRiskTrailingStopSchema),
    oco: v.optional(v.boolean(), false),
});

function formatRiskExecution(
    scales: SdkScales,
    child: v.InferOutput<typeof ReadRiskExecutionSchema>,
) {
    if (child.execution.case === "marketIoc") {
        return { type: "market_ioc" } as const;
    }
    return {
        type: "limit_gtc",
        price: scaledToDecimalOutput(child.execution.value.priceTicks, scales.price()),
    } as const;
}

function formatRiskLeg(
    scales: SdkScales,
    leg:
        | v.InferOutput<typeof ReadTakeProfitPolicySchema>
        | v.InferOutput<typeof ReadStopLossPolicySchema>,
) {
    return {
        triggerPrice: scaledToDecimalOutput(leg.triggerPriceTicks, scales.price()),
        execution: formatRiskExecution(scales, leg.child),
    };
}

function formatRiskLegState(state: v.InferOutput<typeof ReadAttachedRiskLegStateSchema>) {
    return {
        status: requiredEnumLabel(
            AttachedRiskLegStatusCodec.protoToOutput,
            state.status,
            "AttachedRiskLegStateSchema",
            "status",
        ),
        armedTs: state.armedTsNs > 0n ? tsNsToMs(state.armedTsNs) : undefined,
        armedTsNs: state.armedTsNs > 0n ? state.armedTsNs.toString() : undefined,
        terminalTs: state.terminalTsNs > 0n ? tsNsToMs(state.terminalTsNs) : undefined,
        terminalTsNs: state.terminalTsNs > 0n ? state.terminalTsNs.toString() : undefined,
        triggerId:
            state.triggerId !== undefined && state.triggerId > 0n
                ? formatId(state.triggerId)
                : undefined,
        childOrderId:
            state.childOrderId !== undefined && state.childOrderId > 0n
                ? formatId(state.childOrderId)
                : undefined,
    };
}

function formatTrailingDistance(
    scales: SdkScales,
    distance: v.InferOutput<typeof ReadTrailingStopPolicySchema>["trailingDistance"],
): TrailingDistance {
    if (distance.case === "trailingDistanceTicks" && typeof distance.value === "bigint") {
        return {
            kind: "distance",
            distance: scaledToDecimalOutput(distance.value, scales.price()),
        };
    }
    if (distance.case === "trailingDistanceBps" && typeof distance.value === "number") {
        return { kind: "bps", bps: distance.value };
    }
    return { kind: "none" };
}

function formatTrailingMaxSlippage(
    scales: SdkScales,
    slippage: v.InferOutput<typeof ReadTrailingStopPolicySchema>["maxSlippage"],
): TrailingMaxSlippage | undefined {
    if (slippage.case === "maxSlippageTicks" && typeof slippage.value === "number") {
        return {
            kind: "slippage",
            slippage: scaledToDecimalOutput(BigInt(slippage.value), scales.price()),
        };
    }
    if (slippage.case === "maxSlippageBps" && typeof slippage.value === "number") {
        return { kind: "bps", bps: slippage.value };
    }
    return undefined;
}

export function formatMarketMaxSlippage(
    scales: SdkScales,
    ticks: number,
    bps: number,
): MarketMaxSlippage | undefined {
    if (ticks > 0) {
        return { kind: "slippage", slippage: scaledToDecimalOutput(BigInt(ticks), scales.price()) };
    }
    if (bps > 0) {
        return { kind: "bps", bps };
    }
    return undefined;
}

export function formatAttachedRisk(
    scales: SdkScales,
    risk: v.InferOutput<typeof ReadAttachedRiskSchema> | undefined,
) {
    if (!risk) return undefined;

    const takeProfit =
        risk.takeProfit?.policy ||
        (risk.takeProfit?.state &&
            risk.takeProfit.state.status !== ProtoRead.AttachedRiskLegState_Status.NOT_CONFIGURED)
            ? {
                  ...(risk.takeProfit.policy
                      ? formatRiskLeg(scales, risk.takeProfit.policy)
                      : undefined),
                  state: risk.takeProfit.state
                      ? formatRiskLegState(risk.takeProfit.state)
                      : undefined,
              }
            : undefined;
    const stopLoss =
        risk.stopLoss?.policy ||
        (risk.stopLoss?.state &&
            risk.stopLoss.state.status !== ProtoRead.AttachedRiskLegState_Status.NOT_CONFIGURED)
            ? {
                  ...(risk.stopLoss.policy
                      ? formatRiskLeg(scales, risk.stopLoss.policy)
                      : undefined),
                  state: risk.stopLoss.state ? formatRiskLegState(risk.stopLoss.state) : undefined,
              }
            : undefined;
    const trailingStop =
        risk.trailingStop?.policy ||
        (risk.trailingStop?.state &&
            risk.trailingStop.state.status !== ProtoRead.AttachedRiskLegState_Status.NOT_CONFIGURED)
            ? {
                  ...(risk.trailingStop.policy
                      ? {
                            trailingDistance: formatTrailingDistance(
                                scales,
                                risk.trailingStop.policy.trailingDistance,
                            ),
                            maxSlippage: formatTrailingMaxSlippage(
                                scales,
                                risk.trailingStop.policy.maxSlippage,
                            ),
                            activationPrice:
                                risk.trailingStop.policy.activationPriceTicks > 0n
                                    ? scaledToDecimalOutput(
                                          risk.trailingStop.policy.activationPriceTicks,
                                          scales.price(),
                                      )
                                    : undefined,
                        }
                      : undefined),
                  state: risk.trailingStop.state
                      ? formatRiskLegState(risk.trailingStop.state)
                      : undefined,
              }
            : undefined;

    if (!takeProfit && !stopLoss && !trailingStop) return undefined;

    return {
        takeProfit,
        stopLoss,
        trailingStop,
        oco: risk.oco,
    };
}
