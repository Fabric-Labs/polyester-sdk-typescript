import * as Proto from "../../gen/triggers/v1/triggers_pb.js";
import * as ProtoOrders from "../../gen/orders/v1/orders_pb.js";
import * as v from "valibot";
import { idInputSchema } from "../../shared/schemas.js";
import {
    AccountScopeInputEntries,
    accountScopeToSubaccountId,
} from "../../shared/account-scope.js";
import { positiveDecimalInputToScaled, type SdkScales } from "../../shared/decimal-surface.js";
import { PROTOBUF_INT32_MAX, PROTOBUF_INT64_MAX } from "../../shared/wire-bounds.js";
import {
    parseOptionalPositiveBigIntLike,
    parseOptionalPositiveIntLike,
} from "../../utils/numbers.js";
import { idToBigInt } from "../../utils/base58-id.js";
import {
    TRIGGER_EVENT_TYPE_VALUES,
    TRIGGER_STATUS_FILTER_VALUES,
    TRIGGER_TYPE_VALUES,
    TriggerEventTypeCodec,
    TriggerSideCodec,
    TriggerTypeCodec,
    TriggerStatusCodec,
} from "./triggers.codecs.js";
import { BpsStringOrNumberInputSchema, NoneInputSchema, SymbolIdInputSchema } from "../shared.js";
import {
    BaseTriggerFieldsSchema,
    ConditionalExecutionInputSchema,
    DecimalInputStringSchema,
    LimitConditionalExecutionInputSchema,
    TriggerSideInputSchema,
    TwapExecutionInputSchema,
    buildConditionalExecution,
    buildTriggerIntentBase,
    buildTwapExecution,
    type MaxSlippageOneof,
    type TrailingDistanceOneof,
} from "./trigger-child-order.schemas.js";
import { parseSlippageInput, parseTrailingDistanceInput } from "../trailing-oneof-inputs.js";

const TriggerTypeSchema = v.picklist(TRIGGER_TYPE_VALUES);
const TriggerStatusFilterSchema = v.picklist(TRIGGER_STATUS_FILTER_VALUES);
const TriggerEventTypeSchema = v.picklist(TRIGGER_EVENT_TYPE_VALUES);
const TriggerIdInputSchema = idInputSchema("triggerId");

const TriggerScopedInputEntries = {
    triggerId: TriggerIdInputSchema,
    ...AccountScopeInputEntries,
};

const TriggerScopedInputSchema = v.pipe(
    v.strictObject(TriggerScopedInputEntries),
    v.transform(({ account, ...input }) => ({
        ...input,
        subaccountId: accountScopeToSubaccountId(account),
    })),
);

/** Absolute price distance, as a decimal price string (e.g. "0.50"). */
const PriceDistanceInputSchema = v.strictObject({
    kind: v.literal("distance"),
    distance: DecimalInputStringSchema,
});

/** Absolute price slippage, as a decimal price string (e.g. "0.25"). */
const PriceSlippageInputSchema = v.strictObject({
    kind: v.literal("slippage"),
    slippage: DecimalInputStringSchema,
});

const TrailingDistanceInputSchema = v.union([
    PriceDistanceInputSchema,
    BpsStringOrNumberInputSchema,
]);

const MaxSlippageInputSchema = v.union([
    PriceSlippageInputSchema,
    BpsStringOrNumberInputSchema,
    NoneInputSchema,
]);

const MaxSlippagePatchInputSchema = v.union([
    PriceSlippageInputSchema,
    BpsStringOrNumberInputSchema,
    NoneInputSchema,
]);

const ActivationPricePatchInputSchema = v.union([DecimalInputStringSchema, NoneInputSchema]);

function parseTrailingDistance(
    scales: SdkScales,
    distance: v.InferOutput<typeof TrailingDistanceInputSchema>,
): TrailingDistanceOneof {
    return parseTrailingDistanceInput(scales, distance, "trailingDistance");
}

function parseTwapMilliseconds(
    value: string | number,
    fieldName: "durationMs" | "sliceIntervalMs",
    minimum: bigint,
): bigint {
    const parsed = parseOptionalPositiveBigIntLike(value);
    if (parsed === undefined || parsed < minimum || parsed > PROTOBUF_INT64_MAX) {
        throw new Error(
            `${fieldName} must be between ${minimum} and ${PROTOBUF_INT64_MAX} milliseconds`,
        );
    }
    return parsed;
}

