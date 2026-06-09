import * as Proto from "../../gen/triggers/v1/triggers_pb.js";
import * as ProtoOrders from "../../gen/orders/v1/orders_pb.js";
import * as v from "valibot";
import { TimestampSchema, PublicIdSchema, TimestampNsMsSchema } from "../../shared/schemas.js";
import { requiredEnumLabel } from "../../shared/proto-enum-codec.js";
import { tsNsToMs } from "../../utils/time.js";
import { formatId } from "../../utils/base58-id.js";
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

type TriggerPriceSourceLabel = "last" | "index" | "mark";

type TriggerDirectionLabel = "above" | "below";

type LadderDistributionLabel = "linear" | "geometric" | "weighted_favorable";

const TriggerResultStatusSchema = v.pipe(
    v.enum(Proto.TriggerStatus),
    v.transform((status) =>
        requiredEnumLabel(
            TriggerStatusCodec.protoToOutput,
            status,
            "TriggerResultSchema",
            "status",
        ),
    ),
);

const TriggerResultBaseSchema = v.object({
    triggerId: PublicIdSchema,
    status: TriggerResultStatusSchema,
    tsNs: TimestampNsMsSchema,
});

export const CreateTriggerResultSchema = v.object({
    ...TriggerResultBaseSchema.entries,
    clientTriggerId: v.string(),
});

export type CreateTriggerResult = v.InferOutput<typeof CreateTriggerResultSchema>;

export const CancelTriggerResultSchema = TriggerResultBaseSchema;

export type CancelTriggerResult = v.InferOutput<typeof CancelTriggerResultSchema>;

export const ModifyTriggerResultSchema = TriggerResultBaseSchema;

export type ModifyTriggerResult = v.InferOutput<typeof ModifyTriggerResultSchema>;

export const PauseTriggerResultSchema = TriggerResultBaseSchema;

export type PauseTriggerResult = v.InferOutput<typeof PauseTriggerResultSchema>;
export type ResumeTriggerResult = v.InferOutput<typeof PauseTriggerResultSchema>;

const StopDetailsRawSchema = v.object({
    triggerPriceTicks: v.bigint(),
    triggerPriceSource: v.enum(ProtoOrders.TriggerPriceSource),
    triggerDirection: v.enum(ProtoOrders.TriggerDirection),
});

const TrailingDetailsRawSchema = v.object({
    trailingDistanceTicks: v.bigint(),
    activationPriceTicks: v.bigint(),
    peakPriceTicks: v.bigint(),
    troughPriceTicks: v.bigint(),
    trailingDistanceBps: v.number(),
    maxSlippageTicks: v.number(),
    maxSlippageBps: v.number(),
    triggerPriceSource: v.enum(ProtoOrders.TriggerPriceSource),
    triggerDirection: v.enum(ProtoOrders.TriggerDirection),
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
    ladderDistribution: v.enum(Proto.LadderDistribution),
});

const TriggerDetailsRawSchema = v.variant("case", [
    v.object({ case: v.literal("stop"), value: StopDetailsRawSchema }),
    v.object({ case: v.literal("trailing"), value: TrailingDetailsRawSchema }),
    v.object({ case: v.literal("twap"), value: TwapDetailsRawSchema }),
    v.object({ case: v.literal("ladder"), value: LadderDetailsRawSchema }),
    v.object({ case: v.undefined(), value: v.optional(v.undefined()) }),
]);

export type StopDetailsOutput = {
    case: "stop";
    triggerPriceTicks: string;
    triggerPriceSource: TriggerPriceSourceLabel;
    triggerDirection: TriggerDirectionLabel;
};

export type TrailingDetailsOutput = {
    case: "trailing";
    trailingDistanceTicks: string | undefined;
    trailingDistanceBps: number;
    activationPriceTicks: string | undefined;
    peakPriceTicks: string | undefined;
    troughPriceTicks: string | undefined;
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
    executedQtyScaled: string;
};

