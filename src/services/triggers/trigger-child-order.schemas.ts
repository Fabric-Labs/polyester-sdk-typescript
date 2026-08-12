import * as Proto from "../../gen/triggers/v1/triggers_pb.js";
import * as v from "valibot";
import { create } from "@bufbuild/protobuf";
import {
    AccountScopeInputEntries,
    accountScopeToSubaccountId,
} from "../../shared/account-scope.js";
import { positiveDecimalInputToScaled, type SdkScales } from "../../shared/decimal-surface.js";
import {
    FEE_ASSET_VALUES,
    FeeAssetCodec,
    SELF_TRADE_PREVENTION_MODE_VALUES,
    SelfTradePreventionModeCodec,
    TRIGGER_SIDE_VALUES,
    TriggerSideCodec,
} from "./triggers.codecs.js";

const FeeAssetSchema = v.picklist(FEE_ASSET_VALUES);
const SelfTradePreventionModeSchema = v.picklist(SELF_TRADE_PREVENTION_MODE_VALUES);
const SideInputSchema = v.picklist(TRIGGER_SIDE_VALUES);
export const DecimalInputStringSchema = v.pipe(v.string(), v.trim(), v.minLength(1));

export type TrailingDistanceOneof = Proto.ModifyTriggerRequest["trailingDistance"];
export type MaxSlippageOneof = Proto.ModifyTriggerRequest["maxSlippage"];

export const BaseTriggerFieldsSchema = v.object({
    ...AccountScopeInputEntries,
    symbol: v.pipe(v.string(), v.trim(), v.minLength(1)),
    clientTriggerId: v.optional(v.pipe(v.string(), v.trim()), () => crypto.randomUUID()),
    qty: DecimalInputStringSchema,
    feeAsset: v.pipe(
        v.optional(FeeAssetSchema, "quote"),
        v.transform((value) => FeeAssetCodec.inputToProto[value]),
    ),
    selfTradePreventionMode: v.pipe(
        v.optional(SelfTradePreventionModeSchema, "expire_maker"),
        v.transform((value) => SelfTradePreventionModeCodec.inputToProto[value]),
    ),
});

export const TriggerSideInputSchema = v.pipe(
    SideInputSchema,
    v.transform((value) => TriggerSideCodec.inputToProto[value]),
);

export const MarketIocConditionalExecutionInputSchema = v.strictObject({
    type: v.literal("market_ioc"),
});

export const LimitConditionalExecutionInputSchema = v.variant("type", [
    v.strictObject({
        type: v.literal("limit_gtc"),
        price: DecimalInputStringSchema,
        postOnly: v.optional(v.boolean(), false),
    }),
    v.strictObject({
        type: v.literal("limit_ioc"),
        price: DecimalInputStringSchema,
    }),
    v.strictObject({
        type: v.literal("limit_fok"),
        price: DecimalInputStringSchema,
    }),
]);

export const ConditionalExecutionInputSchema = v.variant("type", [
    MarketIocConditionalExecutionInputSchema,
    ...LimitConditionalExecutionInputSchema.options,
]);

export const TwapExecutionInputSchema = v.variant("type", [
    v.strictObject({ type: v.literal("market_ioc") }),
    v.strictObject({
        type: v.literal("limit_gtc"),
        price: DecimalInputStringSchema,
    }),
]);

type BaseTriggerInput = v.InferOutput<typeof BaseTriggerFieldsSchema>;
type ConditionalExecutionInput = v.InferOutput<typeof ConditionalExecutionInputSchema>;
type TwapExecutionInput = v.InferOutput<typeof TwapExecutionInputSchema>;

export function buildTriggerIntentBase(input: BaseTriggerInput, scales: SdkScales) {
    return {
        subaccountId: accountScopeToSubaccountId(input.account),
        intent: {
            symbol: input.symbol,
            qtyScaled: positiveDecimalInputToScaled("qty", input.qty, scales.baseQty(input.symbol)),
            feeAsset: input.feeAsset,
            selfTradePreventionMode: input.selfTradePreventionMode,
            clientTriggerId: input.clientTriggerId ?? crypto.randomUUID(),
        },
    };
}

export function buildConditionalExecution(input: ConditionalExecutionInput, scales: SdkScales) {
    switch (input.type) {
        case "market_ioc":
            return {
                execution: {
                    case: "marketIoc",
                    value: create(Proto.TriggerMarketIocSchema),
                },
            } as const;
        case "limit_gtc":
            return {
                execution: {
                    case: "limitGtc",
                    value: create(Proto.TriggerLimitGtcSchema, {
                        priceTicks: positiveDecimalInputToScaled(
                            "execution.price",
                            input.price,
                            scales.price(),
                        ),
                        postOnly: input.postOnly,
                    }),
                },
            } as const;
        case "limit_ioc":
            return {
                execution: {
                    case: "limitIoc",
                    value: create(Proto.TriggerLimitIocSchema, {
                        priceTicks: positiveDecimalInputToScaled(
                            "execution.price",
                            input.price,
                            scales.price(),
                        ),
                    }),
                },
            } as const;
        case "limit_fok":
            return {
                execution: {
                    case: "limitFok",
                    value: create(Proto.TriggerLimitFokSchema, {
                        priceTicks: positiveDecimalInputToScaled(
                            "execution.price",
                            input.price,
                            scales.price(),
                        ),
                    }),
                },
            } as const;
    }
}

export function buildTwapExecution(input: TwapExecutionInput, scales: SdkScales) {
    return input.type === "market_ioc"
        ? ({
              case: "marketIoc",
              value: create(Proto.TwapMarketIocSchema),
          } as const)
        : ({
              case: "limitGtc",
              value: create(Proto.TwapLimitGtcSchema, {
                  priceTicks: positiveDecimalInputToScaled(
                      "execution.price",
                      input.price,
                      scales.price(),
                  ),
              }),
          } as const);
}
