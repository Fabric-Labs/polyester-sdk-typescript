import * as v from "valibot";
import {
    BigIntStringSchema,
    OptionalTimestampMsSchema,
    TimestampSchema,
    PublicIdSchema,
} from "../../shared/schemas.js";
import { enumLabel, enumLabelSchema } from "../../shared/proto-enum-codec.js";
import { scaledToDecimalOutput, type SdkScales } from "../../shared/decimal-surface.js";
import { tsNsToMs, tsObjToMs } from "../../utils/time.js";
import { formatId } from "../../utils/base58-id.js";
import {
    TriggerTypeCodec,
    TriggerStatusCodec,
    FeeAssetCodec,
    SelfTradePreventionModeCodec,
    TriggerPriceSourceCodec,
    TriggerDirectionCodec,
    LadderDistributionCodec,
    TriggerSideCodec,
    TriggerEventTypeCodec,
    TriggerCancelReasonCodec,
    TriggerFailureReasonCodec,
} from "./triggers.codecs.js";

type TriggerPriceSourceLabel = "last" | "index" | "mark" | "unspecified";

type TriggerDirectionLabel = "above" | "below" | "unspecified";

type LadderDistributionLabel = "linear" | "geometric" | "weighted_favorable" | "unspecified";

const TriggerResultStatusSchema = enumLabelSchema(TriggerStatusCodec.protoToOutput);

const TriggerMutationResultBaseSchema = v.pipe(
    v.object({
        triggerId: PublicIdSchema,
        status: TriggerResultStatusSchema,
        tsNs: v.bigint(),
    }),
    v.transform(({ tsNs, ...result }) => ({
        ...result,
        ts: tsNsToMs(tsNs),
        tsNs: tsNs.toString(),
    })),
);

export const CreateTriggerResultSchema = v.pipe(
    v.object({
        triggerId: PublicIdSchema,
        clientTriggerId: v.string(),
        acceptedAt: OptionalTimestampMsSchema,
        acceptedAtTsNs: BigIntStringSchema,
    }),
    v.transform(({ acceptedAt, acceptedAtTsNs, ...result }) => ({
        ...result,
        acceptedAt: acceptedAt ?? tsNsToMs(BigInt(acceptedAtTsNs)),
        acceptedAtNs: acceptedAtTsNs,
    })),
);

export type CreateTriggerResult = v.InferOutput<typeof CreateTriggerResultSchema>;

export const CancelTriggerResultSchema = TriggerMutationResultBaseSchema;

export type CancelTriggerResult = v.InferOutput<typeof CancelTriggerResultSchema>;

export const ModifyTriggerResultSchema = TriggerMutationResultBaseSchema;

export type ModifyTriggerResult = v.InferOutput<typeof ModifyTriggerResultSchema>;

export const PauseTriggerResultSchema = TriggerMutationResultBaseSchema;
export type PauseTriggerResult = v.InferOutput<typeof PauseTriggerResultSchema>;

export const ResumeTriggerResultSchema = TriggerMutationResultBaseSchema;
export type ResumeTriggerResult = v.InferOutput<typeof ResumeTriggerResultSchema>;

const ConditionalExecutionRawSchema = v.variant("case", [
    v.object({
        case: v.literal("marketIoc"),
        value: v.object({}),
    }),
    v.object({
        case: v.literal("limitGtc"),
        value: v.object({
            priceTicks: v.bigint(),
            postOnly: v.boolean(),
        }),
    }),
    v.object({
        case: v.literal("limitIoc"),
        value: v.object({ priceTicks: v.bigint() }),
    }),
    v.object({
        case: v.literal("limitFok"),
        value: v.object({ priceTicks: v.bigint() }),
    }),
    v.object({ case: v.undefined(), value: v.optional(v.undefined()) }),
]);

const ConditionalConfigurationRawSchema = v.object({
    triggerPriceTicks: v.bigint(),
    side: v.number(),
    child: v.optional(
        v.object({
            execution: ConditionalExecutionRawSchema,
        }),
    ),
});

const MaxSlippageRawSchema = v.variant("case", [
    v.object({ case: v.literal("maxSlippageTicks"), value: v.number() }),
    v.object({ case: v.literal("maxSlippageBps"), value: v.number() }),
    v.object({ case: v.undefined(), value: v.optional(v.undefined()) }),
]);

