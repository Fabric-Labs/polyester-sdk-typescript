import * as ProtoWrite from "../../gen/orders/v1/orders_pb.js";
import { create } from "@bufbuild/protobuf";
import * as v from "valibot";
import { SideSchema, SymbolIdInputSchema } from "../shared.js";
import { tsNsToMs } from "../../utils/time.js";
import {
    OptionalPublicIdSchema,
    OptionalTimestampMsSchema,
    PublicIdSchema,
    TimestampMsSchema,
    optionalIdInputSchema,
    optionalUint64DecimalFilterSchema,
} from "../../shared/schemas.js";
import {
    positiveDecimalInputToScaled,
    scaledToDecimalOutput,
    type SdkScales,
} from "../../shared/decimal-surface.js";
import {
    AccountScopeInputEntries,
    accountScopeToSubaccountId,
} from "../../shared/account-scope.js";
import {
    FEE_ASSET_VALUES,
    ORDER_STATUS_FILTER_VALUES,
    OrderSideCodec,
    OrderStatusFilterCodec,
    SELF_TRADE_PREVENTION_MODE_VALUES,
    FeeAssetCodec,
    SelfTradePreventionModeCodec,
} from "./orders.codecs.js";
import {
    MarketMaxSlippageSchema,
    createRiskPolicyInputSchema,
    parseMarketMaxSlippage,
} from "./orders-risk.schemas.js";
import {
    ClientOrderIdInputSchema,
    OptionalClientOrderIdInputSchema,
    OrderIdInputSchema,
    OrderRequestIdInputSchema,
} from "./orders-identifiers.schemas.js";
import { OrderErrorDetailSchema } from "./order-errors.schemas.js";

const OrderStatusSchema = v.picklist(ORDER_STATUS_FILTER_VALUES);
const FeeAssetSchema = v.picklist(FEE_ASSET_VALUES);
const SelfTradePreventionModeSchema = v.picklist(SELF_TRADE_PREVENTION_MODE_VALUES);

const BaseOrdersFilterInputEntries = {
    ...AccountScopeInputEntries,
    symbolId: v.optional(v.array(SymbolIdInputSchema)),
    triggerId: optionalIdInputSchema("triggerId"),
    side: v.pipe(
        v.optional(SideSchema),
        v.transform((v) => (v ? OrderSideCodec.inputToProto[v] : undefined)),
    ),
    limit: v.optional(v.number()),
    pageToken: v.optional(v.pipe(v.string(), v.trim())),
};

export const BaseOrdersFilterInputSchema = v.pipe(
    v.strictObject(BaseOrdersFilterInputEntries),
    v.transform(({ account, ...input }) => ({
        ...input,
        subaccountId: accountScopeToSubaccountId(account),
    })),
);

export const OpenOrdersInputSchema = v.pipe(
    v.strictObject({
        ...BaseOrdersFilterInputEntries,

        includeAttachedRisk: v.optional(v.boolean(), true),
        includeAttachedRiskState: v.optional(v.boolean(), false),
    }),
    v.transform(({ account, ...input }) => ({
        ...input,
        subaccountId: accountScopeToSubaccountId(account),
    })),
);

export type OpenOrdersInput = v.InferInput<typeof OpenOrdersInputSchema>;

export const OrderHistoryInputSchema = v.pipe(
    v.strictObject({
        ...BaseOrdersFilterInputEntries,
        includeAttachedRisk: v.optional(v.boolean(), true),
        includeAttachedRiskState: v.optional(v.boolean(), false),
        status: v.pipe(
            v.optional(OrderStatusSchema),
            v.transform((v) => (v ? OrderStatusFilterCodec.inputToProto[v] : undefined)),
        ),
        startTsNs: optionalUint64DecimalFilterSchema("startTsNs"),
        endTsNs: optionalUint64DecimalFilterSchema("endTsNs"),
    }),
    v.transform(({ account, ...input }) => ({
        ...input,
        subaccountId: accountScopeToSubaccountId(account),
    })),
);

export type OrderHistoryInput = v.InferInput<typeof OrderHistoryInputSchema>;

const DecimalInputStringSchema = v.pipe(v.string(), v.trim(), v.minLength(1));

