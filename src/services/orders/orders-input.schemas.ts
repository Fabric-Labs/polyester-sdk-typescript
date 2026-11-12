import * as ProtoWrite from "../../gen/orders/v1/orders_pb.js";
import { create } from "@bufbuild/protobuf";
import * as v from "valibot";
import { SideSchema, SymbolIdInputSchema } from "../shared.js";
import { tsNsToMs } from "../../utils/time.js";
import { msToTimestamp } from "../../utils/timestamp.js";
import { enumLabelSchema } from "../../shared/proto-enum-codec.js";
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
    CancelAllOrdersStatusCodec,
    CancelAllListingStatusCodec,
    CancelOrderStatusCodec,
} from "./orders.codecs.js";
import {
    MarketMaxSlippageSchema,
    ATTACHED_TRAILING_LIMIT_SIDE_MESSAGE,
    attachedTrailingLimitMatchesSide,
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
import { PEG_REFERENCE_VALUES, PegReferenceCodec } from "./order-enums.codecs.js";
import { MAX_SELLING_SLIPPAGE_BPS } from "../trailing-oneof-inputs.js";
import { CatalogConversionError } from "../../catalogs/types.js";
import { PROTOBUF_INT64_MAX } from "../../shared/wire-bounds.js";

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
    limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(1000))),
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

/**
 * The wire contract stores GTD expiries as signed Unix nanoseconds. The public
 * `execution.expireAt` surface is integer epoch milliseconds, so these are the
 * inclusive millisecond values that remain representable by that contract.
 * The 1s..30d lead-time window is enforced server-side; checking it here
 * against the client clock would only add skew-dependent false rejections.
 */
const GTD_EXPIRE_AT_MIN_MS = -9_223_372_036_854;
const GTD_EXPIRE_AT_MAX_MS = 9_223_372_036_854;

const GtdExpireAtSchema = v.pipe(
    v.number(),
    v.integer(),
    v.minValue(GTD_EXPIRE_AT_MIN_MS),
    v.maxValue(GTD_EXPIRE_AT_MAX_MS),
);

const PROTOBUF_INT64_MIN = -PROTOBUF_INT64_MAX - 1n;

/** Static entry peg: the limit price is taken once, at entry, from the selected book side. */
const StaticPegInputSchema = v.pipe(
    v.strictObject({
        reference: v.picklist(PEG_REFERENCE_VALUES),
        /** Signed count of the pair's tick size added to the reference, not a price. Defaults to 0. */
        offsetTicks: v.optional(
            v.pipe(
                v.union([
                    v.bigint(),
                    v.pipe(
                        v.number(),
                        v.safeInteger(),
                        v.transform((n) => BigInt(n)),
                    ),
                ]),
                v.check(
                    (offset) => offset >= PROTOBUF_INT64_MIN && offset <= PROTOBUF_INT64_MAX,
                    "peg.offsetTicks must fit a signed 64-bit integer",
                ),
            ),
            0n,
        ),
    }),
    v.transform(({ reference, offsetTicks }) =>
        create(ProtoWrite.StaticPegSchema, {
            reference: PegReferenceCodec.inputToProto[reference],
            offsetTicks,
        }),
    ),
);

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
        /** Takes the limit price from the book at entry; `execution.price` stays the BUY cap or SELL floor. */
        peg: v.optional(StaticPegInputSchema),
    };
}

type ParsedOrderIntentInput = v.InferOutput<ReturnType<typeof createOrderIntentInputObjectSchema>>;

type SellingSlippageInput = {
    side: ProtoWrite.Side;
    execution: v.InferOutput<ReturnType<typeof createOrderExecutionInputSchema>>;
};

const SELLING_SLIPPAGE_MESSAGE = `maxSlippageBps must be between 1 and ${MAX_SELLING_SLIPPAGE_BPS} for a market order that sells`;

/** Checks the bps cap of a market sell; attached trailing stops are capped when parsed. */
function sellingSlippageWithinCap(input: SellingSlippageInput): boolean {
    const slippage =
        input.side === ProtoWrite.Side.SELL && input.execution.case === "marketIoc"
            ? input.execution.value.maxSlippage
            : undefined;
    return slippage?.case !== "maxSlippageBps" || slippage.value <= MAX_SELLING_SLIPPAGE_BPS;
}

type OrderIntentRuleInput = {
    side: ProtoWrite.Side;
    execution: { case: string; displayQty?: string | undefined };
    qty?: string;
    quoteProceeds?: string;
    risk?: unknown;
    peg?: unknown;
};

