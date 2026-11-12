import { ErrorCode } from "../../gen/orders/v1/orders_pb.js";
import { OrderLineageSchema } from "./order-lineage.schemas.js";
import type { OrderErrorCode } from "./order-errors.schemas.js";
import * as v from "valibot";
import { tsNsToMs, tsObjToMs } from "../../utils/time.js";
import type * as ProtoRead from "../../gen/orders/v1/orders_read_pb.js";
import { parse } from "../../shared/validation.js";
import { formatId } from "../../utils/base58-id.js";
import {
    OptionalPublicIdSchema,
    OptionalTimestampMsSchema,
    U128Schema,
} from "../../shared/schemas.js";
import { enumLabel, enumLabelSchema } from "../../shared/proto-enum-codec.js";
import { E18_SCALE, scaledToDecimalOutput, type SdkScales } from "../../shared/decimal-surface.js";
import { createUserTradeSchema } from "../trades/trades.schemas.js";
import { fromU128 } from "../../utils/u128.js";
import { AccountCodeCodec, TransferCodeCodec } from "../../shared/ledger-codes.js";
import {
    FeeAssetCodec,
    OrderCancelReasonCodec,
    OrderOriginScopeCodec,
    OrderSideCodec,
    OrderStatusCodec,
    OrderTriggerTypeCodec,
    OrderTypeCodec,
    SelfTradePreventionModeCodec,
    TimeInForceCodec,
} from "./orders.codecs.js";
import {
    ReadAttachedRiskSchema,
    formatAttachedRisk,
    formatMarketMaxSlippage,
} from "./orders-risk.schemas.js";

const OrderStatusOutputSchema = enumLabelSchema(OrderStatusCodec.protoToOutput);

const ReadOrderOriginSchema = v.object({
    scope: enumLabelSchema(OrderOriginScopeCodec.protoToOutput),
    triggerType: enumLabelSchema(OrderTriggerTypeCodec.protoToOutput),
    triggerId: OptionalPublicIdSchema,
    parentOrderId: OptionalPublicIdSchema,
    childSeq: v.number(),
});

const OrderFieldsSchema = v.object({
    orderId: v.bigint(),
    lineage: v.optional(OrderLineageSchema),
    symbolId: v.number(),
    clientOrderId: v.string(),
    side: v.number(),
    status: OrderStatusOutputSchema,
    orderType: v.number(),
    timeInForce: v.number(),
    selfTradePreventionMode: v.number(),
    feeAsset: v.number(),
    postOnly: v.boolean(),
    origQtyScaled: v.bigint(),
    cumQtyScaled: v.bigint(),
    inheritedCumQtyScaled: v.optional(v.bigint(), 0n),
    leavesQtyScaled: v.bigint(),
    displayQtyScaled: v.optional(v.bigint(), 0n),
    hiddenQtyScaled: v.optional(v.bigint(), 0n),
    avgPriceTicks: v.bigint(),
    avgPriceE18: v.optional(U128Schema),
    cumNotional: v.optional(U128Schema),
    feeTotal: v.optional(
        v.object({
            amountE18: v.optional(U128Schema),
            isRebate: v.boolean(),
            qtyScaled: v.bigint(),
        }),
    ),
    priceTicks: v.bigint(),
    createdTsNs: v.bigint(),
    terminalTsNs: v.bigint(),
    rejectReason: v.optional(v.number(), 0),
    cancelReason: v.optional(v.number(), 0),
    attachedRisk: v.optional(ReadAttachedRiskSchema),
    origin: v.optional(ReadOrderOriginSchema),
    marketClientRefPriceTicks: v.bigint(),
    marketMaxSlippageTicks: v.bigint(),
    marketMaxSlippageBps: v.number(),
    version: v.pipe(v.number(), v.integer(), v.minValue(0)),
    batchRequestId: v.bigint(),
    submittedMaxQuoteDebitScaled: v.optional(v.bigint()),
    submittedQuoteProceedsScaled: v.optional(v.bigint()),
    expireAt: OptionalTimestampMsSchema,
});