function createOrderIntentBaseEntries(scales: SdkScales) {
    return {
        symbolId: SymbolIdInputSchema,
        side: v.pipe(
            SideSchema,
            v.transform((v) => OrderSideCodec.inputToProto[v]),
        ),
        execution: createOrderExecutionInputSchema(scales),
        clientOrderId: OptionalClientOrderIdInputSchema,
        feeAsset: v.pipe(
            v.optional(FeeAssetSchema),
            v.transform((v) => (v ? FeeAssetCodec.inputToProto[v] : undefined)),
        ),
        selfTradePreventionMode: v.pipe(
            v.optional(SelfTradePreventionModeSchema),
            v.transform((v) => (v ? SelfTradePreventionModeCodec.inputToProto[v] : undefined)),
        ),
        risk: createRiskPolicyInputSchema(scales),
    };
}

type ParsedOrderIntentInput = v.InferOutput<ReturnType<typeof createOrderIntentInputObjectSchema>>;

function createOrderIntentInputObjectSchema(scales: SdkScales) {
    const baseEntries = createOrderIntentBaseEntries(scales);
    return v.pipe(
        v.union([
            v.strictObject({
                ...baseEntries,
                qty: DecimalInputStringSchema,
                maxQuoteDebit: v.optional(v.never()),
            }),
            v.strictObject({
                ...baseEntries,
                qty: v.optional(v.never()),
                maxQuoteDebit: DecimalInputStringSchema,
            }),
        ]),
        v.check(
            (input) =>
                input.maxQuoteDebit === undefined ||
                (input.side === ProtoWrite.Side.BUY &&
                    (input.execution.case === "marketIoc" || input.execution.case === "limitIoc")),
            "maxQuoteDebit is supported only for BUY market IOC and BUY limit IOC orders",
        ),
        v.check(
            (input) =>
                input.side !== ProtoWrite.Side.SELL ||
                input.feeAsset === undefined ||
                input.feeAsset === ProtoWrite.FeeAsset.QUOTE,
            "SELL orders must use the quote fee asset",
        ),
    );
}

function createScopedOrderIntentInputObjectSchema(scales: SdkScales) {
    const baseEntries = {
        ...AccountScopeInputEntries,
        ...createOrderIntentBaseEntries(scales),
    };
    return v.pipe(
        v.union([
            v.strictObject({
                ...baseEntries,
                qty: DecimalInputStringSchema,
                maxQuoteDebit: v.optional(v.never()),
            }),
            v.strictObject({
                ...baseEntries,
                qty: v.optional(v.never()),
                maxQuoteDebit: DecimalInputStringSchema,
            }),
        ]),
        v.check(
            (input) =>
                input.maxQuoteDebit === undefined ||
                (input.side === ProtoWrite.Side.BUY &&
                    (input.execution.case === "marketIoc" || input.execution.case === "limitIoc")),
            "maxQuoteDebit is supported only for BUY market IOC and BUY limit IOC orders",
        ),
        v.check(
            (input) =>
                input.side !== ProtoWrite.Side.SELL ||
                input.feeAsset === undefined ||
                input.feeAsset === ProtoWrite.FeeAsset.QUOTE,
            "SELL orders must use the quote fee asset",
        ),
    );
}

function toOrderIntent(input: ParsedOrderIntentInput, scales: SdkScales) {
    const { risk, qty, maxQuoteDebit, ...intent } = input;
    const sizing =
        qty !== undefined
            ? ({
                  case: "baseQtyScaled",
                  value: positiveDecimalInputToScaled("qty", qty, scales.baseQty(intent.symbolId)),
              } as const)
            : ({
                  case: "maxQuoteDebitScaled",
                  value: positiveDecimalInputToScaled(
                      "maxQuoteDebit",
                      maxQuoteDebit,
                      scales.quoteAmount(intent.symbolId),
                  ),
              } as const);
    return {
        ...intent,
        sizing,
        feeAsset: intent.feeAsset ?? ProtoWrite.FeeAsset.QUOTE,
        attachedRisk: risk,
    };
}

export function createOrderIntentInputSchema(scales: SdkScales) {
    return v.pipe(
        createOrderIntentInputObjectSchema(scales),
        v.transform((input) => toOrderIntent(input, scales)),
    );
}

export type OrderIntentInput = v.InferInput<ReturnType<typeof createOrderIntentInputSchema>>;