/** Quote-proceeds sizing, static peg and iceberg combinations the exchange refuses. */
function orderIntentRuleViolation(input: OrderIntentRuleInput): string | undefined {
    const ioc = input.execution.case === "marketIoc" || input.execution.case === "limitIoc";
    if (input.quoteProceeds !== undefined && (input.side !== ProtoWrite.Side.SELL || !ioc)) {
        return "quoteProceeds is supported only for SELL market IOC and SELL limit IOC orders";
    }
    if (input.quoteProceeds !== undefined && input.risk !== undefined) {
        return "quoteProceeds cannot be combined with attached risk";
    }
    if (
        input.peg !== undefined &&
        (input.qty === undefined ||
            input.execution.case === "marketIoc" ||
            input.risk !== undefined)
    ) {
        return "peg requires qty sizing, a limit execution and no attached risk";
    }
    if (input.execution.displayQty !== undefined && input.risk !== undefined) {
        return "execution.displayQty cannot be combined with attached risk";
    }
    return undefined;
}

function createOrderIntentInputObjectSchema(scales: SdkScales) {
    const baseEntries = createOrderIntentBaseEntries(scales);
    return v.pipe(
        v.union([
            v.strictObject({
                ...baseEntries,
                qty: DecimalInputStringSchema,
                maxQuoteDebit: v.optional(v.never()),
                quoteProceeds: v.optional(v.never()),
            }),
            v.strictObject({
                ...baseEntries,
                qty: v.optional(v.never()),
                maxQuoteDebit: DecimalInputStringSchema,
                quoteProceeds: v.optional(v.never()),
            }),
            v.strictObject({
                ...baseEntries,
                qty: v.optional(v.never()),
                maxQuoteDebit: v.optional(v.never()),
                /** SELL IOC only: sells until its proceeds before fees reach this quote amount. */
                quoteProceeds: DecimalInputStringSchema,
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
        v.check((input) => sellingSlippageWithinCap(input), SELLING_SLIPPAGE_MESSAGE),
        v.check(
            (input) => attachedTrailingLimitMatchesSide(input),
            ATTACHED_TRAILING_LIMIT_SIDE_MESSAGE,
        ),
        v.check(
            (input) => orderIntentRuleViolation(input) === undefined,
            (issue) => orderIntentRuleViolation(issue.input) ?? "",
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
                quoteProceeds: v.optional(v.never()),
            }),
            v.strictObject({
                ...baseEntries,
                qty: v.optional(v.never()),
                maxQuoteDebit: DecimalInputStringSchema,
                quoteProceeds: v.optional(v.never()),
            }),
            v.strictObject({
                ...baseEntries,
                qty: v.optional(v.never()),
                maxQuoteDebit: v.optional(v.never()),
                /** SELL IOC only: sells until its proceeds before fees reach this quote amount. */
                quoteProceeds: DecimalInputStringSchema,
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
        v.check((input) => sellingSlippageWithinCap(input), SELLING_SLIPPAGE_MESSAGE),
        v.check(
            (input) => attachedTrailingLimitMatchesSide(input),
            ATTACHED_TRAILING_LIMIT_SIDE_MESSAGE,
        ),
        v.check(
            (input) => orderIntentRuleViolation(input) === undefined,
            (issue) => orderIntentRuleViolation(issue.input) ?? "",
        ),
    );
}

function toOrderIntent(input: ParsedOrderIntentInput, scales: SdkScales) {
    const { risk, qty, maxQuoteDebit, quoteProceeds, execution, ...intent } = input;
    const baseQtyScale = scales.baseQty(intent.symbolId);
    const sizing =
        qty !== undefined
            ? ({
                  case: "baseQtyScaled",
                  value: positiveDecimalInputToScaled("qty", qty, baseQtyScale),
              } as const)
            : maxQuoteDebit !== undefined
              ? ({
                    case: "maxQuoteDebitScaled",
                    value: positiveDecimalInputToScaled(
                        "maxQuoteDebit",
                        maxQuoteDebit,
                        scales.quoteAmount(intent.symbolId),
                    ),
                } as const)
              : ({
                    case: "quoteProceedsScaled",
                    value: positiveDecimalInputToScaled(
                        "quoteProceeds",
                        quoteProceeds,
                        scales.quoteAmount(intent.symbolId),
                    ),
                } as const);
    return {
        ...intent,
        sizing,
        execution: withDisplayQty(
            execution,
            sizing.case === "baseQtyScaled" ? sizing.value : undefined,
            baseQtyScale,
        ),
        feeAsset: intent.feeAsset ?? ProtoWrite.FeeAsset.QUOTE,
        attachedRisk: risk,
    };
}

/**
 * Sets an iceberg display on a GTC or GTD limit. The server also requires a multiple of the
 * pair's quantity step and at least its minimum quantity.
 */
function withDisplayQty(
    execution: ParsedOrderIntentInput["execution"],
    baseQtyScaled: bigint | undefined,
    baseQtyScale: number,
) {
    if (execution.case !== "limitGtc" && execution.case !== "limitGtd") return execution;
    const { displayQty, ...limit } = execution;
    if (displayQty === undefined) return limit;
    const display = positiveDecimalInputToScaled("execution.displayQty", displayQty, baseQtyScale);
    // At most 100 parts: below the quantity and at least the quantity divided by 100, rounded up.
    if (baseQtyScaled === undefined || display >= baseQtyScaled || display * 100n < baseQtyScaled) {
        throw new CatalogConversionError(
            "execution.displayQty",
            "execution.displayQty must be below qty and at least qty divided by 100, rounded up",
        );
    }
    limit.value.displayQtyScaled = display;
    return limit;
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
                /** Iceberg: the most of the order the book shows at once, in base units. */
                displayQty: v.optional(DecimalInputStringSchema),
            }),
            v.transform(({ price, postOnly, displayQty }) => ({
                case: "limitGtc" as const,
                value: create(ProtoWrite.LimitGtcSchema, {
                    priceTicks: priceToTicks("execution.price", price),
                    postOnly,
                }),
                displayQty,
            })),
        ),
        v.pipe(
            v.strictObject({
                type: v.literal("limit_gtd"),
                price: DecimalInputStringSchema,
                /** Exact UTC expiry as integer epoch milliseconds. */
                expireAt: GtdExpireAtSchema,
                postOnly: v.optional(v.boolean(), false),
                /** Iceberg: the most of the order the book shows at once, in base units. */
                displayQty: v.optional(DecimalInputStringSchema),
            }),
            v.transform(({ price, expireAt, postOnly, displayQty }) => ({
                case: "limitGtd" as const,
                value: create(ProtoWrite.LimitGtdSchema, {
                    priceTicks: priceToTicks("execution.price", price),
                    postOnly,
                    expireAt: msToTimestamp(expireAt),
                }),
                displayQty,
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
        status: enumLabelSchema(CancelOrderStatusCodec.protoToOutput),
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
        symbolIds: v.optional(v.pipe(v.array(SymbolIdInputSchema), v.maxLength(100)), []),
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
        status: enumLabelSchema(CancelAllOrdersStatusCodec.protoToOutput),
        matchedOrders: v.number(),
        submittedCancels: v.number(),
        failedCancels: v.number(),
        tsNs: v.bigint(),
        cancelledOrders: v.optional(
            v.array(v.object({ orderId: PublicIdSchema, clientOrderId: v.string() })),
            [],
        ),
        totalCancelled: v.optional(v.number(), 0),
        truncated: v.optional(v.boolean(), false),
        listingStatus: v.optional(enumLabelSchema(CancelAllListingStatusCodec.protoToOutput), 0),
    }),
    v.transform((o) => ({
        status: o.status,
        matchedOrders: o.matchedOrders,
        submittedCancels: o.submittedCancels,
        failedCancels: o.failedCancels,
        ts: tsNsToMs(o.tsNs),
        canceledOrders: o.cancelledOrders,
        totalCanceled: o.totalCancelled,
        truncated: o.truncated,
        listingStatus: o.listingStatus,
    })),
);

export type CancelAllOrdersResponse = v.InferOutput<typeof CancelAllOrdersResponseSchema>;

export const GetOrderDetailsInputSchema = v.pipe(
    v.strictObject({
        orderId: v.optional(OrderIdInputSchema),
        clientOrderId: v.optional(ClientOrderIdInputSchema),
        ...AccountScopeInputEntries,
        includeExecutionHistory: v.optional(v.boolean()),
        limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(1000))),
        pageToken: v.optional(v.pipe(v.string(), v.trim())),
        includeAttachedRisk: v.optional(v.boolean(), true),
        includeAttachedRiskState: v.optional(v.boolean(), true),
    }),
    v.check(
        (input) =>
            input.includeExecutionHistory !== false ||
            (input.limit === undefined && input.pageToken === undefined),
        "limit and pageToken must be omitted when includeExecutionHistory is false",
    ),
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
            submittedQuoteProceedsScaled: v.optional(v.bigint()),
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
                submittedQuoteProceedsScaled,
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
                ...(submittedQuoteProceedsScaled === undefined
                    ? {}
                    : {
                          submittedQuoteProceeds: scaledToDecimalOutput(
                              submittedQuoteProceedsScaled,
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
