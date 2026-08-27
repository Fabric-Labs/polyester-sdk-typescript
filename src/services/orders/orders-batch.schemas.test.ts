import { describe, expect, it } from "vitest";
import * as v from "valibot";
import * as ProtoRead from "../../gen/orders/v1/orders_read_pb.js";
import * as ProtoWrite from "../../gen/orders/v1/orders_pb.js";
import * as ProtoRateLimit from "../../gen/polyester/ratelimit/v1/types_pb.js";
import type { EnrichedPairConfig } from "../../catalogs/index.js";
import { createCatalogSdkScales } from "../../shared/decimal-surface.js";
import { PROTOBUF_UINT32_MAX } from "../../shared/wire-bounds.js";
import { createTestCatalog } from "../../testing/catalog.js";
import { formatId } from "../../utils/base58-id.js";
import {
    BatchCancelOrdersInputSchema,
    BatchCancelOrdersResultSchema,
    BatchReplaceOrdersResultSchema,
    CancelAllAfterInputSchema,
    CancelAllAfterResultSchema,
    GetBatchReplaceStatusInputSchema,
    GetBatchReplaceStatusResultSchema,
    createBatchCreateOrdersInputSchema,
    createBatchCreateOrdersResultSchema,
    createBatchReplaceOrdersInputSchema,
} from "./orders-batch.schemas.js";

const btc = {
    symbol: "BTC",
    ledgerId: 1,
    name: "Bitcoin",
    quantityDisplayDecimals: 8,
    quantityScale: 8,
};
const usdt = {
    symbol: "USDT",
    ledgerId: 2,
    name: "Tether",
    quantityDisplayDecimals: 2,
    quantityScale: 6,
};
const btcUsdt: EnrichedPairConfig = {
    symbolId: 1,
    symbol: "BTC-USDT",
    baseAsset: btc,
    quoteAsset: usdt,
    tickSize: "0.000001",
    stepSize: "0.00000001",
    minNotionalQuote: "1",
    minQtyBase: "0.00000001",
    allowBuyFeeFromBase: true,
    defaultMarketSlippagePctBuy: 0,
    defaultMarketSlippagePctSell: 0,
    maxClientRefDriftPct: 0,
    listingAt: null,
    delistingAt: null,
    status: "enabled",
};

function testScales() {
    const catalog = createTestCatalog({ pairs: [btcUsdt] });
    return createCatalogSdkScales(() => catalog);
}

function limitOrder(clientOrderId: string) {
    return {
        symbolId: 1,
        side: "buy" as const,
        qty: "0.5",
        execution: {
            type: "limit_gtc" as const,
            price: "100.25",
        },
        clientOrderId,
    };
}

describe("CancelAllAfter schemas", () => {
    it.each([0, 10, 120])("accepts timeoutSec %s", (timeoutSec) => {
        expect(
            v.parse(CancelAllAfterInputSchema, {
                account: { subaccountId: "11" },
                timeoutSec,
                symbolId: 1,
                side: "sell",
                requestId: " caa-1 ",
            }),
        ).toEqual({
            subaccountId: 11n,
            timeoutSec,
            symbolId: 1,
            side: ProtoWrite.Side.SELL,
            requestId: "caa-1",
        });
    });

    it("accepts the uint32 symbol ID ceiling and rejects invalid IDs", () => {
        expect(
            v.parse(CancelAllAfterInputSchema, {
                timeoutSec: 10,
                symbolId: PROTOBUF_UINT32_MAX,
            }).symbolId,
        ).toBe(PROTOBUF_UINT32_MAX);
        expect(() => v.parse(CancelAllAfterInputSchema, { timeoutSec: 10, symbolId: 0 })).toThrow();
        expect(() =>
            v.parse(CancelAllAfterInputSchema, {
                timeoutSec: 10,
                symbolId: PROTOBUF_UINT32_MAX + 1,
            }),
        ).toThrow();
        expect(() =>
            v.parse(CancelAllAfterInputSchema, {
                timeoutSec: 10,
                symbol: "BTC-USDT",
            }),
        ).toThrow();
    });

    it.each([1, 9, 10.5, 121])("rejects timeoutSec %s", (timeoutSec) => {
        expect(() => v.parse(CancelAllAfterInputSchema, { timeoutSec })).toThrow();
    });

    it("normalizes dead-man timestamps without losing nanosecond precision", () => {
        expect(
            v.parse(CancelAllAfterResultSchema, {
                status: "armed",
                effectiveTimeoutSec: 15,
                expiresAtTsNs: 1_234_567_890n,
                tsNs: 1_000_000_999n,
            }),
        ).toEqual({
            status: "armed",
            effectiveTimeoutSec: 15,
            expiresAt: 1_234,
            expiresAtNs: "1234567890",
            ts: 1_000,
            tsNs: "1000000999",
        });
    });
});

