import * as ProtoRead from "../../gen/orders/v1/orders_read_pb.js";
import * as ProtoWrite from "../../gen/orders/v1/orders_pb.js";
import * as v from "valibot";
import {
    createCatalogSnapshotReader,
    LEDGER_SCALE,
    staticCatalog,
    type CatalogReader,
    type CatalogSnapshot,
} from "../../catalogs/index.js";
import { tsNsToMs } from "../../utils/time.js";
import { formatId } from "../../utils/base58-id.js";
import { OptionalPublicIdSchema } from "../../shared/schemas.js";
import { requiredEnumLabel } from "../../shared/proto-enum-codec.js";
import { createUserTradeSchemaForReader } from "../trades/trades.schemas.js";
import { fromU128, u128ToDecimal } from "../../utils/u128.js";
import { transferTypeNameFor, accountCodeNameFor } from "../../catalogs/index.js";
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

export function createOrderSchema(catalog: CatalogSnapshot) {
    return createOrderSchemaForReader(createCatalogSnapshotReader(catalog));
}

export function createOrderSchemaForReader(reader: CatalogReader) {
    return v.pipe(
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
            const sideNum = o.side;
            const isPartial = o.status === "working" && Number(o.cumQty) > 0;
            const pair = reader.market.requirePairBySymbolId(o.symbolId);
            const marketClientRefPrice =
                o.marketClientRefPriceTicks > 0n
                    ? reader.orders.formatPrice(o.marketClientRefPriceTicks, o.symbolId)
                    : undefined;
            const marketMaxSlippage = formatMarketMaxSlippage(
                o.marketMaxSlippageTicks,
                o.marketMaxSlippageBps,
            );
            return {
                orderId: formatId(o.orderId),
                symbolId: o.symbolId,
                clientOrderId: o.clientOrderId,
                pair,
                status: isPartial ? ("partial" as const) : o.status,
                side: requiredEnumLabel(
                    OrderSideCodec.protoToOutput,
                    sideNum,
                    "OrderSchema",
                    "side",
                ),
                orderType: requiredEnumLabel(
                    OrderTypeCodec.protoToOutput,
                    o.orderType,
                    "OrderSchema",
                    "order type",
                ),
                tif: requiredEnumLabel(
                    TifCodec.protoToOutput,
                    o.tif,
                    "OrderSchema",
                    "time in force",
                ),
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
                origQty: reader.orders.formatQuantity(o.origQty, o.symbolId),
                cumQty: reader.orders.formatQuantity(o.cumQty, o.symbolId),
                leavesQty: reader.orders.formatQuantity(o.leavesQty, o.symbolId),
                avgPx: reader.orders.formatPrice(o.avgPxTicks, o.symbolId),
                price: reader.orders.formatPrice(o.priceTicks, o.symbolId),
                createdTs: tsNsToMs(o.createdTsNs),
                terminalTs: tsNsToMs(o.terminalTsNs),
                symbol: pair.symbol,
                terminalReason: humanizeTerminalReason(o.terminalReason),
                terminalReasonCode: o.terminalReasonCode,
                attachedRisk: formatAttachedRisk(o.attachedRisk, o.symbolId, reader),
                ...(o.origin ? { origin: o.origin } : {}),
                ...(marketClientRefPrice ? { marketClientRefPrice } : {}),
                ...(marketMaxSlippage ? { marketMaxSlippage } : {}),
            };
        }),
    );
}

export const OrderSchema = createOrderSchemaForReader(staticCatalog);

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

export type Order = v.InferOutput<typeof OrderSchema>;

export function createOrderTransferSchema(catalog: CatalogSnapshot) {
    return createOrderTransferSchemaForReader(createCatalogSnapshotReader(catalog));
}

function createOrderTransferSchemaForReader(reader: CatalogReader) {
    return v.pipe(
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
        v.transform((tr) => {
            const aid = tr.assetId;
            const amt128 = fromU128({ hi: tr.amountHi, lo: tr.amountLo });
            let amount =
                aid !== 0
                    ? reader.ledger.formatAmount(u128ToDecimal(amt128, LEDGER_SCALE), aid)
                    : u128ToDecimal(amt128, LEDGER_SCALE);
            if (tr.isDebit) amount = `-${amount}`;
            else amount = `+${amount}`;
            return {
                txId: tr.txId,
                matchId: tr.matchId,
                assetId: tr.assetId,
                isDebit: tr.isDebit,
                timestamp: tsNsToMs(tr.timestamp),
                amount,
                symbol: aid !== 0 ? reader.ledger.requireSymbolByLedgerId(aid) : "0",
                type: transferTypeNameFor(tr.type),
                accountCode: accountCodeNameFor(tr.accountCode),
            };
        }),
    );
}

const OrderTransferSchema = createOrderTransferSchemaForReader(staticCatalog);

export type OrderTransfer = v.InferOutput<typeof OrderTransferSchema>;

export function createOrderDetailsSchema(catalog: CatalogSnapshot) {
    return createOrderDetailsSchemaForReader(createCatalogSnapshotReader(catalog));
}

export function createOrderDetailsSchemaForReader(reader: CatalogReader) {
    return v.object({
        order: createOrderSchemaForReader(reader),
        trades: v.optional(v.array(createUserTradeSchemaForReader(reader)), []),
        transfers: v.optional(v.array(createOrderTransferSchemaForReader(reader)), []),
    });
}

export const OrderDetailsSchema = createOrderDetailsSchemaForReader(staticCatalog);

export type OrderDetails = v.InferOutput<typeof OrderDetailsSchema>;