type OrderFields = v.InferOutput<typeof OrderFieldsSchema>;
/** Fields whose schemas transform or range-check, so the fast path still converts them. */
type OrderNestedFields = Pick<
    OrderFields,
    "status" | "lineage" | "attachedRisk" | "origin" | "expireAt"
>;

// `o` and `n` are separate so the fast path can pass a proto message without copying it:
// spreading a protobuf-es message costs more than the validation it would skip.
function toOrder(
    scales: SdkScales,
    o: Omit<OrderFields, keyof OrderNestedFields>,
    n: OrderNestedFields,
) {
    const isPartial = n.status === "working" && o.cumQtyScaled > 0n;
    const baseQtyScale = scales.baseQty(o.symbolId);
    const marketClientRefPrice =
        o.marketClientRefPriceTicks > 0n
            ? scaledToDecimalOutput(o.marketClientRefPriceTicks, scales.price())
            : undefined;
    const marketMaxSlippage = formatMarketMaxSlippage(
        scales,
        o.marketMaxSlippageTicks,
        o.marketMaxSlippageBps,
    );
    return {
        orderId: formatId(o.orderId),
        ...(n.lineage === undefined ? {} : { lineage: n.lineage }),
        symbolId: o.symbolId,
        clientOrderId: o.clientOrderId,
        status: isPartial ? ("partial" as const) : n.status,
        side: enumLabel(OrderSideCodec.protoToOutput, o.side),
        orderType: enumLabel(OrderTypeCodec.protoToOutput, o.orderType),
        timeInForce: enumLabel(TimeInForceCodec.protoToOutput, o.timeInForce),
        selfTradePreventionMode: enumLabel(
            SelfTradePreventionModeCodec.protoToOutput,
            o.selfTradePreventionMode,
        ),
        feeAsset: enumLabel(FeeAssetCodec.protoToOutput, o.feeAsset),
        postOnly: o.postOnly,
        totalQty: scaledToDecimalOutput(o.origQtyScaled, baseQtyScale),
        cumQty: scaledToDecimalOutput(o.cumQtyScaled, baseQtyScale),
        inheritedCumQty: scaledToDecimalOutput(o.inheritedCumQtyScaled, baseQtyScale),
        leavesQty: scaledToDecimalOutput(o.leavesQtyScaled, baseQtyScale),
        // Iceberg only: the book shows at most displayQty, and leavesQty less hiddenQty now.
        ...(o.displayQtyScaled > 0n
            ? {
                  displayQty: scaledToDecimalOutput(o.displayQtyScaled, baseQtyScale),
                  hiddenQty: scaledToDecimalOutput(o.hiddenQtyScaled, baseQtyScale),
              }
            : {}),
        avgPx:
            o.avgPriceE18 === undefined
                ? scaledToDecimalOutput(o.avgPriceTicks, scales.price())
                : scaledToDecimalOutput(fromU128(o.avgPriceE18), E18_SCALE),
        cumQuote: scaledToDecimalOutput(fromU128(o.cumNotional), scales.price() + baseQtyScale),
        ...(o.feeTotal === undefined
            ? {}
            : {
                  feeTotal: {
                      amount: scaledToDecimalOutput(fromU128(o.feeTotal.amountE18), E18_SCALE),
                      isRebate: o.feeTotal.isRebate,
                      qty: scaledToDecimalOutput(o.feeTotal.qtyScaled, baseQtyScale),
                  },
              }),
        price: scaledToDecimalOutput(o.priceTicks, scales.price()),
        createdTs: tsNsToMs(o.createdTsNs),
        terminalTs: tsNsToMs(o.terminalTsNs),
        ...(o.rejectReason === 0 ? {} : { rejectReason: orderRejectReason(o.rejectReason) }),
        ...(o.cancelReason === 0
            ? {}
            : {
                  cancelReason: enumLabel(OrderCancelReasonCodec.protoToOutput, o.cancelReason),
              }),
        attachedRisk: formatAttachedRisk(scales, n.attachedRisk),
        ...(n.origin ? { origin: n.origin } : {}),
        ...(marketClientRefPrice ? { marketClientRefPrice } : {}),
        ...(marketMaxSlippage ? { marketMaxSlippage } : {}),
        ...(o.batchRequestId > 0n ? { batchRequestId: formatId(o.batchRequestId) } : {}),
        ...(o.submittedMaxQuoteDebitScaled === undefined
            ? {}
            : {
                  submittedMaxQuoteDebit: scaledToDecimalOutput(
                      o.submittedMaxQuoteDebitScaled,
                      scales.quoteAmount(o.symbolId),
                  ),
              }),
        // A quote-proceeds SELL: cumQuote is what it received before fees, never above this.
        ...(o.submittedQuoteProceedsScaled === undefined
            ? {}
            : {
                  submittedQuoteProceeds: scaledToDecimalOutput(
                      o.submittedQuoteProceedsScaled,
                      scales.quoteAmount(o.symbolId),
                  ),
              }),
        ...(n.expireAt === undefined ? {} : { expireAt: n.expireAt }),
        version: o.version,
    };
}