export type LadderDetailsOutput = {
    case: "ladder";
    ladderPriceMinTicks: string;
    ladderPriceMaxTicks: string;
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
    details: v.InferOutput<typeof TriggerDetailsRawSchema>,
): TriggerDetailsOutput {
    switch (details.case) {
        case "stop":
            return {
                case: "stop",
                triggerPriceTicks: details.value.triggerPriceTicks.toString(),
                triggerPriceSource: requiredEnumLabel(
                    TriggerPriceSourceCodec.protoToOutput,
                    details.value.triggerPriceSource,
                    "TriggerDetailsSchema",
                    "trigger price source",
                ),
                triggerDirection: requiredEnumLabel(
                    TriggerDirectionCodec.protoToOutput,
                    details.value.triggerDirection,
                    "TriggerDetailsSchema",
                    "trigger direction",
                ),
            };
        case "trailing":
            return {
                case: "trailing",
                trailingDistanceTicks:
                    details.value.trailingDistanceTicks > 0n
                        ? details.value.trailingDistanceTicks.toString()
                        : undefined,
                trailingDistanceBps: details.value.trailingDistanceBps,
                activationPriceTicks:
                    details.value.activationPriceTicks > 0n
                        ? details.value.activationPriceTicks.toString()
                        : undefined,
                peakPriceTicks:
                    details.value.peakPriceTicks > 0n
                        ? details.value.peakPriceTicks.toString()
                        : undefined,
                troughPriceTicks:
                    details.value.troughPriceTicks > 0n
                        ? details.value.troughPriceTicks.toString()
                        : undefined,
                maxSlippageTicks: details.value.maxSlippageTicks,
                maxSlippageBps: details.value.maxSlippageBps,
                triggerPriceSource: requiredEnumLabel(
                    TriggerPriceSourceCodec.protoToOutput,
                    details.value.triggerPriceSource,
                    "TriggerDetailsSchema",
                    "trigger price source",
                ),
                triggerDirection: requiredEnumLabel(
                    TriggerDirectionCodec.protoToOutput,
                    details.value.triggerDirection,
                    "TriggerDetailsSchema",
                    "trigger direction",
                ),
            };
        case "twap":
            return {
                case: "twap",
                twapDurationMs: Number(details.value.twapDurationMs),
                twapSliceIntervalMs: Number(details.value.twapSliceIntervalMs),
                sliceIdx: details.value.sliceIdx,
                sliceCount: details.value.sliceCount,
                executedQtyScaled: details.value.executedQtyScaled.toString(),
            };
        case "ladder":
            return {
                case: "ladder",
                ladderPriceMinTicks: details.value.ladderPriceMinTicks.toString(),
                ladderPriceMaxTicks: details.value.ladderPriceMaxTicks.toString(),
                ladderLevels: details.value.ladderLevels,
                ladderDistribution: requiredEnumLabel(
                    LadderDistributionCodec.protoToOutput,
                    details.value.ladderDistribution,
                    "TriggerDetailsSchema",
                    "ladder distribution",
                ),
            };
        default:
            return { case: undefined };
    }
}

