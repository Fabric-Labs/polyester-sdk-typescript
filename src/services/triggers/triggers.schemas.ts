import * as Proto from "../../gen/triggers/v1/triggers_pb.js";
import * as ProtoOrders from "../../gen/orders/v1/orders_pb.js";
import * as v from "valibot";
import {
    TimestampSchema,
    PublicIdSchema,
    TimestampNsMsSchema,
    idInputSchema,
    optionalSubAccountIdInputSchema,
} from "../../shared/schemas.js";
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
import {
    BpsStringOrNumberInputSchema,
    NoneInputSchema,
    PercentStringOrNumberInputSchema,
    QuoteStringInputSchema,
    TicksStringOrNumberInputSchema,
} from "../shared.js";

const TriggerTypeSchema = v.picklist([
    "stop_loss",
    "take_profit",
    "trailing_stop",
    "twap",
    "ladder",
]);

const TriggerStatusFilterSchema = v.picklist([
    "created",
    "armed",
    "running",
    "completed",
    "cancelled",
    "failed",
    "paused",
]);

const OrderTypeSchema = v.picklist(["limit", "market"]);
const TIFSchema = v.picklist(["gtc", "ioc", "fok"]);
const FeeSourceSchema = v.picklist(["quote", "received"]);
const STPSchema = v.picklist(["expire_taker", "expire_maker", "expire_both"]);
const TriggerPriceSourceSchema = v.picklist(["last", "index", "mark"]);
const TriggerDirectionSchema = v.picklist(["above", "below"]);
const LadderDistributionSchema = v.picklist(["linear"]);

const TriggerIdInputSchema = idInputSchema("triggerId");

const TriggerScopedInputSchema = v.object({
    triggerId: TriggerIdInputSchema,
    subAccountId: optionalSubAccountIdInputSchema(),
});

function transformTriggerScopedInput(input: v.InferOutput<typeof TriggerScopedInputSchema>) {
    return {
        triggerId: input.triggerId,
        subaccountId: input.subAccountId,
    };
}

const TrailingDistanceInputSchema = v.union([
    TicksStringOrNumberInputSchema,
    BpsStringOrNumberInputSchema,
    PercentStringOrNumberInputSchema,
    QuoteStringInputSchema,
]);

const MaxSlippageInputSchema = v.union([
    TicksStringOrNumberInputSchema,
    BpsStringOrNumberInputSchema,
    PercentStringOrNumberInputSchema,
    QuoteStringInputSchema,
    NoneInputSchema,
]);

type TrailingDistanceOneof = Proto.CreateTriggerRequest["trailingDistance"];
type MaxSlippageOneof = Proto.CreateTriggerRequest["maxSlippage"];

