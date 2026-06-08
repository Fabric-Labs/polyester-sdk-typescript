import * as Proto from "../../gen/triggers/v1/triggers_pb.js";
import * as ProtoOrders from "../../gen/orders/v1/orders_pb.js";
import * as v from "valibot";
import { TimestampSchema, PublicIdSchema, TimestampNsMsSchema } from "../../shared/schemas.js";
import { requiredEnumLabel } from "../../shared/proto-enum-codec.js";
import { tsNsToMs } from "../../utils/time.js";
import { formatId } from "../../utils/base58-id.js";
import {
    createCatalogSnapshotReader,
    type CatalogReader,
    type CatalogSnapshot,
} from "../../catalogs/index.js";
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
    details: v.InferOutput<typeof TriggerDetailsRawSchema>,
    symbolId: number,
    reader: CatalogReader,
): TriggerDetailsOutput {
    switch (details.case) {
        case "stop":
            return {
                case: "stop",
                triggerPrice: reader.orders.formatPrice(details.value.triggerPriceTicks, symbolId),
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
                trailingDistancePrice:
                    details.value.trailingDistanceTicks > 0n
                        ? reader.orders.formatPrice(details.value.trailingDistanceTicks, symbolId)
                        : undefined,
                trailingDistanceBps: details.value.trailingDistanceBps,
                activationPrice:
                    details.value.activationPriceTicks > 0n
                        ? reader.orders.formatPrice(details.value.activationPriceTicks, symbolId)
                        : undefined,
                peakPrice:
                    details.value.peakPriceTicks > 0n
                        ? reader.orders.formatPrice(details.value.peakPriceTicks, symbolId)
                        : undefined,
                troughPrice:
                    details.value.troughPriceTicks > 0n
                        ? reader.orders.formatPrice(details.value.troughPriceTicks, symbolId)
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
                executedQty: reader.orders.formatQuantity(
                    details.value.executedQtyScaled,
                    symbolId,
                ),
            };
        case "ladder":
            return {
                case: "ladder",
                ladderPriceMin: reader.orders.formatPrice(
                    details.value.ladderPriceMinTicks,
                    symbolId,
                ),
                ladderPriceMax: reader.orders.formatPrice(
                    details.value.ladderPriceMaxTicks,
                    symbolId,
                ),
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

export function createTriggerSchema(catalog: CatalogSnapshot) {
    return createTriggerSchemaForReader(createCatalogSnapshotReader(catalog));
}

export function createTriggerSchemaForReader(reader: CatalogReader) {
    return v.pipe(
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
        v.transform((t) => {
            const pair = reader.market.requirePairBySymbolId(t.symbolId);
            return {
                triggerId: formatId(t.triggerId),
                subaccountId: formatId(t.subaccountId),
                symbolId: t.symbolId,
                symbol: pair.symbol,
                baseAsset: pair.baseAsset,
                quoteAsset: pair.quoteAsset,
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
                side: requiredEnumLabel(
                    TriggerSideCodec.protoToOutput,
                    t.side,
                    "TriggerSchema",
                    "side",
                ),
                isBuy: t.side === ProtoOrders.Side.BUY,
                orderType: requiredEnumLabel(
                    OrderTypeCodec.protoToOutput,
                    t.orderType,
                    "TriggerSchema",
                    "order type",
                ),
                tif: requiredEnumLabel(
                    TifCodec.protoToOutput,
                    t.tif,
                    "TriggerSchema",
                    "time in force",
                ),
                qty: reader.orders.formatQuantity(t.qtyScaled, t.symbolId),
                limitPrice:
                    t.limitPriceTicks > 0n
                        ? reader.orders.formatPrice(t.limitPriceTicks, t.symbolId)
                        : undefined,
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
                completedTs: t.completedAt?.seconds
                    ? Number(t.completedAt.seconds) * 1000
                    : undefined,
                childOrderIds: t.childOrderIds?.map((id) => formatId(id)) ?? [],
                details: t.details
                    ? transformTriggerDetails(t.details, t.symbolId, reader)
                    : undefined,
            };
        }),
    );
}

export type Trigger = v.InferOutput<ReturnType<typeof createTriggerSchema>>;

export function createTriggerEventSchema(catalog: CatalogSnapshot) {
    return createTriggerEventSchemaForReader(createCatalogSnapshotReader(catalog));
}

export function createTriggerEventSchemaForReader(reader: CatalogReader) {
    return v.pipe(
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
        v.transform((e) => {
            const pair = reader.market.requirePairBySymbolId(e.symbolId);
            return {
                triggerId: formatId(e.triggerId),
                subaccountId: formatId(e.subaccountId),
                symbolId: e.symbolId,
                symbol: pair.symbol,
                baseAsset: pair.baseAsset,
                quoteAsset: pair.quoteAsset,
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
                firePrice:
                    e.firePxTicks > 0n
                        ? reader.orders.formatPrice(e.firePxTicks, e.symbolId)
                        : undefined,
                reason: e.reason || undefined,
            };
        }),
    );
}

export type TriggerEvent = v.InferOutput<ReturnType<typeof createTriggerEventSchema>>;

export type ListTriggerEventsResult = {
    events: TriggerEvent[];
    nextBeforeTsNs: number;
};
