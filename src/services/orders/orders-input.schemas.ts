import * as ProtoWrite from "../../gen/orders/v1/orders_pb.js";
import * as v from "valibot";
import { SideSchema } from "../shared.js";
import {
    createCatalogSnapshotReader,
    type CatalogReader,
    type CatalogSnapshot,
} from "../../catalogs/index.js";
import { parsePriceTicks } from "../../utils/numbers.js";
import { tsNsToMs } from "../../utils/time.js";
import { idToBigInt } from "../../utils/base58-id.js";
import {
    OptionalPublicIdSchema,
    PublicIdSchema,
    optionalSubaccountIdInputSchema,
    optionalUint64DecimalFilterSchema,
} from "../../shared/schemas.js";
import {
    FEE_SOURCE_VALUES,
    ORDER_STATUS_FILTER_VALUES,
    ORDER_TYPE_VALUES,
    OrderSideCodec,
    OrderStatusFilterCodec,
    OrderTypeCodec,
    STP_MODE_VALUES,
    TIF_VALUES,
    TifCodec,
    FeeSourceCodec,
    StpModeCodec,
} from "./orders.codecs.js";
import {
    MarketMaxSlippageSchema,
    RiskPolicyInputSchema,
    parseMarketMaxSlippage,
} from "./orders-risk.schemas.js";
import { buildSpotOrderCore } from "./spot-order-core.schemas.js";

const OrderStatusSchema = v.picklist(ORDER_STATUS_FILTER_VALUES);
const OrderTypeSchema = v.picklist(ORDER_TYPE_VALUES);
const TIFSchema = v.picklist(TIF_VALUES);
const FeeSourceSchema = v.picklist(FEE_SOURCE_VALUES);
const STPSchema = v.picklist(STP_MODE_VALUES);

export const BaseOrdersFilterInputSchema = v.object({
    subaccountId: optionalSubaccountIdInputSchema(),
    symbolId: v.optional(v.array(v.number())),
    side: v.pipe(
        v.optional(SideSchema),
        v.transform((v) => (v ? OrderSideCodec.inputToProto[v] : undefined)),
    ),
    limit: v.optional(v.number()),
    pageToken: v.optional(v.pipe(v.string(), v.trim())),
});

export const OpenOrdersInputSchema = v.object({
    ...BaseOrdersFilterInputSchema.entries,

    includeAttachedRisk: v.optional(v.boolean(), true),
    includeAttachedRiskState: v.optional(v.boolean(), false),
});

export type OpenOrdersInput = v.InferInput<typeof OpenOrdersInputSchema>;

export const OrderHistoryInputSchema = v.object({
    ...BaseOrdersFilterInputSchema.entries,
    includeAttachedRisk: v.optional(v.boolean(), true),
    includeAttachedRiskState: v.optional(v.boolean(), false),
    status: v.pipe(
        v.optional(OrderStatusSchema),
        v.transform((v) => (v ? OrderStatusFilterCodec.inputToProto[v] : undefined)),
    ),
    startTsNs: optionalUint64DecimalFilterSchema("startTsNs"),
    endTsNs: optionalUint64DecimalFilterSchema("endTsNs"),
});

export type OrderHistoryInput = v.InferInput<typeof OrderHistoryInputSchema>;

function parseMarketClientRefPriceTicks(price: string | undefined): bigint {
    const trimmed = (price ?? "").trim();
    if (!trimmed) return 0n;
    const ticks = parsePriceTicks(trimmed, "marketClientRefPrice");
    if (ticks <= 0n) {
        throw new Error("marketClientRefPrice must be greater than 0");
    }
    return ticks;
}

export function createNewOrderInputSchema(catalog: CatalogSnapshot) {
    return createNewOrderInputSchemaForReader(createCatalogSnapshotReader(catalog));
}

export function createNewOrderInputSchemaForReader(reader: CatalogReader) {
    return v.pipe(
        v.object({
            subaccountId: optionalSubaccountIdInputSchema(),
            symbol: v.pipe(v.string(), v.trim(), v.minLength(1)),
            side: v.pipe(
                SideSchema,
                v.transform((v) => OrderSideCodec.inputToProto[v]),
            ),
            orderType: v.pipe(
                OrderTypeSchema,
                v.transform((v) => OrderTypeCodec.inputToProto[v]),
            ),
            tif: v.pipe(
                TIFSchema,
                v.transform((v) => TifCodec.inputToProto[v]),
            ),
            price: v.optional(v.pipe(v.string(), v.trim())),
            qty: v.pipe(v.string(), v.trim(), v.minLength(1)),
            postOnly: v.optional(v.boolean(), false),
            clientOrderId: v.optional(v.pipe(v.string(), v.trim())),
            feeSource: v.pipe(
                v.optional(FeeSourceSchema),
                v.transform((v) => (v ? FeeSourceCodec.inputToProto[v] : undefined)),
            ),
            stpMode: v.pipe(
                v.optional(STPSchema),
                v.transform((v) => (v ? StpModeCodec.inputToProto[v] : undefined)),
            ),
            risk: RiskPolicyInputSchema,
            marketMaxSlippage: v.optional(MarketMaxSlippageSchema),
            marketClientRefPrice: v.optional(v.pipe(v.string(), v.trim())),
        }),
        v.check((input) => {
            const hasMarketClientRefPrice = (input.marketClientRefPrice ?? "").length > 0;
            const hasMarketMaxSlippage =
                input.marketMaxSlippage !== undefined && input.marketMaxSlippage.kind !== "none";
            return input.orderType !== ProtoWrite.OrderType.MARKET &&
                (hasMarketClientRefPrice || hasMarketMaxSlippage)
                ? false
                : true;
        }, "market max slippage and client reference price are only valid for market orders"),
        v.transform(
            ({
                qty,
                price,
                subaccountId,
                risk,
                marketMaxSlippage,
                marketClientRefPrice,
                ...input
            }) => {
                const order = buildSpotOrderCore(reader, {
                    symbol: input.symbol,
                    side: input.side,
                    orderType: input.orderType,
                    tif: input.tif,
                    qty,
                    price,
                    feeSource: input.feeSource,
                    stpMode: input.stpMode,
                    postOnly: input.postOnly,
                });
                return {
                    ...order,
                    clientOrderId: input.clientOrderId,
                    subaccountId,
                    attachedRisk: risk,
                    marketMaxSlippage: parseMarketMaxSlippage(marketMaxSlippage),
                    marketClientRefPriceTicks: parseMarketClientRefPriceTicks(marketClientRefPrice),
                };
            },
        ),
    );
}

