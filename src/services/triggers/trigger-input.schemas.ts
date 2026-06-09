import * as Proto from "../../gen/triggers/v1/triggers_pb.js";
import * as ProtoOrders from "../../gen/orders/v1/orders_pb.js";
import * as v from "valibot";
import { idInputSchema, optionalUint64DecimalFilterSchema } from "../../shared/schemas.js";
import {
    AccountScopeInputEntries,
    accountScopeToSubaccountId,
} from "../../shared/account-scope.js";
import { parsePriceTicks, parseOptionalPositiveIntLike } from "../../utils/numbers.js";
import { idToBigInt } from "../../utils/base58-id.js";
import {
    createCatalogSnapshotReader,
    type CatalogReader,
    type CatalogSnapshot,
} from "../../catalogs/index.js";
import {
    LADDER_DISTRIBUTION_VALUES,
    TRIGGER_DIRECTION_VALUES,
    TRIGGER_PRICE_SOURCE_VALUES,
    TRIGGER_STATUS_FILTER_VALUES,
    TRIGGER_TYPE_VALUES,
    TriggerTypeCodec,
    TriggerStatusCodec,
    TriggerPriceSourceCodec,
    TriggerDirectionCodec,
    LadderDistributionCodec,
} from "./triggers.codecs.js";
import {
    BpsStringOrNumberInputSchema,
    NoneInputSchema,
    PercentStringOrNumberInputSchema,
    QuoteStringInputSchema,
    TicksStringOrNumberInputSchema,
} from "../shared.js";
import {
    BaseChildOrderFieldsSchema,
    UNSET_MAX_SLIPPAGE,
    UNSET_TRAILING_DISTANCE,
    buildCreateTriggerBase,
    type MaxSlippageOneof,
    type TrailingDistanceOneof,
} from "./trigger-child-order.schemas.js";
import { parseSlippageInput, parseTrailingDistanceInput } from "../trailing-oneof-inputs.js";

const TriggerTypeSchema = v.picklist(TRIGGER_TYPE_VALUES);
const TriggerStatusFilterSchema = v.picklist(TRIGGER_STATUS_FILTER_VALUES);
const TriggerPriceSourceSchema = v.picklist(TRIGGER_PRICE_SOURCE_VALUES);
const TriggerDirectionSchema = v.picklist(TRIGGER_DIRECTION_VALUES);
const LadderDistributionSchema = v.picklist(LADDER_DISTRIBUTION_VALUES);

const TriggerIdInputSchema = idInputSchema("triggerId");

const TriggerScopedInputEntries = {
    triggerId: TriggerIdInputSchema,
    ...AccountScopeInputEntries,
};

const TriggerScopedInputSchema = v.pipe(
    v.object(TriggerScopedInputEntries),
    v.transform(({ account, ...input }) => ({
        ...input,
        subaccountId: accountScopeToSubaccountId(account),
    })),
);

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

function parseTrailingDistance(
    distance: v.InferOutput<typeof TrailingDistanceInputSchema>,
): TrailingDistanceOneof {
    return parseTrailingDistanceInput(distance, "trailingDistance");
}

function parseMaxSlippage(
    slippage: v.InferOutput<typeof MaxSlippageInputSchema> | undefined,
): MaxSlippageOneof {
    return parseSlippageInput(slippage, {
        fieldName: "maxSlippage",
        ticksCase: "maxSlippageTicks",
        bpsCase: "maxSlippageBps",
    });
}

function stopTriggerInputSchema(
    reader: CatalogReader,
    triggerType: "stop_loss" | "take_profit",
    protoTriggerType: Proto.TriggerType,
    buyDirection: ProtoOrders.TriggerDirection,
    sellDirection: ProtoOrders.TriggerDirection,
) {
    return v.pipe(
        v.object({
            ...BaseChildOrderFieldsSchema.entries,

            triggerType: v.literal(triggerType),

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
        v.transform((input) => ({
            ...buildCreateTriggerBase(reader, input),
            triggerType: protoTriggerType,
            triggerPriceTicks: input.triggerPrice,
            triggerPriceSource:
                input.triggerPriceSource ?? ProtoOrders.TriggerPriceSource.LAST_PRICE,
            triggerDirection: input.side === ProtoOrders.Side.BUY ? buyDirection : sellDirection,
        })),
    );
}

function createStopLossTriggerInputSchema(reader: CatalogReader) {
    return stopTriggerInputSchema(
        reader,
        "stop_loss",
        Proto.TriggerType.STOP_LOSS,
        ProtoOrders.TriggerDirection.ABOVE,
        ProtoOrders.TriggerDirection.BELOW,
    );
}

function createTakeProfitTriggerInputSchema(reader: CatalogReader) {
    return stopTriggerInputSchema(
        reader,
        "take_profit",
        Proto.TriggerType.TAKE_PROFIT,
        ProtoOrders.TriggerDirection.BELOW,
        ProtoOrders.TriggerDirection.ABOVE,
    );
}

function createTrailingStopTriggerInputSchema(reader: CatalogReader) {
    return v.pipe(
        v.object({
            ...BaseChildOrderFieldsSchema.entries,

            triggerType: v.literal("trailing_stop"),
            trailingDistance: v.pipe(
                TrailingDistanceInputSchema,
                v.transform(parseTrailingDistance),
            ),

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
            ...buildCreateTriggerBase(reader, input),
            triggerType: Proto.TriggerType.TRAILING_STOP,
            trailingDistance: input.trailingDistance,
            activationPriceTicks: input.activationPrice ?? 0n,
            maxSlippage: input.maxSlippage ?? UNSET_MAX_SLIPPAGE,
            triggerPriceSource:
                input.triggerPriceSource ?? ProtoOrders.TriggerPriceSource.LAST_PRICE,
            triggerDirection: input.triggerDirection ?? ProtoOrders.TriggerDirection.ABOVE,
        })),
    );
}

function createTwapTriggerInputSchema(reader: CatalogReader) {
    return v.pipe(
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
            ...buildCreateTriggerBase(reader, input),
            triggerType: Proto.TriggerType.TWAP,
            triggerPriceSource: ProtoOrders.TriggerPriceSource.LAST_PRICE,
            triggerDirection: ProtoOrders.TriggerDirection.ABOVE,
            twapDurationMs: input.twapDurationMs,
            twapSliceIntervalMs: input.twapSliceIntervalMs,
            maxSlippage: input.maxSlippage,
        })),
    );
}

