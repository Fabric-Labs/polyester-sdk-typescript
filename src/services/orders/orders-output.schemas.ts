import * as ProtoRead from "../../gen/orders/v1/orders_read_pb.js";
import * as ProtoWrite from "../../gen/orders/v1/orders_pb.js";
import * as v from "valibot";
import { tsNsToMs } from "../../utils/time.js";
import { formatId } from "../../utils/base58-id.js";
import { OptionalPublicIdSchema } from "../../shared/schemas.js";
import { requiredEnumLabel } from "../../shared/proto-enum-codec.js";
import { UserTradeSchema } from "../trades/trades.schemas.js";
import { fromU128 } from "../../utils/u128.js";
import { accountCodeNameFor, transferTypeNameFor } from "../../shared/ledger-codes.js";
import {
    FeeSourceCodec,
    OrderOriginScopeCodec,
    OrderSideCodec,
    OrderStatusCodec,
    OrderTriggerTypeCodec,
    OrderTypeCodec,
    StpModeCodec,
    TifCodec,
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

export const OrderSchema = v.pipe(
    v.object({
        orderId: v.bigint(),
        symbolId: v.number(),
        clientOrderId: v.string(),
        side: v.enum(ProtoWrite.Side),
        status: OrderStatusOutputSchema,
        orderType: v.number(),
        tif: v.number(),
        stpMode: v.number(),
        feeSource: v.number(),
        postOnly: v.boolean(),
        origQty: v.bigint(),
        cumQty: v.bigint(),
        leavesQty: v.bigint(),
        avgPxTicks: v.bigint(),
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
    }),
    v.transform((o) => {
        const isPartial = o.status === "working" && o.cumQty > 0n;
        const marketClientRefPriceTicks =
            o.marketClientRefPriceTicks > 0n ? o.marketClientRefPriceTicks.toString() : undefined;
        const marketMaxSlippage = formatMarketMaxSlippage(
            o.marketMaxSlippageTicks,
            o.marketMaxSlippageBps,
        );
        return {
            orderId: formatId(o.orderId),
            symbolId: o.symbolId,
            clientOrderId: o.clientOrderId,
            status: isPartial ? ("partial" as const) : o.status,
            side: requiredEnumLabel(OrderSideCodec.protoToOutput, o.side, "OrderSchema", "side"),
            orderType: requiredEnumLabel(
                OrderTypeCodec.protoToOutput,
                o.orderType,
                "OrderSchema",
                "order type",
            ),
            tif: requiredEnumLabel(TifCodec.protoToOutput, o.tif, "OrderSchema", "time in force"),
            stpMode: requiredEnumLabel(
                StpModeCodec.protoToOutput,
                o.stpMode,
                "OrderSchema",
                "STP mode",
            ),
            feeSource: requiredEnumLabel(
                FeeSourceCodec.protoToOutput,
                o.feeSource,
                "OrderSchema",
                "fee source",
            ),
            postOnly: o.postOnly,
            origQtyScaled: o.origQty.toString(),
            cumQtyScaled: o.cumQty.toString(),
            leavesQtyScaled: o.leavesQty.toString(),
            avgPxTicks: o.avgPxTicks.toString(),
            priceTicks: o.priceTicks.toString(),
            createdTs: tsNsToMs(o.createdTsNs),
            terminalTs: tsNsToMs(o.terminalTsNs),
            terminalReason: humanizeTerminalReason(o.terminalReason),
            terminalReasonCode: o.terminalReasonCode,
            attachedRisk: formatAttachedRisk(o.attachedRisk),
            ...(o.origin ? { origin: o.origin } : {}),
            ...(marketClientRefPriceTicks ? { marketClientRefPriceTicks } : {}),
            ...(marketMaxSlippage ? { marketMaxSlippage } : {}),
        };
    }),
);

export function createOrderSchema() {
    return OrderSchema;
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

export const OrderTransferSchema = v.pipe(
    v.object({
        txId: v.string(),
        matchId: v.pipe(
            v.bigint(),
            v.transform((v) => Number(v)),
        ),
        assetId: v.number(),
        amountHi: v.bigint(),
        amountLo: v.bigint(),
        isDebit: v.boolean(),
        type: v.number(),
        accountCode: v.number(),
        timestamp: v.bigint(),
    }),
    v.transform((tr) => ({
        txId: tr.txId,
        matchId: tr.matchId,
        assetId: tr.assetId,
        isDebit: tr.isDebit,
        timestamp: tsNsToMs(tr.timestamp),
        amountQ: fromU128({ hi: tr.amountHi, lo: tr.amountLo }).toString(),
        type: transferTypeNameFor(tr.type),
        accountCode: accountCodeNameFor(tr.accountCode),
    })),
);

export function createOrderTransferSchema() {
    return OrderTransferSchema;
}

export type OrderTransfer = v.InferOutput<ReturnType<typeof createOrderTransferSchema>>;

export const OrderDetailsSchema = v.object({
    order: OrderSchema,
    trades: v.optional(v.array(UserTradeSchema), []),
    transfers: v.optional(v.array(OrderTransferSchema), []),
});

export function createOrderDetailsSchema() {
    return OrderDetailsSchema;
}

export type OrderDetails = v.InferOutput<ReturnType<typeof createOrderDetailsSchema>>;