function parseTrailingDistance(
    distance: v.InferOutput<typeof TrailingDistanceInputSchema>,
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
    slippage: v.InferOutput<typeof MaxSlippageInputSchema> | undefined,
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

const SideInputSchema = v.picklist(["buy", "sell"]);

const BaseChildOrderFieldsSchema = v.object({
    subAccountId: v.pipe(
        v.optional(v.pipe(v.string(), v.trim())),
        v.transform((v) => (v ? idToBigInt(v, "subaccountId") : 0n)),
    ),
    symbol: v.pipe(v.string(), v.trim(), v.minLength(1)),
    clientTriggerId: v.optional(v.optional(v.pipe(v.string(), v.trim())), () =>
        crypto.randomUUID(),
    ),
    side: v.pipe(
        SideInputSchema,
        v.transform((v) => TriggerSideCodec.inputToProto[v]),
    ),
    orderType: v.pipe(
        OrderTypeSchema,
        v.transform((v) => OrderTypeCodec.inputToProto[v]),
    ),
    tif: v.pipe(
        TIFSchema,
        v.transform((v) => TifCodec.inputToProto[v]),
    ),
    qty: v.pipe(v.string(), v.trim(), v.minLength(1)),
    limitPrice: v.optional(v.pipe(v.string(), v.trim())),
    feeSource: v.pipe(
        v.optional(FeeSourceSchema),
        v.transform((v) => (v ? FeeSourceCodec.inputToProto[v] : ProtoOrders.FeeSource.QUOTE)),
    ),
    stpMode: v.pipe(
        v.optional(STPSchema),
        v.transform((v) => (v ? StpModeCodec.inputToProto[v] : ProtoOrders.STPMode.EXPIRE_MAKER)),
    ),
    postOnly: v.optional(v.optional(v.boolean()), false),
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

const StopLossTriggerInputSchema = v.pipe(
    v.object({
        ...BaseChildOrderFieldsSchema.entries,

        triggerType: v.literal("stop_loss"),

        triggerPrice: v.pipe(
            v.string(),
            v.trim(),
            v.minLength(1),
            v.transform((v) => parsePriceTicks(v, "triggerPrice")),
        ),

        triggerPriceSource: v.pipe(
            v.optional(TriggerPriceSourceSchema),
            v.transform((v) =>
                v
                    ? TriggerPriceSourceCodec.inputToProto[v]
                    : ProtoOrders.TriggerPriceSource.LAST_PRICE,
            ),
        ),
    }),
    v.transform((input) => {
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
    }),
);

const TakeProfitTriggerInputSchema = v.pipe(
    v.object({
        ...BaseChildOrderFieldsSchema.entries,

        triggerType: v.literal("take_profit"),

        triggerPrice: v.pipe(
            v.string(),
            v.trim(),
            v.minLength(1),
            v.transform((v) => parsePriceTicks(v, "triggerPrice")),
        ),

        triggerPriceSource: v.pipe(
            v.optional(TriggerPriceSourceSchema),
            v.transform((v) =>
                v
                    ? TriggerPriceSourceCodec.inputToProto[v]
                    : ProtoOrders.TriggerPriceSource.LAST_PRICE,
            ),
        ),
    }),
    v.transform((input) => {
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
    }),
);

const TrailingStopTriggerInputSchema = v.pipe(
    v.object({
        ...BaseChildOrderFieldsSchema.entries,

        triggerType: v.literal("trailing_stop"),
        trailingDistance: v.pipe(TrailingDistanceInputSchema, v.transform(parseTrailingDistance)),

        activationPrice: v.pipe(
            v.optional(v.pipe(v.string(), v.trim())),
            v.transform((v) => (v ? parsePriceTicks(v, "activationPrice") : 0n)),
        ),

        maxSlippage: v.pipe(v.optional(MaxSlippageInputSchema), v.transform(parseMaxSlippage)),

        triggerPriceSource: v.pipe(
            v.optional(TriggerPriceSourceSchema),
            v.transform((v) =>
                v
                    ? TriggerPriceSourceCodec.inputToProto[v]
                    : ProtoOrders.TriggerPriceSource.LAST_PRICE,
            ),
        ),

        triggerDirection: v.pipe(
            v.optional(TriggerDirectionSchema),
            v.transform((v) =>
                v ? TriggerDirectionCodec.inputToProto[v] : ProtoOrders.TriggerDirection.ABOVE,
            ),
        ),
    }),
    v.transform((input) => ({
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
    })),
);

const TwapTriggerInputSchema = v.pipe(
    v.object({
        ...BaseChildOrderFieldsSchema.entries,

        triggerType: v.literal("twap"),

        twapDurationMs: v.pipe(
            v.union([v.pipe(v.string(), v.trim()), v.number()]),
            v.transform((v) => {
                const durationMs = parseOptionalPositiveIntLike(v);
                if (!durationMs || durationMs < 1000) {
                    throw new Error("twapDurationMs must be at least 1000ms");
                }
                return BigInt(durationMs);
            }),
        ),

        twapSliceIntervalMs: v.pipe(
            v.union([v.pipe(v.string(), v.trim()), v.number()]),
            v.transform((v) => {
                const sliceIntervalMs = parseOptionalPositiveIntLike(v);
                if (!sliceIntervalMs || sliceIntervalMs < 100) {
                    throw new Error("twapSliceIntervalMs must be at least 100ms");
                }
                return BigInt(sliceIntervalMs);
            }),
        ),

        maxSlippage: v.pipe(v.optional(MaxSlippageInputSchema), v.transform(parseMaxSlippage)),
    }),
    v.check(
        (data) => data.twapSliceIntervalMs <= data.twapDurationMs,
        "twapSliceIntervalMs cannot exceed twapDurationMs",
    ),
    v.transform((input) => ({
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
    })),
);

const LadderTriggerInputSchema = v.pipe(
    v.object({
        ...BaseChildOrderFieldsSchema.entries,

        triggerType: v.literal("ladder"),

        ladderPriceMin: v.pipe(
            v.string(),
            v.trim(),
            v.minLength(1),
            v.transform((v) => parsePriceTicks(v, "ladderPriceMin")),
        ),

        ladderPriceMax: v.pipe(
            v.string(),
            v.trim(),
            v.minLength(1),
            v.transform((v) => parsePriceTicks(v, "ladderPriceMax")),
        ),

        ladderLevels: v.pipe(
            v.union([v.pipe(v.string(), v.trim()), v.pipe(v.number(), v.integer())]),
            v.transform((v) => {
                const levels = parseOptionalPositiveIntLike(v);
                if (!levels || levels < 2 || levels > 100) {
                    throw new Error("ladderLevels must be between 2 and 100");
                }
                return levels;
            }),
        ),

        ladderDistribution: v.pipe(
            v.optional(LadderDistributionSchema),
            v.transform((v) =>
                v ? LadderDistributionCodec.inputToProto[v] : Proto.LadderDistribution.LINEAR,
            ),
        ),
    }),
    v.transform((input) => ({
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
    })),
);

export const CreateTriggerInputSchema = v.variant("triggerType", [
    StopLossTriggerInputSchema,
    TakeProfitTriggerInputSchema,
    TrailingStopTriggerInputSchema,
    TwapTriggerInputSchema,
    LadderTriggerInputSchema,
]);

export type CreateTriggerInput = v.InferInput<typeof CreateTriggerInputSchema>;

export const ListTriggersInputSchema = v.pipe(
    v.object({
        subAccountId: optionalSubAccountIdInputSchema(),
        parentOrderId: v.pipe(
            v.optional(v.pipe(v.string(), v.trim())),
            v.transform((v) => (v ? idToBigInt(v, "parentOrderId") : undefined)),
        ),
        symbol: v.optional(v.pipe(v.string(), v.trim())),
        status: v.pipe(
            v.optional(v.array(TriggerStatusFilterSchema)),
            v.transform((arr) => arr?.map((s) => TriggerStatusCodec.filterToProto[s]) ?? []),
        ),
        triggerType: v.pipe(
            v.optional(TriggerTypeSchema),
            v.transform((v) =>
                v ? TriggerTypeCodec.inputToProto[v] : Proto.TriggerType.TRIGGER_TYPE_UNSPECIFIED,
            ),
        ),
        limit: v.optional(
            v.optional(v.pipe(v.number(), v.integer(), v.gtValue(0), v.maxValue(1000))),
            50,
        ),
        offset: v.optional(v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))), 0),
    }),
    v.transform(({ subAccountId, ...rest }) => ({
        ...rest,
        subaccountId: subAccountId,
    })),
);