export function createOrderSchema(scales: SdkScales) {
    return v.pipe(
        OrderFieldsSchema,
        v.transform((o) => toOrder(scales, o, o)),
    );
}

/**
 * Formats a protobuf-decoded order into the same payload as {@link createOrderSchema}
 * without re-validating fields protobuf already typed. Only nested fields whose schemas
 * transform or range-check are still parsed.
 */
export function formatOrder(scales: SdkScales, o: ProtoRead.Order): Order {
    return toOrder(scales, o, {
        status: enumLabel(OrderStatusCodec.protoToOutput, o.status),
        lineage: o.lineage && parse(OrderLineageSchema, o.lineage),
        attachedRisk: o.attachedRisk && parse(ReadAttachedRiskSchema, o.attachedRisk),
        origin: o.origin && parse(ReadOrderOriginSchema, o.origin),
        expireAt: tsObjToMs(o.expireAt),
    });
}

/**
 * A REJECTED order's refusal, named like the error the Orders API returns for it. A code
 * newer than this build reads as `"UNSPECIFIED"`: treat it as a generic refusal.
 */
function orderRejectReason(code: number): OrderErrorCode {
    const name: unknown = ErrorCode[code];
    return typeof name === "string" ? (name as OrderErrorCode) : "UNSPECIFIED";
}

export type Order = v.InferOutput<ReturnType<typeof createOrderSchema>>;

export function createOrderTransferSchema() {
    return v.pipe(
        v.object({
            txId: v.string(),
            matchId: v.pipe(
                v.bigint(),
                v.transform((value) => value.toString()),
            ),
            symbolId: v.number(),
            assetId: v.number(),
            amountE18: v.optional(
                v.object({
                    hi: v.bigint(),
                    lo: v.bigint(),
                }),
            ),
            isDebit: v.boolean(),
            transferCode: v.number(),
            accountCode: v.number(),
            tsNs: v.bigint(),
        }),
        v.transform((tr) => ({
            txId: tr.txId,
            matchId: tr.matchId,
            symbolId: tr.symbolId,
            assetId: tr.assetId,
            isDebit: tr.isDebit,
            timestamp: tsNsToMs(tr.tsNs),
            amount: scaledToDecimalOutput(fromU128(tr.amountE18), E18_SCALE),
            type: enumLabel(TransferCodeCodec.protoToOutput, tr.transferCode),
            accountCode: enumLabel(AccountCodeCodec.protoToOutput, tr.accountCode),
        })),
    );
}

export type OrderTransfer = v.InferOutput<ReturnType<typeof createOrderTransferSchema>>;

export function createOrderDetailsSchema(scales: SdkScales) {
    return v.object({
        nextPageToken: v.optional(v.string(), ""),
        order: createOrderSchema(scales),
        trades: v.optional(v.array(createUserTradeSchema(scales)), []),
        transfers: v.optional(v.array(createOrderTransferSchema()), []),
        executionsComplete: v.optional(v.boolean(), false),
    });
}

export type OrderDetails = v.InferOutput<ReturnType<typeof createOrderDetailsSchema>>;