const TrailingConfigurationRawSchema = v.object({
    trailingDistance: v.variant("case", [
        v.object({ case: v.literal("trailingDistanceTicks"), value: v.bigint() }),
        v.object({ case: v.literal("trailingDistanceBps"), value: v.number() }),
        v.object({ case: v.undefined(), value: v.optional(v.undefined()) }),
    ]),
    activationPriceTicks: v.bigint(),
    maxSlippage: MaxSlippageRawSchema,
    side: v.number(),
});

const TwapConfigurationRawSchema = v.object({
    side: v.number(),
    durationMs: v.bigint(),
    sliceIntervalMs: v.bigint(),
    execution: v.variant("case", [
        v.object({
            case: v.literal("marketIoc"),
            value: v.object({ maxSlippage: MaxSlippageRawSchema }),
        }),
        v.object({
            case: v.literal("limitGtc"),
            value: v.object({ priceTicks: v.bigint() }),
        }),
        v.object({ case: v.undefined(), value: v.optional(v.undefined()) }),
    ]),
});

const LadderConfigurationRawSchema = v.object({
    side: v.number(),
    priceMinTicks: v.bigint(),
    priceMaxTicks: v.bigint(),
    levels: v.number(),
    postOnly: v.boolean(),
});

const TriggerConfigurationRawSchema = v.variant("case", [
    v.object({ case: v.literal("stopLoss"), value: ConditionalConfigurationRawSchema }),
    v.object({ case: v.literal("takeProfit"), value: ConditionalConfigurationRawSchema }),
    v.object({ case: v.literal("trailingStop"), value: TrailingConfigurationRawSchema }),
    v.object({ case: v.literal("twap"), value: TwapConfigurationRawSchema }),
    v.object({ case: v.literal("ladder"), value: LadderConfigurationRawSchema }),
    v.object({ case: v.undefined(), value: v.optional(v.undefined()) }),
]);

function transformConditionalExecution(
    execution: v.InferOutput<typeof ConditionalExecutionRawSchema>,
    scales: SdkScales,
) {
    switch (execution.case) {
        case "marketIoc":
            return { type: "market_ioc" } as const;
        case "limitGtc":
            return {
                type: "limit_gtc",
                price: scaledToDecimalOutput(execution.value.priceTicks, scales.price()),
                postOnly: execution.value.postOnly,
            } as const;
        case "limitIoc":
            return {
                type: "limit_ioc",
                price: scaledToDecimalOutput(execution.value.priceTicks, scales.price()),
            } as const;
        case "limitFok":
            return {
                type: "limit_fok",
                price: scaledToDecimalOutput(execution.value.priceTicks, scales.price()),
            } as const;
        default:
            return { type: "unspecified" } as const;
    }
}