describe("batch create schemas", () => {
    it("reuses the single-order decimal contract for every item", () => {
        const input = v.parse(createBatchCreateOrdersInputSchema(testScales()), {
            account: { subaccountId: "11" },
            requestId: " batch-create-1 ",
            items: [limitOrder("order-a"), limitOrder("order-b")],
        });

        expect(input).toMatchObject({
            subaccountId: 11n,
            requestId: "batch-create-1",
            items: [
                {
                    symbolId: 1,
                    sizing: {
                        case: "baseQtyScaled",
                        value: 50_000_000n,
                    },
                    execution: {
                        case: "limitGtc",
                        value: { priceTicks: 100_250_000n },
                    },
                },
                {
                    symbolId: 1,
                    sizing: {
                        case: "baseQtyScaled",
                        value: 50_000_000n,
                    },
                },
            ],
        });
    });

    it("preserves max-quote sizing as an order-intent oneof", () => {
        const input = v.parse(createBatchCreateOrdersInputSchema(testScales()), {
            items: [
                {
                    symbolId: 1,
                    side: "buy",
                    maxQuoteDebit: "125.5",
                    execution: { type: "market_ioc" },
                    clientOrderId: "order-a",
                },
            ],
        });

        expect(input.items[0]?.sizing).toEqual({
            case: "maxQuoteDebitScaled",
            value: 125_500_000n,
        });
    });

    it("enforces the 1–20 item contract", () => {
        const schema = createBatchCreateOrdersInputSchema(testScales());

        expect(() => v.parse(schema, { items: [] })).toThrow();
        expect(() =>
            v.parse(schema, {
                items: Array.from({ length: 21 }, (_, index) => limitOrder(`order-${index}`)),
            }),
        ).toThrow();
    });

    it("enforces the protobuf client-order ID contract", () => {
        const schema = createBatchCreateOrdersInputSchema(testScales());

        expect(() => v.parse(schema, { items: [limitOrder("invalid id")] })).toThrow(
            "clientOrderId has an invalid format",
        );
        expect(() => v.parse(schema, { items: [limitOrder("x".repeat(37))] })).toThrow();
    });

    it("rejects duplicate non-empty client-order IDs while allowing empty or omitted IDs", () => {
        const schema = createBatchCreateOrdersInputSchema(testScales());

        expect(() =>
            v.parse(schema, {
                items: [limitOrder(" order-a "), limitOrder("order-a")],
            }),
        ).toThrow("Each non-empty batch create clientOrderId must be unique");
        expect(() =>
            v.parse(schema, {
                items: [limitOrder(""), { ...limitOrder("order-b"), clientOrderId: undefined }],
            }),
        ).not.toThrow();
    });

    it("surfaces rejections that carry no structured error detail", () => {
        const result = v.parse(createBatchCreateOrdersResultSchema(testScales(), [1]), {
            results: [
                {
                    clientOrderId: "order-a",
                    outcome: { case: "rejected", value: {} },
                },
            ],
            acceptedCount: 0,
            rejectedCount: 1,
            tsNs: 2_000_000_123n,
        });

        expect(result.results[0]).toEqual({
            status: "rejected",
            clientOrderId: "order-a",
            error: undefined,
        });
    });

    it("returns ordered discriminated outcomes and exact timestamps", () => {
        expect(
            v.parse(createBatchCreateOrdersResultSchema(testScales(), [1, 1]), {
                results: [
                    {
                        clientOrderId: "order-a",
                        outcome: {
                            case: "accepted",
                            value: {
                                orderId: 11n,
                                takeProfitTriggerId: 12n,
                                resolvedBaseQtyScaled: 50_000_000n,
                                submittedMaxQuoteDebitScaled: 125_500_000n,
                            },
                        },
                    },
                    {
                        clientOrderId: "order-b",
                        outcome: {
                            case: "rejected",
                            value: {
                                error: {
                                    code: ProtoWrite.ErrorCode.BAD_QTY,
                                    violations: [
                                        {
                                            fieldPath: "items[1].qty_scaled",
                                            ruleId: "gt",
                                            message: "must be positive",
                                        },
                                    ],
                                },
                            },
                        },
                    },
                ],
                acceptedCount: 1,
                rejectedCount: 1,
                tsNs: 2_000_000_123n,
            }),
        ).toEqual({
            results: [
                {
                    status: "accepted",
                    clientOrderId: "order-a",
                    orderId: formatId(11n),
                    takeProfitTriggerId: formatId(12n),
                    stopLossTriggerId: undefined,
                    trailingStopTriggerId: undefined,
                    resolvedBaseQty: "0.5",
                    submittedMaxQuoteDebit: "125.5",
                },
                {
                    status: "rejected",
                    clientOrderId: "order-b",
                    error: {
                        code: "BAD_QTY",
                        violations: [
                            {
                                fieldPath: "items[1].qty_scaled",
                                ruleId: "gt",
                                message: "must be positive",
                            },
                        ],
                    },
                },
            ],
            acceptedCount: 1,
            rejectedCount: 1,
            ts: 2_000,
            tsNs: "2000000123",
        });
    });
});