function createOrderExecutionInputSchema(scales: SdkScales) {
    const priceToTicks = (fieldName: string, price: string) =>
        positiveDecimalInputToScaled(fieldName, price, scales.price());

    return v.variant("type", [
        v.pipe(
            v.strictObject({
                type: v.literal("market_ioc"),
                maxSlippage: v.optional(MarketMaxSlippageSchema),
                clientRefPrice: v.optional(DecimalInputStringSchema),
            }),
            v.transform(({ maxSlippage, clientRefPrice }) => ({
                case: "marketIoc" as const,
                value: create(ProtoWrite.MarketIocSchema, {
                    maxSlippage: parseMarketMaxSlippage(scales, maxSlippage),
                    clientRefPriceTicks:
                        clientRefPrice === undefined
                            ? 0n
                            : priceToTicks("execution.clientRefPrice", clientRefPrice),
                }),
            })),
        ),
        v.pipe(
            v.strictObject({
                type: v.literal("limit_gtc"),
                price: DecimalInputStringSchema,
                postOnly: v.optional(v.boolean(), false),
            }),
            v.transform(({ price, postOnly }) => ({
                case: "limitGtc" as const,
                value: create(ProtoWrite.LimitGtcSchema, {
                    priceTicks: priceToTicks("execution.price", price),
                    postOnly,
                }),
            })),
        ),
        v.pipe(
            v.strictObject({
                type: v.literal("limit_ioc"),
                price: DecimalInputStringSchema,
            }),
            v.transform(({ price }) => ({
                case: "limitIoc" as const,
                value: create(ProtoWrite.LimitIocSchema, {
                    priceTicks: priceToTicks("execution.price", price),
                }),
            })),
        ),
        v.pipe(
            v.strictObject({
                type: v.literal("limit_fok"),
                price: DecimalInputStringSchema,
            }),
            v.transform(({ price }) => ({
                case: "limitFok" as const,
                value: create(ProtoWrite.LimitFokSchema, {
                    priceTicks: priceToTicks("execution.price", price),
                }),
            })),
        ),
    ]);
}

export function createNewOrderInputSchema(scales: SdkScales) {
    return v.pipe(
        createScopedOrderIntentInputObjectSchema(scales),
        v.transform(({ account, ...input }) => {
            return {
                subaccountId: accountScopeToSubaccountId(account),
                order: toOrderIntent(input, scales),
            };
        }),
    );
}

export type NewOrderInput = v.InferInput<ReturnType<typeof createNewOrderInputSchema>>;

const CancelOrderScopeInputEntries = {
    symbolId: v.optional(SymbolIdInputSchema),
    ...AccountScopeInputEntries,
};

export const CancelOrderInputSchema = v.pipe(
    v.union([
        v.strictObject({
            ...CancelOrderScopeInputEntries,
            orderId: OrderIdInputSchema,
            clientOrderId: v.optional(v.never()),
        }),
        v.strictObject({
            ...CancelOrderScopeInputEntries,
            orderId: v.optional(v.never()),
            clientOrderId: ClientOrderIdInputSchema,
        }),
    ]),
    v.transform(({ orderId, clientOrderId, account, ...rest }) => {
        const key =
            orderId !== undefined
                ? ({ case: "orderId", value: orderId } as const)
                : ({ case: "clientOrderId", value: clientOrderId } as const);
        return {
            ...rest,
            subaccountId: accountScopeToSubaccountId(account),
            key,
        };
    }),
);

export type CancelOrderInput = v.InferInput<typeof CancelOrderInputSchema>;

export const CancelOrderResultSchema = v.pipe(
    v.object({
        status: v.string(),
        orderId: PublicIdSchema,
        tsNs: v.bigint(),
    }),
    v.transform(({ tsNs, ...result }) => ({
        ...result,
        ts: tsNsToMs(tsNs),
        tsNs: tsNs.toString(),
    })),
);

export type CancelOrderResult = v.InferOutput<typeof CancelOrderResultSchema>;