function transformTriggerConfiguration(
    configuration: v.InferOutput<typeof TriggerConfigurationRawSchema>,
    scales: SdkScales,
) {
    switch (configuration.case) {
        case "stopLoss":
        case "takeProfit":
            return {
                type:
                    configuration.case === "stopLoss"
                        ? ("stop_loss" as const)
                        : ("take_profit" as const),
                side: enumLabel(TriggerSideCodec.protoToOutput, configuration.value.side),
                triggerPrice: scaledToDecimalOutput(
                    configuration.value.triggerPriceTicks,
                    scales.price(),
                ),
                execution: transformConditionalExecution(
                    configuration.value.child?.execution ?? { case: undefined },
                    scales,
                ),
            };
        case "trailingStop":
            return {
                type: "trailing_stop" as const,
                side: enumLabel(TriggerSideCodec.protoToOutput, configuration.value.side),
                trailingDistance:
                    configuration.value.trailingDistance.case === "trailingDistanceTicks"
                        ? {
                              kind: "distance" as const,
                              distance: scaledToDecimalOutput(
                                  configuration.value.trailingDistance.value,
                                  scales.price(),
                              ),
                          }
                        : configuration.value.trailingDistance.case === "trailingDistanceBps"
                          ? {
                                kind: "bps" as const,
                                bps: configuration.value.trailingDistance.value,
                            }
                          : { kind: "unspecified" as const },
                activationPrice:
                    configuration.value.activationPriceTicks > 0n
                        ? scaledToDecimalOutput(
                              configuration.value.activationPriceTicks,
                              scales.price(),
                          )
                        : undefined,
                maxSlippage: formatMaxSlippage(configuration.value.maxSlippage, scales),
            };
        case "twap":
            return {
                type: "twap" as const,
                side: enumLabel(TriggerSideCodec.protoToOutput, configuration.value.side),
                durationMs: Number(configuration.value.durationMs),
                sliceIntervalMs: Number(configuration.value.sliceIntervalMs),
                execution:
                    configuration.value.execution.case === "marketIoc"
                        ? ({
                              type: "market_ioc",
                              maxSlippage: formatMaxSlippage(
                                  configuration.value.execution.value.maxSlippage,
                                  scales,
                              ),
                          } as const)
                        : configuration.value.execution.case === "limitGtc"
                          ? ({
                                type: "limit_gtc",
                                price: scaledToDecimalOutput(
                                    configuration.value.execution.value.priceTicks,
                                    scales.price(),
                                ),
                            } as const)
                          : ({ type: "unspecified" } as const),
            };
        case "ladder":
            return {
                type: "ladder" as const,
                side: enumLabel(TriggerSideCodec.protoToOutput, configuration.value.side),
                priceMin: scaledToDecimalOutput(configuration.value.priceMinTicks, scales.price()),
                priceMax: scaledToDecimalOutput(configuration.value.priceMaxTicks, scales.price()),
                levels: configuration.value.levels,
                postOnly: configuration.value.postOnly,
            };
        default:
            return { type: "unspecified" as const };
    }
}

function formatMaxSlippage(
    maxSlippage: v.InferOutput<typeof MaxSlippageRawSchema>,
    scales: SdkScales,
) {
    return maxSlippage.case === "maxSlippageTicks"
        ? {
              kind: "slippage" as const,
              slippage: scaledToDecimalOutput(BigInt(maxSlippage.value), scales.price()),
          }
        : maxSlippage.case === "maxSlippageBps"
          ? { kind: "bps" as const, bps: maxSlippage.value }
          : { kind: "none" as const };
}

const TerminalReasonRawSchema = v.variant("case", [
    v.object({ case: v.literal("cancelReason"), value: v.number() }),
    v.object({ case: v.literal("failureReason"), value: v.number() }),
    v.object({ case: v.undefined(), value: v.optional(v.undefined()) }),
]);

function transformTerminalReason(reason: v.InferOutput<typeof TerminalReasonRawSchema>) {
    switch (reason.case) {
        case "cancelReason":
            return {
                cancelReason: enumLabel(TriggerCancelReasonCodec.protoToOutput, reason.value),
                failureReason: undefined,
            };
        case "failureReason":
            return {
                cancelReason: undefined,
                failureReason: enumLabel(TriggerFailureReasonCodec.protoToOutput, reason.value),
            };
        default:
            return { cancelReason: undefined, failureReason: undefined };
    }
}

const StopDetailsRawSchema = v.object({
    triggerPriceTicks: v.bigint(),
    triggerPriceSource: v.number(),
    triggerDirection: v.number(),
});

const TrailingDetailsRawSchema = v.object({
    trailingDistanceTicks: v.bigint(),
    activationPriceTicks: v.bigint(),
    peakPriceTicks: v.bigint(),
    troughPriceTicks: v.bigint(),
    trailingDistanceBps: v.number(),
    maxSlippageTicks: v.number(),
    maxSlippageBps: v.number(),
    triggerPriceSource: v.number(),
    triggerDirection: v.number(),
});

const TwapDetailsRawSchema = v.object({
    twapDurationMs: v.bigint(),
    twapSliceIntervalMs: v.bigint(),
    sliceIdx: v.number(),
    sliceCount: v.number(),
    executedQtyScaled: v.bigint(),
});

const LadderDetailsRawSchema = v.object({
    ladderPriceMinTicks: v.bigint(),
    ladderPriceMaxTicks: v.bigint(),
    ladderLevels: v.number(),
    ladderDistribution: v.number(),
    executedQtyScaled: v.bigint(),
    executedLevels: v.number(),
});