export type ListTriggersInput = v.InferInput<typeof ListTriggersInputSchema>;

export const CancelTriggerInputSchema = v.pipe(
    TriggerScopedInputSchema,
    v.transform(transformTriggerScopedInput),
);

export type CancelTriggerInput = v.InferInput<typeof CancelTriggerInputSchema>;

export const GetTriggerInputSchema = CancelTriggerInputSchema;

export type GetTriggerInput = v.InferInput<typeof GetTriggerInputSchema>;

export const ModifyTriggerInputSchema = v.pipe(
    v.object({
        ...TriggerScopedInputSchema.entries,
        triggerPrice: v.pipe(
            v.optional(v.pipe(v.string(), v.trim())),
            v.transform((v) => (v ? parsePriceTicks(v, "triggerPrice") : undefined)),
        ),
        limitPrice: v.pipe(
            v.optional(v.pipe(v.string(), v.trim())),
            v.transform((v) => (v ? parsePriceTicks(v, "limitPrice") : undefined)),
        ),
        trailingDistance: v.pipe(
            v.optional(TrailingDistanceInputSchema),
            v.transform((v) => (v ? parseTrailingDistance(v) : undefined)),
        ),
        activationPrice: v.pipe(
            v.optional(v.pipe(v.string(), v.trim())),
            v.transform((v) => (v ? parsePriceTicks(v, "activationPrice") : undefined)),
        ),
        maxSlippage: v.pipe(
            v.optional(MaxSlippageInputSchema),
            v.transform((v) => (v ? parseMaxSlippage(v) : undefined)),
        ),
    }),
    v.check((input) => {
        const hasPatch =
            input.triggerPrice !== undefined ||
            input.limitPrice !== undefined ||
            input.trailingDistance !== undefined ||
            input.activationPrice !== undefined ||
            input.maxSlippage !== undefined;
        return hasPatch;
    }, "At least one patch field is required"),
    v.transform(({ subAccountId, ...input }) => ({
        triggerId: input.triggerId,
        subaccountId: subAccountId,
        triggerPriceTicks: input.triggerPrice,
        limitPriceTicks: input.limitPrice,
        trailingDistance: input.trailingDistance ?? UNSET_TRAILING_DISTANCE,
        activationPriceTicks: input.activationPrice,
        maxSlippage: input.maxSlippage ?? UNSET_MAX_SLIPPAGE,
    })),
);

export type ModifyTriggerInput = v.InferInput<typeof ModifyTriggerInputSchema>;

export const PauseTriggerInputSchema = CancelTriggerInputSchema;

export type PauseTriggerInput = v.InferInput<typeof PauseTriggerInputSchema>;
export type ResumeTriggerInput = v.InferInput<typeof PauseTriggerInputSchema>;

export const ListTriggerEventsInputSchema = v.pipe(
    v.object({
        ...TriggerScopedInputSchema.entries,
        limit: v.optional(v.pipe(v.number(), v.integer(), v.gtValue(0), v.maxValue(1000))),
        beforeTsNs: v.optional(v.pipe(v.string(), v.trim())),
    }),
    v.transform(({ subAccountId, ...rest }) => ({
        ...rest,
        subaccountId: subAccountId,
    })),
);

export type ListTriggerEventsInput = v.InferInput<typeof ListTriggerEventsInputSchema>;

type TriggerPriceSourceLabel = "last" | "index" | "mark";

type TriggerDirectionLabel = "above" | "below";

type LadderDistributionLabel = "linear" | "geometric" | "weighted_favorable";

const TriggerResultStatusSchema = v.pipe(
    v.enum(Proto.TriggerStatus),
    v.transform((status) => TriggerStatusCodec.protoToLabel[status]),
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

export type ListTriggerEventsResult = {
    events: TriggerEvent[];
    nextBeforeTsNs: number;
};

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
    })),
);

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
    v.transform((e) => {
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
    }),
);

export type TriggerEvent = v.InferOutput<typeof TriggerEventSchema>;