function parseMaxSlippage(
    scales: SdkScales,
    slippage: v.InferOutput<typeof MaxSlippageInputSchema> | undefined,
): MaxSlippageOneof {
    return parseSlippageInput(scales, slippage, {
        fieldName: "maxSlippage",
        ticksCase: "maxSlippageTicks",
        bpsCase: "maxSlippageBps",
        maxBps: Number(PROTOBUF_INT32_MAX),
    });
}

function parseMaxSlippagePatch(
    scales: SdkScales,
    slippage: v.InferOutput<typeof MaxSlippagePatchInputSchema>,
): MaxSlippageOneof {
    if (slippage.kind === "none") {
        return { case: "maxSlippageTicks", value: 0 };
    }
    return parseMaxSlippage(scales, slippage);
}

function createConditionalTriggerInputSchema<const TriggerType extends "stop_loss" | "take_profit">(
    scales: SdkScales,
    triggerType: TriggerType,
) {
    const sharedEntries = {
        ...BaseTriggerFieldsSchema.entries,
        triggerType: v.literal(triggerType),
        triggerPrice: DecimalInputStringSchema,
    };

    const sellInputSchema = v.strictObject({
        ...sharedEntries,
        side: v.literal("sell"),
        execution: ConditionalExecutionInputSchema,
    });
    const buyInputSchema = v.strictObject({
        ...sharedEntries,
        side: v.literal("buy"),
        execution: LimitConditionalExecutionInputSchema,
    });

    function transformInput(
        input: v.InferOutput<typeof sellInputSchema> | v.InferOutput<typeof buyInputSchema>,
    ) {
        const { subaccountId, intent } = buildTriggerIntentBase(input, scales);
        const strategy = {
            triggerPriceTicks: positiveDecimalInputToScaled(
                "triggerPrice",
                input.triggerPrice,
                scales.price(),
            ),
            side: TriggerSideCodec.inputToProto[input.side],
            child: buildConditionalExecution(input.execution, scales),
        };
        return {
            subaccountId,
            trigger: {
                ...intent,
                strategy:
                    triggerType === "stop_loss"
                        ? ({ case: "stopLoss", value: strategy } as const)
                        : ({ case: "takeProfit", value: strategy } as const),
            },
        };
    }

    return [
        v.pipe(
            sellInputSchema,
            v.check(
                (input) => input.feeAsset === ProtoOrders.FeeAsset.QUOTE,
                "SELL triggers must use the quote fee asset",
            ),
            v.transform((input: v.InferOutput<typeof sellInputSchema>) => transformInput(input)),
        ),
        v.pipe(
            buyInputSchema,
            v.transform((input: v.InferOutput<typeof buyInputSchema>) => transformInput(input)),
        ),
    ] as const;
}

function createTrailingStopTriggerInputSchema(scales: SdkScales) {
    return v.pipe(
        v.strictObject({
            ...BaseTriggerFieldsSchema.entries,
            triggerType: v.literal("trailing_stop"),
            trailingDistance: TrailingDistanceInputSchema,
            activationPrice: v.optional(DecimalInputStringSchema),
            maxSlippage: v.optional(MaxSlippageInputSchema),
        }),
        v.check(
            (input) => input.feeAsset === ProtoOrders.FeeAsset.QUOTE,
            "Trailing-stop triggers must use the quote fee asset",
        ),
        v.transform((input) => {
            const { subaccountId, intent } = buildTriggerIntentBase(input, scales);
            return {
                subaccountId,
                trigger: {
                    ...intent,
                    strategy: {
                        case: "trailingStop",
                        value: {
                            trailingDistance: parseTrailingDistance(scales, input.trailingDistance),
                            activationPriceTicks:
                                input.activationPrice === undefined
                                    ? 0n
                                    : positiveDecimalInputToScaled(
                                          "activationPrice",
                                          input.activationPrice,
                                          scales.price(),
                                      ),
                            maxSlippage: parseMaxSlippage(scales, input.maxSlippage),
                            side: ProtoOrders.Side.SELL,
                        },
                    } as const,
                },
            };
        }),
    );
}