const TriggerDetailsRawSchema = v.variant("case", [
    v.object({ case: v.literal("stop"), value: StopDetailsRawSchema }),
    v.object({ case: v.literal("trailing"), value: TrailingDetailsRawSchema }),
    v.object({ case: v.literal("twapState"), value: TwapDetailsRawSchema }),
    v.object({ case: v.literal("ladderState"), value: LadderDetailsRawSchema }),
    v.object({ case: v.undefined(), value: v.optional(v.undefined()) }),
]);

export type StopDetailsOutput = {
    case: "stop";
    triggerPrice: string;
    triggerPriceSource: TriggerPriceSourceLabel;
    triggerDirection: TriggerDirectionLabel;
};

export type TrailingDetailsOutput = {
    case: "trailing";
    trailingDistance: string | undefined;
    trailingDistanceBps: number;
    activationPrice: string | undefined;
    peakPrice: string | undefined;
    troughPrice: string | undefined;
    maxSlippage: string | undefined;
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
    /** Cumulative filled child-order base quantity. */
    executedQty: string;
};

export type LadderDetailsOutput = {
    case: "ladder";
    ladderPriceMin: string;
    ladderPriceMax: string;
    ladderLevels: number;
    ladderDistribution: LadderDistributionLabel;
    /** Cumulative filled child-order base quantity. */
    executedQty: string;
    /** Number of ladder levels with at least one fill. */
    executedLevels: number;
};

export type TriggerDetailsOutput =
    | StopDetailsOutput
    | TrailingDetailsOutput
    | TwapDetailsOutput
    | LadderDetailsOutput
    | { case: undefined };

function transformTriggerDetails(
    details: v.InferOutput<typeof TriggerDetailsRawSchema>,
    scales: SdkScales,
    symbolId: number,
): TriggerDetailsOutput {
    switch (details.case) {
        case "stop":
            return {
                case: "stop",
                triggerPrice: scaledToDecimalOutput(
                    details.value.triggerPriceTicks,
                    scales.price(),
                ),
                triggerPriceSource: enumLabel(
                    TriggerPriceSourceCodec.protoToOutput,
                    details.value.triggerPriceSource,
                ),
                triggerDirection: enumLabel(
                    TriggerDirectionCodec.protoToOutput,
                    details.value.triggerDirection,
                ),
            };
        case "trailing":
            return {
                case: "trailing",
                trailingDistance:
                    details.value.trailingDistanceTicks > 0n
                        ? scaledToDecimalOutput(details.value.trailingDistanceTicks, scales.price())
                        : undefined,
                trailingDistanceBps: details.value.trailingDistanceBps,
                activationPrice:
                    details.value.activationPriceTicks > 0n
                        ? scaledToDecimalOutput(details.value.activationPriceTicks, scales.price())
                        : undefined,
                peakPrice:
                    details.value.peakPriceTicks > 0n
                        ? scaledToDecimalOutput(details.value.peakPriceTicks, scales.price())
                        : undefined,
                troughPrice:
                    details.value.troughPriceTicks > 0n
                        ? scaledToDecimalOutput(details.value.troughPriceTicks, scales.price())
                        : undefined,
                maxSlippage:
                    details.value.maxSlippageTicks > 0
                        ? scaledToDecimalOutput(
                              BigInt(details.value.maxSlippageTicks),
                              scales.price(),
                          )
                        : undefined,
                maxSlippageBps: details.value.maxSlippageBps,
                triggerPriceSource: enumLabel(
                    TriggerPriceSourceCodec.protoToOutput,
                    details.value.triggerPriceSource,
                ),
                triggerDirection: enumLabel(
                    TriggerDirectionCodec.protoToOutput,
                    details.value.triggerDirection,
                ),
            };
        case "twapState":
            return {
                case: "twap",
                twapDurationMs: Number(details.value.twapDurationMs),
                twapSliceIntervalMs: Number(details.value.twapSliceIntervalMs),
                sliceIdx: details.value.sliceIdx,
                sliceCount: details.value.sliceCount,
                executedQty: scaledToDecimalOutput(
                    details.value.executedQtyScaled,
                    scales.baseQty(symbolId),
                ),
            };
        case "ladderState":
            return {
                case: "ladder",
                ladderPriceMin: scaledToDecimalOutput(
                    details.value.ladderPriceMinTicks,
                    scales.price(),
                ),
                ladderPriceMax: scaledToDecimalOutput(
                    details.value.ladderPriceMaxTicks,
                    scales.price(),
                ),
                ladderLevels: details.value.ladderLevels,
                ladderDistribution: enumLabel(
                    LadderDistributionCodec.protoToOutput,
                    details.value.ladderDistribution,
                ),
                executedQty: scaledToDecimalOutput(
                    details.value.executedQtyScaled,
                    scales.baseQty(symbolId),
                ),
                executedLevels: details.value.executedLevels,
            };
        default:
            return { case: undefined };
    }
}