export const TriggerSchema = v.pipe(
    v.object({
        triggerId: v.bigint(),
        subaccountId: v.bigint(),
        symbolId: v.number(),
        symbol: v.string(),
        triggerType: v.enum(Proto.TriggerType),
        status: v.enum(Proto.TriggerStatus),
        parentOrderId: v.optional(v.bigint()),
        side: v.enum(ProtoOrders.Side),
        orderType: v.enum(ProtoOrders.OrderType),
        tif: v.enum(ProtoOrders.TIF),
        qtyScaled: v.bigint(),
        limitPriceTicks: v.bigint(),
        feeSource: v.enum(ProtoOrders.FeeSource),
        stpMode: v.enum(ProtoOrders.STPMode),
        postOnly: v.boolean(),
        clientTriggerId: v.string(),
        createdAt: v.optional(TimestampSchema),
        updatedAt: v.optional(TimestampSchema),
        armedAt: v.optional(TimestampSchema),
        completedAt: v.optional(TimestampSchema),
        childOrderIds: v.optional(v.array(v.bigint())),
        details: v.optional(TriggerDetailsRawSchema),
    }),
    v.transform((t) => ({
        triggerId: formatId(t.triggerId),
        subaccountId: formatId(t.subaccountId),
        symbolId: t.symbolId,
        symbol: t.symbol,
        triggerType: requiredEnumLabel(
            TriggerTypeCodec.protoToOutput,
            t.triggerType,
            "TriggerSchema",
            "trigger type",
        ),
        status: requiredEnumLabel(
            TriggerStatusCodec.protoToOutput,
            t.status,
            "TriggerSchema",
            "status",
        ),
        parentOrderId: t.parentOrderId ? formatId(t.parentOrderId) : undefined,
        side: requiredEnumLabel(TriggerSideCodec.protoToOutput, t.side, "TriggerSchema", "side"),
        isBuy: t.side === ProtoOrders.Side.BUY,
        orderType: requiredEnumLabel(
            OrderTypeCodec.protoToOutput,
            t.orderType,
            "TriggerSchema",
            "order type",
        ),
        tif: requiredEnumLabel(TifCodec.protoToOutput, t.tif, "TriggerSchema", "time in force"),
        qtyScaled: t.qtyScaled.toString(),
        limitPriceTicks: t.limitPriceTicks > 0n ? t.limitPriceTicks.toString() : undefined,
        feeSource: requiredEnumLabel(
            FeeSourceCodec.protoToOutput,
            t.feeSource,
            "TriggerSchema",
            "fee source",
        ),
        stpMode: requiredEnumLabel(
            StpModeCodec.protoToOutput,
            t.stpMode,
            "TriggerSchema",
            "STP mode",
        ),
        postOnly: t.postOnly,
        clientTriggerId: t.clientTriggerId,
        createdTs: t.createdAt?.seconds ? Number(t.createdAt.seconds) * 1000 : undefined,
        updatedTs: t.updatedAt?.seconds ? Number(t.updatedAt.seconds) * 1000 : undefined,
        armedTs: t.armedAt?.seconds ? Number(t.armedAt.seconds) * 1000 : undefined,
        completedTs: t.completedAt?.seconds ? Number(t.completedAt.seconds) * 1000 : undefined,
        childOrderIds: t.childOrderIds?.map((id) => formatId(id)) ?? [],
        details: t.details ? transformTriggerDetails(t.details) : undefined,
    })),
);

export function createTriggerSchema() {
    return TriggerSchema;
}

export type Trigger = v.InferOutput<typeof TriggerSchema>;

export const TriggerEventSchema = v.pipe(
    v.object({
        triggerId: v.bigint(),
        subaccountId: v.bigint(),
        symbolId: v.number(),
        triggerType: v.enum(Proto.TriggerType),
        eventType: v.enum(Proto.TriggerEventType),
        tsNs: v.bigint(),
        childSeq: v.number(),
        childOrderId: v.bigint(),
        firePxTicks: v.bigint(),
        reason: v.string(),
    }),
    v.transform((e) => ({
        triggerId: formatId(e.triggerId),
        subaccountId: formatId(e.subaccountId),
        symbolId: e.symbolId,
        triggerType: requiredEnumLabel(
            TriggerTypeCodec.protoToOutput,
            e.triggerType,
            "TriggerEventSchema",
            "trigger type",
        ),
        eventType: requiredEnumLabel(
            TriggerEventTypeCodec.protoToOutput,
            e.eventType,
            "TriggerEventSchema",
            "event type",
        ),
        ts: tsNsToMs(e.tsNs),
        childSeq: e.childSeq,
        childOrderId: e.childOrderId > 0n ? formatId(e.childOrderId) : undefined,
        firePriceTicks: e.firePxTicks > 0n ? e.firePxTicks.toString() : undefined,
        reason: e.reason || undefined,
    })),
);

export function createTriggerEventSchema() {
    return TriggerEventSchema;
}

export type TriggerEvent = v.InferOutput<typeof TriggerEventSchema>;

export type ListTriggerEventsResult = {
    events: TriggerEvent[];
    nextBeforeTsNs: number;
};