describe("batch replace schemas", () => {
    it("encodes same-symbol replacement targets and decimal patches", () => {
        const input = v.parse(createBatchReplaceOrdersInputSchema(testScales(), 1), {
            account: { subaccountId: "11" },
            symbolId: 1,
            requestId: " batch-replace-1 ",
            items: [
                {
                    orderId: "11",
                    newPrice: "101.5",
                    newQty: "0.25",
                },
                {
                    clientOrderId: "order-b",
                    clearRisk: true,
                    newClientOrderId: "order-b-v2",
                },
            ],
        });

        expect(input).toMatchObject({
            subaccountId: 11n,
            symbolId: 1,
            requestId: "batch-replace-1",
        });
        expect(input.items).toMatchObject([
            {
                key: { case: "orderId", value: 11n },
                newPriceTicks: 101_500_000n,
                newQtyScaled: 25_000_000n,
                newClientOrderId: "",
            },
            {
                key: { case: "clientOrderId", value: "order-b" },
                newAttachedRisk: {},
                newClientOrderId: "order-b-v2",
            },
        ]);
    });

    it("enforces the symbol, target, patch, uniqueness, and 1–50 item contract", () => {
        const schema = createBatchReplaceOrdersInputSchema(testScales(), 1);
        const item = {
            orderId: "11",
            newQty: "0.25",
        };

        expect(() => v.parse(schema, { symbolId: 2, items: [item] })).toThrow();
        expect(() => v.parse(schema, { symbolId: 1, items: [] })).toThrow();
        expect(() => v.parse(schema, { symbolId: 1, items: [{ orderId: "11" }] })).toThrow();
        expect(() =>
            v.parse(schema, {
                symbolId: 1,
                items: [{ orderId: "11", clientOrderId: "order-a", newQty: "0.25" }],
            }),
        ).toThrow();
        expect(() => v.parse(schema, { symbolId: 1, items: [item, item] })).toThrow(
            "Each batch replace target must be unique",
        );
        expect(() =>
            v.parse(schema, {
                symbolId: 1,
                items: Array.from({ length: 51 }, (_, index) => ({
                    orderId: String(index + 1),
                    newQty: "0.25",
                })),
            }),
        ).toThrow();
        expect(() =>
            v.parse(schema, {
                symbolId: 1,
                items: [{ orderId: "0", newQty: "0.25" }],
            }),
        ).toThrow();
    });

    it("normalizes admission receipts and validates counts and item order", () => {
        const response = {
            batchRequestId: 21n,
            status: ProtoWrite.BatchReplaceAdmissionStatus.PARTIALLY_ADMITTED,
            results: [
                {
                    itemIndex: 0,
                    status: ProtoWrite.BatchReplaceItemAdmissionStatus.ADMITTED,
                    oldOrderId: 11n,
                    replacementOrderId: 12n,
                    clientOrderId: "order-a-v2",
                    code: "",
                },
                {
                    itemIndex: 1,
                    status: ProtoWrite.BatchReplaceItemAdmissionStatus.REJECTED,
                    oldOrderId: 13n,
                    replacementOrderId: 0n,
                    clientOrderId: "order-b",
                    code: "INVALID_ORDER_STATE",
                    error: {
                        code: ProtoWrite.ErrorCode.RATE_LIMIT_EXCEEDED,
                        violations: [],
                        rateLimit: {
                            reason: ProtoRateLimit.FailureReason.QUOTA_EXCEEDED,
                            limit: 20n,
                            remaining: 0n,
                            retryAfterMs: 500n,
                            operationId: "orders.batch_replace",
                            policyClass: ProtoRateLimit.PolicyClass.TRADING_PLACE,
                            scope: ProtoRateLimit.LimiterScope.SUBACCOUNT,
                            refillModel: ProtoRateLimit.RefillModel.CONTINUOUS,
                        },
                    },
                },
            ],
            acceptedCount: 1,
            rejectedCount: 1,
            acceptedTsNs: 3_000_000_456n,
        };

        expect(v.parse(BatchReplaceOrdersResultSchema, response)).toEqual({
            batchRequestId: formatId(21n),
            status: "partially_admitted",
            results: [
                {
                    itemIndex: 0,
                    status: "admitted",
                    oldOrderId: formatId(11n),
                    replacementOrderId: formatId(12n),
                    clientOrderId: "order-a-v2",
                    code: undefined,
                },
                {
                    itemIndex: 1,
                    status: "rejected",
                    oldOrderId: formatId(13n),
                    replacementOrderId: undefined,
                    clientOrderId: "order-b",
                    code: "INVALID_ORDER_STATE",
                    error: {
                        code: "RATE_LIMIT_EXCEEDED",
                        violations: [],
                        rateLimit: {
                            reason: "quota_exceeded",
                            limit: "20",
                            remaining: "0",
                            retryAfterMs: "500",
                            policyVersion: undefined,
                            operationId: "orders.batch_replace",
                            policyClass: "trading_place",
                            scope: "subaccount",
                            refillModel: "continuous",
                        },
                    },
                },
            ],
            acceptedCount: 1,
            rejectedCount: 1,
            acceptedTs: 3_000,
            acceptedTsNs: "3000000456",
        });
        expect(() =>
            v.parse(BatchReplaceOrdersResultSchema, { ...response, acceptedCount: 2 }),
        ).toThrow("Batch replace result counts do not match");
        expect(() =>
            v.parse(BatchReplaceOrdersResultSchema, {
                ...response,
                results: [response.results[1], response.results[0]],
            }),
        ).toThrow("Batch replace results must preserve request item order");
        expect(() =>
            v.parse(BatchReplaceOrdersResultSchema, {
                ...response,
                status: 999,
            }),
        ).toThrow();
    });

    it("normalizes durable status reads and validates their batch identity", () => {
        expect(
            v.parse(GetBatchReplaceStatusInputSchema, {
                account: { subaccountId: "11" },
                batchRequestId: "21",
            }),
        ).toEqual({ subaccountId: 11n, batchRequestId: 21n });
        expect(() => v.parse(GetBatchReplaceStatusInputSchema, { batchRequestId: "0" })).toThrow();

        const response = {
            batchRequestId: 21n,
            admissionStatus: ProtoWrite.BatchReplaceAdmissionStatus.ADMITTED,
            items: [
                {
                    itemIndex: 0,
                    phase: ProtoRead.BatchReplacePhase.WORKING,
                    oldOrderId: 11n,
                    replacementOrderId: 12n,
                    orderStatus: ProtoRead.OrderStatus.WORKING,
                    code: "",
                    updatedTsNs: 4_000_000_123n,
                },
            ],
            acceptedCount: 1,
            rejectedCount: 0,
            acceptedTsNs: 3_000_000_456n,
            updatedTsNs: 4_000_000_123n,
        };

        expect(v.parse(GetBatchReplaceStatusResultSchema, response)).toEqual({
            batchRequestId: formatId(21n),
            admissionStatus: "admitted",
            items: [
                {
                    itemIndex: 0,
                    phase: "working",
                    oldOrderId: formatId(11n),
                    replacementOrderId: formatId(12n),
                    orderStatus: "working",
                    code: undefined,
                    updatedTs: 4_000,
                    updatedTsNs: "4000000123",
                },
            ],
            acceptedCount: 1,
            rejectedCount: 0,
            acceptedTs: 3_000,
            acceptedTsNs: "3000000456",
            updatedTs: 4_000,
            updatedTsNs: "4000000123",
        });
        expect(() =>
            v.parse(GetBatchReplaceStatusResultSchema, {
                ...response,
                items: [{ ...response.items[0], phase: 999 }],
            }),
        ).toThrow();
    });
});