/** Builds the public trigger output schema using each record's symbol ID for quantity scaling. */
export function createTriggerSchema(scales: SdkScales) {
    return v.pipe(
        v.object({
            triggerId: v.bigint(),
            subaccountId: v.bigint(),
            symbolId: v.number(),
            status: v.number(),
            parentOrderId: v.optional(v.bigint()),
            qtyScaled: v.bigint(),
            feeAsset: v.number(),
            selfTradePreventionMode: v.number(),
            configuration: TriggerConfigurationRawSchema,
            clientTriggerId: v.string(),
            createdAt: v.optional(TimestampSchema),
            updatedAt: v.optional(TimestampSchema),
            armedAt: v.optional(TimestampSchema),
            completedAt: v.optional(TimestampSchema),
            terminalReason: TerminalReasonRawSchema,
            runtimeDetails: TriggerDetailsRawSchema,
        }),
        v.transform((t) => ({
            triggerId: formatId(t.triggerId),
            subaccountId: formatId(t.subaccountId),
            symbolId: t.symbolId,
            status: enumLabel(TriggerStatusCodec.protoToOutput, t.status),
            parentOrderId: t.parentOrderId ? formatId(t.parentOrderId) : undefined,
            qty: scaledToDecimalOutput(t.qtyScaled, scales.baseQty(t.symbolId)),
            feeAsset: enumLabel(FeeAssetCodec.protoToOutput, t.feeAsset),
            selfTradePreventionMode: enumLabel(
                SelfTradePreventionModeCodec.protoToOutput,
                t.selfTradePreventionMode,
            ),
            configuration: transformTriggerConfiguration(t.configuration, scales),
            clientTriggerId: t.clientTriggerId,
            createdTs: t.createdAt ? tsObjToMs(t.createdAt) : undefined,
            updatedTs: t.updatedAt ? tsObjToMs(t.updatedAt) : undefined,
            armedTs: t.armedAt ? tsObjToMs(t.armedAt) : undefined,
            completedTs: t.completedAt ? tsObjToMs(t.completedAt) : undefined,
            ...transformTerminalReason(t.terminalReason),
            runtimeDetails: transformTriggerDetails(t.runtimeDetails, scales, t.symbolId),
        })),
    );
}

/** A normalized standalone trigger record. */
export type Trigger = v.InferOutput<ReturnType<typeof createTriggerSchema>>;

export function createTriggerEventSchema(scales: SdkScales) {
    return v.pipe(
        v.object({
            triggerId: v.bigint(),
            subaccountId: v.bigint(),
            symbolId: v.number(),
            triggerType: v.number(),
            eventType: v.number(),
            tsNs: v.bigint(),
            childSeq: v.number(),
            childOrderId: v.bigint(),
            firePriceTicks: v.optional(v.bigint()),
            terminalReason: TerminalReasonRawSchema,
        }),
        v.transform((e) => ({
            triggerId: formatId(e.triggerId),
            subaccountId: formatId(e.subaccountId),
            symbolId: e.symbolId,
            triggerType: enumLabel(TriggerTypeCodec.protoToOutput, e.triggerType),
            eventType: enumLabel(TriggerEventTypeCodec.protoToOutput, e.eventType),
            ts: tsNsToMs(e.tsNs),
            childSeq: e.childSeq,
            childOrderId: e.childOrderId > 0n ? formatId(e.childOrderId) : undefined,
            firePrice:
                e.firePriceTicks !== undefined && e.firePriceTicks > 0n
                    ? scaledToDecimalOutput(e.firePriceTicks, scales.price())
                    : undefined,
            ...transformTerminalReason(e.terminalReason),
        })),
    );
}

export type TriggerEvent = v.InferOutput<ReturnType<typeof createTriggerEventSchema>>;

export type ListTriggerEventsResult = {
    events: TriggerEvent[];
    nextPageToken: string;
};