function createTwapTriggerInputSchema(scales: SdkScales) {
    return v.pipe(
        v.strictObject({
            ...BaseTriggerFieldsSchema.entries,
            triggerType: v.literal("twap"),
            side: TriggerSideInputSchema,
            durationMs: v.pipe(
                v.union([v.pipe(v.string(), v.trim()), v.number()]),
                v.transform((value) => parseTwapMilliseconds(value, "durationMs", 1_000n)),
            ),
            sliceIntervalMs: v.pipe(
                v.union([v.pipe(v.string(), v.trim()), v.number()]),
                v.transform((value) => parseTwapMilliseconds(value, "sliceIntervalMs", 100n)),
            ),
            execution: TwapExecutionInputSchema,
        }),
        v.check(
            (input) =>
                input.side !== ProtoOrders.Side.SELL ||
                input.feeAsset === ProtoOrders.FeeAsset.QUOTE,
            "SELL triggers must use the quote fee asset",
        ),
        v.check(
            (input) => input.sliceIntervalMs <= input.durationMs,
            "sliceIntervalMs cannot exceed durationMs",
        ),
        v.transform((input) => {
            const { subaccountId, intent } = buildTriggerIntentBase(input, scales);
            return {
                subaccountId,
                trigger: {
                    ...intent,
                    strategy: {
                        case: "twap",
                        value: {
                            side: input.side,
                            durationMs: input.durationMs,
                            sliceIntervalMs: input.sliceIntervalMs,
                            execution: buildTwapExecution(input.execution, scales),
                        },
                    } as const,
                },
            };
        }),
    );
}

function createLadderTriggerInputSchema(scales: SdkScales) {
    return v.pipe(
        v.strictObject({
            ...BaseTriggerFieldsSchema.entries,
            triggerType: v.literal("ladder"),
            side: TriggerSideInputSchema,
            priceMin: DecimalInputStringSchema,
            priceMax: DecimalInputStringSchema,
            levels: v.pipe(
                v.union([v.pipe(v.string(), v.trim()), v.pipe(v.number(), v.integer())]),
                v.transform((value) => {
                    const levels = parseOptionalPositiveIntLike(value);
                    if (!levels || levels < 2 || levels > 100) {
                        throw new Error("levels must be between 2 and 100");
                    }
                    return levels;
                }),
            ),
            postOnly: v.optional(v.boolean(), false),
        }),
        v.check(
            (input) =>
                input.side !== ProtoOrders.Side.SELL ||
                input.feeAsset === ProtoOrders.FeeAsset.QUOTE,
            "SELL triggers must use the quote fee asset",
        ),
        v.transform((input) => {
            const { subaccountId, intent } = buildTriggerIntentBase(input, scales);
            return {
                subaccountId,
                trigger: {
                    ...intent,
                    strategy: {
                        case: "ladder",
                        value: {
                            side: input.side,
                            priceMinTicks: positiveDecimalInputToScaled(
                                "priceMin",
                                input.priceMin,
                                scales.price(),
                            ),
                            priceMaxTicks: positiveDecimalInputToScaled(
                                "priceMax",
                                input.priceMax,
                                scales.price(),
                            ),
                            levels: input.levels,
                            postOnly: input.postOnly,
                        },
                    } as const,
                },
            };
        }),
        v.check(
            (output) =>
                output.trigger.strategy.value.priceMinTicks <
                output.trigger.strategy.value.priceMaxTicks,
            "priceMin must be less than priceMax",
        ),
    );
}

/** Builds the create-trigger boundary schema using catalog scales keyed by symbol ID. */
export function createCreateTriggerInputSchema(scales: SdkScales) {
    return v.union([
        ...createConditionalTriggerInputSchema(scales, "stop_loss"),
        ...createConditionalTriggerInputSchema(scales, "take_profit"),
        createTrailingStopTriggerInputSchema(scales),
        createTwapTriggerInputSchema(scales),
        createLadderTriggerInputSchema(scales),
    ]);
}

/** Public input for creating a standalone trigger. */
export type CreateTriggerInput = v.InferInput<ReturnType<typeof createCreateTriggerInputSchema>>;

/** Public filters for listing triggers in an account scope. */
export const ListTriggersInputSchema = v.pipe(
    v.strictObject({
        ...AccountScopeInputEntries,
        parentOrderId: v.pipe(
            v.optional(v.pipe(v.string(), v.trim())),
            v.transform((value) => (value ? idToBigInt(value, "parentOrderId") : undefined)),
        ),
        symbolId: v.optional(SymbolIdInputSchema),
        status: v.pipe(
            v.optional(v.array(TriggerStatusFilterSchema)),
            v.transform(
                (values) => values?.map((value) => TriggerStatusCodec.inputToProto[value]) ?? [],
            ),
        ),
        triggerType: v.pipe(
            v.optional(TriggerTypeSchema),
            v.transform((value) =>
                value
                    ? TriggerTypeCodec.inputToProto[value]
                    : Proto.TriggerType.TRIGGER_TYPE_UNSPECIFIED,
            ),
        ),
        limit: v.optional(v.pipe(v.number(), v.integer(), v.gtValue(0), v.maxValue(1000)), 50),
        pageToken: v.optional(v.pipe(v.string(), v.trim()), ""),
    }),
    v.transform(({ account, ...input }) => ({
        ...input,
        subaccountId: accountScopeToSubaccountId(account),
    })),
);