function createLadderTriggerInputSchema(reader: CatalogReader) {
    return v.pipe(
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
            ...buildCreateTriggerBase(reader, input),
            triggerType: Proto.TriggerType.LADDER,
            triggerPriceSource: ProtoOrders.TriggerPriceSource.LAST_PRICE,
            triggerDirection: ProtoOrders.TriggerDirection.ABOVE,
            ladderPriceMinTicks: input.ladderPriceMin,
            ladderPriceMaxTicks: input.ladderPriceMax,
            ladderLevels: input.ladderLevels,
            ladderDistribution: input.ladderDistribution,
        })),
    );
}

export function createCreateTriggerInputSchema(catalog: CatalogSnapshot) {
    return createCreateTriggerInputSchemaForReader(createCatalogSnapshotReader(catalog));
}

export function createCreateTriggerInputSchemaForReader(reader: CatalogReader) {
    return v.variant("triggerType", [
        createStopLossTriggerInputSchema(reader),
        createTakeProfitTriggerInputSchema(reader),
        createTrailingStopTriggerInputSchema(reader),
        createTwapTriggerInputSchema(reader),
        createLadderTriggerInputSchema(reader),
    ]);
}

export type CreateTriggerInput = v.InferInput<ReturnType<typeof createCreateTriggerInputSchema>>;

export const ListTriggersInputSchema = v.pipe(
    v.object({
        ...AccountScopeInputEntries,
        parentOrderId: v.pipe(
            v.optional(v.pipe(v.string(), v.trim())),
            v.transform((v) => (v ? idToBigInt(v, "parentOrderId") : undefined)),
        ),
        symbol: v.optional(v.pipe(v.string(), v.trim())),
        status: v.pipe(
            v.optional(v.array(TriggerStatusFilterSchema)),
            v.transform((arr) => arr?.map((s) => TriggerStatusCodec.inputToProto[s]) ?? []),
        ),
        triggerType: v.pipe(
            v.optional(TriggerTypeSchema),
            v.transform((v) =>
                v ? TriggerTypeCodec.inputToProto[v] : Proto.TriggerType.TRIGGER_TYPE_UNSPECIFIED,
            ),
        ),
        limit: v.optional(v.pipe(v.number(), v.integer(), v.gtValue(0), v.maxValue(1000)), 50),
        offset: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0)), 0),
    }),
    v.transform(({ account, ...input }) => ({
        ...input,
        subaccountId: accountScopeToSubaccountId(account),
    })),
);

export type ListTriggersInput = v.InferInput<typeof ListTriggersInputSchema>;

export const CancelTriggerInputSchema = TriggerScopedInputSchema;

export type CancelTriggerInput = v.InferInput<typeof CancelTriggerInputSchema>;

export const GetTriggerInputSchema = CancelTriggerInputSchema;

export type GetTriggerInput = v.InferInput<typeof GetTriggerInputSchema>;

export const ModifyTriggerInputSchema = v.pipe(
    v.object({
        ...TriggerScopedInputEntries,
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
    v.transform(({ account, ...input }) => ({
        triggerId: input.triggerId,
        subaccountId: accountScopeToSubaccountId(account),
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
        ...TriggerScopedInputEntries,
        limit: v.optional(v.pipe(v.number(), v.integer(), v.gtValue(0), v.maxValue(1000))),
        beforeTsNs: optionalUint64DecimalFilterSchema("beforeTsNs"),
    }),
    v.transform(({ account, ...input }) => ({
        ...input,
        subaccountId: accountScopeToSubaccountId(account),
    })),
);

export type ListTriggerEventsInput = v.InferInput<typeof ListTriggerEventsInputSchema>;