describe("batch cancel schemas", () => {
    it("requires exactly one key and converts public order IDs", () => {
        expect(
            v.parse(BatchCancelOrdersInputSchema, {
                requestId: "batch-cancel-1",
                items: [{ orderId: "11", symbolId: 1 }, { clientOrderId: "order-b" }],
            }),
        ).toMatchObject({
            requestId: "batch-cancel-1",
            items: [{ orderId: 11n, symbolId: 1 }, { clientOrderId: "order-b" }],
        });

        expect(() =>
            v.parse(BatchCancelOrdersInputSchema, {
                items: [{ orderId: "11", clientOrderId: "order-a" }],
            }),
        ).toThrow();
        expect(() =>
            v.parse(BatchCancelOrdersInputSchema, {
                items: [{}],
            }),
        ).toThrow();
        expect(() =>
            v.parse(BatchCancelOrdersInputSchema, {
                items: [{ orderId: "0" }],
            }),
        ).toThrow();
    });

    it("enforces the 1–50 item contract", () => {
        expect(() => v.parse(BatchCancelOrdersInputSchema, { items: [] })).toThrow();
        expect(() =>
            v.parse(BatchCancelOrdersInputSchema, {
                items: Array.from({ length: 51 }, (_, index) => ({
                    orderId: String(index + 1),
                })),
            }),
        ).toThrow();
    });

    it("normalizes accepted and rejected results", () => {
        expect(
            v.parse(BatchCancelOrdersResultSchema, {
                results: [
                    {
                        status: "accepted",
                        orderId: 11n,
                        clientOrderId: "",
                        code: "",
                    },
                    {
                        status: "rejected",
                        orderId: 0n,
                        clientOrderId: "order-b",
                        code: "ORDER_NOT_FOUND",
                        error: {
                            code: ProtoWrite.ErrorCode.NOT_FOUND,
                            violations: [],
                        },
                    },
                ],
                acceptedCount: 1,
                rejectedCount: 1,
                tsNs: 4_000_000_789n,
            }),
        ).toEqual({
            results: [
                {
                    status: "accepted",
                    orderId: formatId(11n),
                    clientOrderId: "",
                    code: "",
                },
                {
                    status: "rejected",
                    orderId: undefined,
                    clientOrderId: "order-b",
                    code: "ORDER_NOT_FOUND",
                    error: {
                        code: "NOT_FOUND",
                        violations: [],
                        rateLimit: undefined,
                    },
                },
            ],
            acceptedCount: 1,
            rejectedCount: 1,
            ts: 4_000,
            tsNs: "4000000789",
        });
    });
});