export type NewOrderInput = v.InferInput<ReturnType<typeof createNewOrderInputSchema>>;

const CancelOrderScopeInputEntries = {
    symbolId: v.optional(v.number()),
    subaccountId: optionalSubaccountIdInputSchema(),
};

export const CancelOrderInputSchema = v.pipe(
    v.union([
        v.object({
            ...CancelOrderScopeInputEntries,
            orderId: v.pipe(
                v.string(),
                v.trim(),
                v.minLength(1),
                v.transform((v) => idToBigInt(v, "orderId")),
            ),
            clientOrderId: v.optional(v.never()),
        }),
        v.object({
            ...CancelOrderScopeInputEntries,
            orderId: v.optional(v.never()),
            clientOrderId: v.pipe(v.string(), v.trim(), v.minLength(1)),
        }),
    ]),
    v.transform(({ orderId, clientOrderId, ...rest }) => {
        const key =
            orderId !== undefined
                ? ({ case: "orderId", value: orderId } as const)
                : ({ case: "clientOrderId", value: clientOrderId } as const);
        return {
            ...rest,
            key,
        };
    }),
);

export type CancelOrderInput = v.InferInput<typeof CancelOrderInputSchema>;

export const CancelOrderResultSchema = v.object({
    status: v.string(),
    orderId: PublicIdSchema,
    tsNs: v.pipe(
        v.bigint(),
        v.transform((v) => tsNsToMs(v)),
    ),
});

export type CancelOrderResult = v.InferOutput<typeof CancelOrderResultSchema>;

export const CancelAllOrdersInputSchema = v.object({
    subaccountId: optionalSubaccountIdInputSchema(),
    symbol: v.optional(v.pipe(v.string(), v.trim())),
    side: v.pipe(
        v.optional(SideSchema),
        v.transform((v) => (v ? OrderSideCodec.inputToProto[v] : undefined)),
    ),
    dryRun: v.optional(v.boolean(), false),
    maxOrders: v.optional(v.pipe(v.number(), v.integer(), v.gtValue(0))),
    requestId: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(64))),
});

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
    v.object({
        orderId: v.optional(v.pipe(v.string(), v.trim())),
        clientOrderId: v.optional(v.pipe(v.string(), v.trim())),
        subaccountId: optionalSubaccountIdInputSchema(),
        includeAttachedRisk: v.optional(v.boolean(), true),
        includeAttachedRiskState: v.optional(v.boolean(), true),
    }),
    v.check((input) => {
        const hasOrderId = (input.orderId ?? "").length > 0;
        const hasClientOrderId = (input.clientOrderId ?? "").length > 0;
        return hasOrderId !== hasClientOrderId;
    }, "Provide exactly one of orderId or clientOrderId"),
    v.transform(({ subaccountId, orderId, clientOrderId, ...rest }) => {
        const hasOrderId = (orderId ?? "").length > 0;
        const key = hasOrderId
            ? ({ case: "orderId", value: idToBigInt(orderId ?? "", "orderId") } as const)
            : ({ case: "clientOrderId", value: clientOrderId ?? "" } as const);
        return {
            ...rest,
            subaccountId,
            key,
        };
    }),
);

export type GetOrderDetailsInput = v.InferInput<typeof GetOrderDetailsInputSchema>;

export const CreateOrderResultSchema = v.object({
    status: v.string(),
    orderId: PublicIdSchema,
    clientOrderId: v.string(),
    tsNs: v.pipe(
        v.bigint(),
        v.transform((v) => tsNsToMs(v)),
    ),
    takeProfitTriggerId: OptionalPublicIdSchema,
    stopLossTriggerId: OptionalPublicIdSchema,
    trailingStopTriggerId: OptionalPublicIdSchema,
});

export type CreateOrderResult = v.InferOutput<typeof CreateOrderResultSchema>;