/** Public filters for listing triggers. */
export type ListTriggersInput = v.InferInput<typeof ListTriggersInputSchema>;

export const CancelTriggerInputSchema = TriggerScopedInputSchema;
export type CancelTriggerInput = v.InferInput<typeof CancelTriggerInputSchema>;

export const GetTriggerInputSchema = CancelTriggerInputSchema;
export type GetTriggerInput = v.InferInput<typeof GetTriggerInputSchema>;

export const PauseTriggerInputSchema = TriggerScopedInputSchema;
export type PauseTriggerInput = v.InferInput<typeof PauseTriggerInputSchema>;

export const ResumeTriggerInputSchema = v.pipe(
    v.strictObject({
        ...TriggerScopedInputEntries,
        symbolId: SymbolIdInputSchema,
    }),
    v.transform(({ account, ...input }) => ({
        ...input,
        subaccountId: accountScopeToSubaccountId(account),
    })),
);
export type ResumeTriggerInput = v.InferInput<typeof ResumeTriggerInputSchema>;

export function createModifyTriggerInputSchema(scales: SdkScales) {
    return v.pipe(
        v.strictObject({
            ...TriggerScopedInputEntries,
            symbolId: SymbolIdInputSchema,
            triggerPrice: v.optional(DecimalInputStringSchema),
            limitPrice: v.optional(DecimalInputStringSchema),
            trailingDistance: v.optional(TrailingDistanceInputSchema),
            activationPrice: v.optional(ActivationPricePatchInputSchema),
            maxSlippage: v.optional(MaxSlippagePatchInputSchema),
        }),
        v.check(
            (input) =>
                input.triggerPrice !== undefined ||
                input.limitPrice !== undefined ||
                input.trailingDistance !== undefined ||
                input.activationPrice !== undefined ||
                input.maxSlippage !== undefined,
            "At least one patch field is required",
        ),
        v.transform(({ account, ...input }) => ({
            triggerId: input.triggerId,
            subaccountId: accountScopeToSubaccountId(account),
            symbolId: input.symbolId,
            triggerPriceTicks:
                input.triggerPrice === undefined
                    ? undefined
                    : positiveDecimalInputToScaled(
                          "triggerPrice",
                          input.triggerPrice,
                          scales.price(),
                      ),
            limitPriceTicks:
                input.limitPrice === undefined
                    ? undefined
                    : positiveDecimalInputToScaled("limitPrice", input.limitPrice, scales.price()),
            trailingDistance:
                input.trailingDistance === undefined
                    ? ({ case: undefined, value: undefined } as const)
                    : parseTrailingDistance(scales, input.trailingDistance),
            activationPriceTicks:
                input.activationPrice === undefined
                    ? undefined
                    : typeof input.activationPrice !== "string"
                      ? 0n
                      : positiveDecimalInputToScaled(
                            "activationPrice",
                            input.activationPrice,
                            scales.price(),
                        ),
            maxSlippage:
                input.maxSlippage === undefined
                    ? ({ case: undefined, value: undefined } as const)
                    : parseMaxSlippagePatch(scales, input.maxSlippage),
        })),
    );
}

/**
 * A trigger patch. Omitted fields remain unchanged; `{ kind: "none" }` clears
 * `activationPrice` or `maxSlippage`.
 */
export type ModifyTriggerInput = v.InferInput<ReturnType<typeof createModifyTriggerInputSchema>>;

export const ListTriggerEventsInputSchema = v.pipe(
    v.strictObject({
        ...TriggerScopedInputEntries,
        limit: v.optional(v.pipe(v.number(), v.integer(), v.gtValue(0), v.maxValue(1000))),
        eventType: v.optional(TriggerEventTypeSchema),
        pageToken: v.optional(v.pipe(v.string(), v.trim()), ""),
    }),
    v.transform(({ account, ...input }) => ({
        ...input,
        subaccountId: accountScopeToSubaccountId(account),
        eventType:
            input.eventType === undefined
                ? undefined
                : TriggerEventTypeCodec.inputToProto[input.eventType],
    })),
);

export type ListTriggerEventsInput = v.InferInput<typeof ListTriggerEventsInputSchema>;
