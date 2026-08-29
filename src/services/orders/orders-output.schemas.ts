import * as ProtoRead from "../../gen/orders/v1/orders_read_pb.js";
import * as ProtoWrite from "../../gen/orders/v1/orders_pb.js";
import * as v from "valibot";
import { tsNsToMs } from "../../utils/time.js";
import { formatId } from "../../utils/base58-id.js";
import { OptionalPublicIdSchema } from "../../shared/schemas.js";
import { requiredEnumLabel } from "../../shared/proto-enum-codec.js";
import { E18_SCALE, scaledToDecimalOutput, type SdkScales } from "../../shared/decimal-surface.js";
import { createUserTradeSchema } from "../trades/trades.schemas.js";
import { fromU128 } from "../../utils/u128.js";
import { AccountCodeCodec, TransferCodeCodec } from "../../shared/ledger-codes.js";
import {
    FeeAssetCodec,
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

const OrderStatusOutputSchema = v.pipe(
    v.enum(ProtoRead.OrderStatus),
    v.transform((status) =>
        requiredEnumLabel(
            OrderStatusCodec.protoToOutput,
            status,
            "PolyesterClient.OrderSchema",
            "status",
        ),
    ),
);

const ReadOrderOriginSchema = v.object({
    scope: v.pipe(
        v.enum(ProtoRead.OrderOriginScope),
        v.transform((v) =>
            requiredEnumLabel(
                OrderOriginScopeCodec.protoToOutput,
                v,
                "ReadOrderOriginSchema",
                "scope",
            ),
        ),
    ),
    triggerType: v.pipe(
        v.enum(ProtoRead.OrderTriggerType),
        v.transform((v) =>
            requiredEnumLabel(
                OrderTriggerTypeCodec.protoToOutput,
                v,
                "ReadOrderOriginSchema",
                "trigger type",
            ),
        ),
    ),
    triggerId: OptionalPublicIdSchema,
    parentOrderId: OptionalPublicIdSchema,
    childSeq: v.number(),
});

export function createOrderSchema(scales: SdkScales) {
    return v.pipe(
        v.object({
            orderId: v.bigint(),
            symbolId: v.number(),
            clientOrderId: v.string(),
            side: v.enum(ProtoWrite.Side),
            status: OrderStatusOutputSchema,
            orderType: v.number(),
            timeInForce: v.number(),
            selfTradePreventionMode: v.number(),
            feeAsset: v.number(),
            postOnly: v.boolean(),
            origQtyScaled: v.bigint(),
            cumQtyScaled: v.bigint(),
            leavesQtyScaled: v.bigint(),
            avgPriceTicks: v.bigint(),
            priceTicks: v.bigint(),
            createdTsNs: v.bigint(),
            terminalTsNs: v.bigint(),
            terminalReason: v.optional(v.string(), ""),
            terminalReasonCode: v.number(),
            attachedRisk: v.optional(ReadAttachedRiskSchema),
            origin: v.optional(ReadOrderOriginSchema),
            marketClientRefPriceTicks: v.bigint(),
            marketMaxSlippageTicks: v.number(),
            marketMaxSlippageBps: v.number(),
            version: v.pipe(v.number(), v.integer(), v.minValue(0)),
            batchRequestId: v.bigint(),
            submittedMaxQuoteDebitScaled: v.optional(v.bigint()),
        }),
        v.transform((o) => {
            const isPartial = o.status === "working" && o.cumQtyScaled > 0n;
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
                symbolId: o.symbolId,
                clientOrderId: o.clientOrderId,
                status: isPartial ? ("partial" as const) : o.status,
                side: requiredEnumLabel(
                    OrderSideCodec.protoToOutput,
                    o.side,
                    "OrderSchema",
                    "side",
                ),
                orderType: requiredEnumLabel(
                    OrderTypeCodec.protoToOutput,
                    o.orderType,
                    "OrderSchema",
                    "order type",
                ),
                timeInForce: requiredEnumLabel(
                    TimeInForceCodec.protoToOutput,
                    o.timeInForce,
                    "OrderSchema",
                    "time in force",
                ),
                selfTradePreventionMode: requiredEnumLabel(
                    SelfTradePreventionModeCodec.protoToOutput,
                    o.selfTradePreventionMode,
                    "OrderSchema",
                    "STP mode",
                ),
                feeAsset: requiredEnumLabel(
                    FeeAssetCodec.protoToOutput,
                    o.feeAsset,
                    "OrderSchema",
                    "fee asset",
                ),
                postOnly: o.postOnly,
                totalQty: scaledToDecimalOutput(o.origQtyScaled, baseQtyScale),
                cumQty: scaledToDecimalOutput(o.cumQtyScaled, baseQtyScale),
                leavesQty: scaledToDecimalOutput(o.leavesQtyScaled, baseQtyScale),
                avgPx: scaledToDecimalOutput(o.avgPriceTicks, scales.price()),
                price: scaledToDecimalOutput(o.priceTicks, scales.price()),
                createdTs: tsNsToMs(o.createdTsNs),
                terminalTs: tsNsToMs(o.terminalTsNs),
                terminalReason: humanizeTerminalReason(o.terminalReason),
                terminalReasonCode: o.terminalReasonCode,
                attachedRisk: formatAttachedRisk(scales, o.attachedRisk),
                ...(o.origin ? { origin: o.origin } : {}),
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
                version: o.version,
            };
        }),
    );
}

function humanizeTerminalReason(raw: string | null | undefined): string {
    const key = (raw ?? "").trim();
    if (!key) return "";
    const uppercaseAcronyms = ["GTC", "IOC", "FOK", "DAY", "GTD", "STP"];
    return key
        .split("_")
        .filter(Boolean)
        .map((part) => {
            const upper = part.toUpperCase();
            if (uppercaseAcronyms.includes(upper)) return upper;
            return upper[0] ? upper[0] + upper.slice(1).toLowerCase() : "";
        })
        .filter(Boolean)
        .join(" ");
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
            assetId: tr.assetId,
            isDebit: tr.isDebit,
            timestamp: tsNsToMs(tr.tsNs),
            amount: scaledToDecimalOutput(fromU128(tr.amountE18), E18_SCALE),
            type: requiredEnumLabel(
                TransferCodeCodec.protoToOutput,
                tr.transferCode,
                "OrderTransferSchema",
                "transfer code",
            ),
            accountCode: requiredEnumLabel(
                AccountCodeCodec.protoToOutput,
                tr.accountCode,
                "OrderTransferSchema",
                "account code",
            ),
        })),
    );
}

export type OrderTransfer = v.InferOutput<ReturnType<typeof createOrderTransferSchema>>;

export function createOrderDetailsSchema(scales: SdkScales) {
    return v.object({
        order: createOrderSchema(scales),
        trades: v.optional(v.array(createUserTradeSchema(scales)), []),
        transfers: v.optional(v.array(createOrderTransferSchema()), []),
    });
}

export type OrderDetails = v.InferOutput<ReturnType<typeof createOrderDetailsSchema>>;