export const CancelAllOrdersInputSchema = v.pipe(
    v.strictObject({
        ...AccountScopeInputEntries,
        symbolId: v.optional(SymbolIdInputSchema),
        side: v.pipe(
            v.optional(SideSchema),
            v.transform((v) => (v ? OrderSideCodec.inputToProto[v] : undefined)),
        ),
        dryRun: v.optional(v.boolean(), false),
        requestId: v.optional(OrderRequestIdInputSchema),
    }),
    v.transform(({ account, ...input }) => ({
        ...input,
        subaccountId: accountScopeToSubaccountId(account),
    })),
);

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

export const GetOrderDetailsInputSchema = v.pipe(
    v.strictObject({
        orderId: v.optional(OrderIdInputSchema),
        clientOrderId: v.optional(ClientOrderIdInputSchema),
        ...AccountScopeInputEntries,
        includeAttachedRisk: v.optional(v.boolean(), true),
        includeAttachedRiskState: v.optional(v.boolean(), true),
    }),
    v.check((input) => {
        const hasOrderId = input.orderId !== undefined;
        const hasClientOrderId = input.clientOrderId !== undefined;
        return hasOrderId !== hasClientOrderId;
    }, "Provide exactly one of orderId or clientOrderId"),
    v.transform(({ account, orderId, clientOrderId, ...rest }) => {
        const key =
            orderId !== undefined
                ? ({ case: "orderId", value: orderId } as const)
                : ({ case: "clientOrderId", value: clientOrderId ?? "" } as const);
        return {
            ...rest,
            subaccountId: accountScopeToSubaccountId(account),
            key,
        };
    }),
);

export type GetOrderDetailsInput = v.InferInput<typeof GetOrderDetailsInputSchema>;

export function createCreateOrderResultSchema(scales: SdkScales, symbolId: number) {
    return v.pipe(
        v.object({
            orderId: PublicIdSchema,
            clientOrderId: v.string(),
            acceptedAt: OptionalTimestampMsSchema,
            acceptedAtTsNs: v.bigint(),
            resolvedBaseQtyScaled: v.bigint(),
            submittedMaxQuoteDebitScaled: v.optional(v.bigint()),
            takeProfitTriggerId: OptionalPublicIdSchema,
            stopLossTriggerId: OptionalPublicIdSchema,
            trailingStopTriggerId: OptionalPublicIdSchema,
        }),
        v.transform(
            ({
                acceptedAt,
                acceptedAtTsNs,
                resolvedBaseQtyScaled,
                submittedMaxQuoteDebitScaled,
                ...result
            }) => ({
                ...result,
                acceptedAt: acceptedAt ?? tsNsToMs(acceptedAtTsNs),
                acceptedAtNs: acceptedAtTsNs.toString(),
                resolvedBaseQty: scaledToDecimalOutput(
                    resolvedBaseQtyScaled,
                    scales.baseQty(symbolId),
                ),
                ...(submittedMaxQuoteDebitScaled === undefined
                    ? {}
                    : {
                          submittedMaxQuoteDebit: scaledToDecimalOutput(
                              submittedMaxQuoteDebitScaled,
                              scales.quoteAmount(symbolId),
                          ),
                      }),
            }),
        ),
    );
}

export type CreateOrderResult = v.InferOutput<ReturnType<typeof createCreateOrderResultSchema>>;

export function createPreviewOrderResultSchema(scales: SdkScales, symbolId: number) {
    return v.pipe(
        v.object({
            admissible: v.optional(v.boolean()),
            rejection: v.optional(OrderErrorDetailSchema),
            resolvedBaseQtyScaled: v.optional(v.bigint()),
            protectedPriceBoundTicks: v.optional(v.bigint()),
            evaluatedAt: TimestampMsSchema,
        }),
        v.transform(({ resolvedBaseQtyScaled, protectedPriceBoundTicks, ...result }) => ({
            ...result,
            ...(resolvedBaseQtyScaled === undefined
                ? {}
                : {
                      resolvedBaseQty: scaledToDecimalOutput(
                          resolvedBaseQtyScaled,
                          scales.baseQty(symbolId),
                      ),
                  }),
            ...(protectedPriceBoundTicks === undefined
                ? {}
                : {
                      protectedPriceBound: scaledToDecimalOutput(
                          protectedPriceBoundTicks,
                          scales.price(),
                      ),
                  }),
        })),
    );
}

export type PreviewOrderResult = v.InferOutput<ReturnType<typeof createPreviewOrderResultSchema>>;
