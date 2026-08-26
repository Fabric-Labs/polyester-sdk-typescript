import { create } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as ProtoRead from "../../gen/orders/v1/orders_read_pb.js";
import * as ProtoWrite from "../../gen/orders/v1/orders_pb.js";
import { AccountCode, TransferCode } from "../../gen/ledger/v1/catalog_pb.js";
import type { EnrichedPairConfig } from "../../catalogs/index.js";
import { createCatalogSdkScales } from "../../shared/decimal-surface.js";
import { AUTH_STEP_UP_HEADER_NAME } from "../../shared/request-options.js";
import { createTestCatalog } from "../../testing/catalog.js";
import {
    realtimeClientStub,
    rejectingUnaryTransport,
    unaryTransportByMethod,
} from "../../testing/service-harness.js";
import { formatId } from "../../utils/base58-id.js";
import type { SubaccountResolver } from "../subaccount-resolver.js";
import { OrdersService } from "./orders.js";

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

const flushAsync = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function protoOrder(overrides: Partial<ProtoRead.Order> = {}): ProtoRead.Order {
    return {
        orderId: 11n,
        symbolId: 1,
        clientOrderId: "client-1",
        side: ProtoWrite.Side.BUY,
        status: ProtoRead.OrderStatus.WORKING,
        orderType: ProtoWrite.OrderType.LIMIT,
        timeInForce: ProtoWrite.TimeInForce.GTC,
        selfTradePreventionMode: ProtoWrite.SelfTradePreventionMode.EXPIRE_MAKER,
        feeAsset: ProtoWrite.FeeAsset.QUOTE,
        postOnly: false,
        origQtyScaled: 100_000_000n,
        cumQtyScaled: 0n,
        leavesQtyScaled: 100_000_000n,
        avgPriceTicks: 0n,
        priceTicks: 100_000_000n,
        createdTsNs: 1_000_000n,
        terminalTsNs: 0n,
        terminalReason: "",
        terminalReasonCode: 0,
        marketClientRefPriceTicks: 0n,
        marketMaxSlippageTicks: 0,
        marketMaxSlippageBps: 0,
        version: 3,
        batchRequestId: 0n,
        ...overrides,
    } as ProtoRead.Order;
}

describe("OrdersService", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("normalizes read requests, resolver defaults, and forwards signals", async () => {
        const controller = new AbortController();
        const resolver: SubaccountResolver = {
            getDefaultSubaccountId: () => "11",
        };
        const transport = unaryTransportByMethod({
            getOpenOrders: {
                orders: [protoOrder({ orderId: 11n }), protoOrder({ orderId: 12n, symbolId: 999 })],
                nextPageToken: "open-next",
            },
            getOrderHistory: {
                orders: [protoOrder({ orderId: 13n }), protoOrder({ orderId: 14n, symbolId: 999 })],
                nextPageToken: "history-next",
            },
        });
        const service = new OrdersService(
            transport.transport,
            realtimeClientStub().realtime,
            resolver,
            testScales(),
        );

        const cases = [
            {
                name: "listOpen",
                call: () =>
                    service.listOpen(
                        {
                            symbolId: [1],
                            triggerId: "22",
                            side: "buy",
                            limit: 25,
                            pageToken: " cursor ",
                            includeAttachedRiskState: true,
                        },
                        { signal: controller.signal },
                    ),
                expectedMethod: "getOpenOrders",
                expectedMessage: {
                    subaccountId: 11n,
                    symbolId: [1],
                    triggerId: 22n,
                    side: ProtoWrite.Side.BUY,
                    limit: 25,
                    pageToken: "cursor",
                    includeAttachedRisk: true,
                    includeAttachedRiskState: true,
                },
                expectedNextPageToken: "open-next",
            },
            {
                name: "listHistory",
                call: () =>
                    service.listHistory(
                        {
                            account: "main",
                            triggerId: "22",
                            status: "FILLED",
                            startTsNs: " 100 ",
                            endTsNs: "200",
                        },
                        { signal: controller.signal },
                    ),
                expectedMethod: "getOrderHistory",
                expectedMessage: {
                    status: ProtoRead.OrderStatus.FILLED,
                    triggerId: 22n,
                    startTsNs: 100n,
                    endTsNs: 200n,
                    includeAttachedRisk: true,
                    includeAttachedRiskState: false,
                },
                expectedNextPageToken: "history-next",
            },
        ];

        for (const testCase of cases) {
            const result = await testCase.call();
            const captured = transport.calls.find(
                (call) => call.method.localName === testCase.expectedMethod,
            );

            expect(result.nextPageToken).toBe(testCase.expectedNextPageToken);
            expect(result.orders).toHaveLength(1);
            expect(result.orders[0]?.symbolId).toBe(1);
            expect(captured?.method.localName).toBe(testCase.expectedMethod);
            expect(captured).toMatchObject({
                signal: controller.signal,
                message: testCase.expectedMessage,
            });
        }

        expect(
            transport.calls.find((call) => call.method.localName === "getOrderHistory")?.message,
        ).not.toHaveProperty("subaccountId");
    });

    it("converts decimal create inputs to wire scaled integers and forwards mutation options", async () => {
        const controller = new AbortController();
        const transport = unaryTransportByMethod({
            createOrder: {
                orderId: 11n,
                clientOrderId: "client-1",
                acceptedAt: { seconds: 1n, nanos: 250_000_000 },
                acceptedAtTsNs: 1_250_000_000n,
                resolvedBaseQtyScaled: 50_000_000n,
                submittedMaxQuoteDebitScaled: 125_500_000n,
            },
        });
        const service = new OrdersService(
            transport.transport,
            realtimeClientStub().realtime,
            undefined,
            testScales(),
        );

        await expect(
            service.create(
                {
                    account: { subaccountId: "11" },
                    symbolId: 1,
                    side: "buy",
                    qty: "0.5",
                    execution: {
                        type: "limit_gtc",
                        price: "100.25",
                        postOnly: true,
                    },
                    clientOrderId: " client-1 ",
                    feeAsset: "base",
                    selfTradePreventionMode: "expire_both",
                },
                { signal: controller.signal, stepUpToken: " fresh-token " },
            ),
        ).resolves.toMatchObject({
            clientOrderId: "client-1",
            acceptedAt: 1_250,
            acceptedAtNs: "1250000000",
            resolvedBaseQty: "0.5",
            submittedMaxQuoteDebit: "125.5",
        });

        const captured = transport.lastCall();
        expect(captured?.method.localName).toBe("createOrder");
        expect(captured?.signal).toBe(controller.signal);
        expect(new Headers(captured?.headers).get(AUTH_STEP_UP_HEADER_NAME)).toBe("fresh-token");
        expect(captured?.message).toMatchObject({
            subaccountId: 11n,
            order: {
                symbolId: 1,
                side: ProtoWrite.Side.BUY,
                sizing: {
                    case: "baseQtyScaled",
                    value: 50_000_000n,
                },
                execution: {
                    case: "limitGtc",
                    value: {
                        priceTicks: 100_250_000n,
                        postOnly: true,
                    },
                },
                clientOrderId: "client-1",
                feeAsset: ProtoWrite.FeeAsset.BASE,
                selfTradePreventionMode: ProtoWrite.SelfTradePreventionMode.EXPIRE_BOTH,
            },
        });
    });

    it("previews max-quote BUY sizing without creating an order", async () => {
        const transport = unaryTransportByMethod({
            previewOrder: {
                resolvedBaseQtyScaled: 50_000_000n,
                protectedPriceBoundTicks: 100_250_000n,
                evaluatedAt: { seconds: 1n, nanos: 250_000_000 },
                admissible: true,
            },
        });
        const service = new OrdersService(
            transport.transport,
            realtimeClientStub().realtime,
            undefined,
            testScales(),
        );

        await expect(
            service.preview({
                symbolId: 1,
                side: "buy",
                maxQuoteDebit: "125.5",
                execution: { type: "market_ioc" },
                feeAsset: "base",
            }),
        ).resolves.toMatchObject({
            resolvedBaseQty: "0.5",
            protectedPriceBound: "100.25",
            evaluatedAt: 1_250,
            admissible: true,
        });
        expect(transport.lastCall()).toMatchObject({
            method: { localName: "previewOrder" },
            message: {
                order: {
                    sizing: {
                        case: "maxQuoteDebitScaled",
                        value: 125_500_000n,
                    },
                    feeAsset: ProtoWrite.FeeAsset.BASE,
                },
            },
        });
    });

    it("rejects create inputs with excess decimal precision before calling the backend", async () => {
        const transport = unaryTransportByMethod({});
        const service = new OrdersService(
            transport.transport,
            realtimeClientStub().realtime,
            undefined,
            testScales(),
        );

        await expect(
            service.create({
                symbolId: 1,
                side: "buy",
                qty: "0.5",
                execution: {
                    type: "limit_gtc",
                    price: "100.0000001",
                },
            }),
        ).rejects.toThrow("execution.price supports at most 6 decimal places");
        expect(transport.unary).not.toHaveBeenCalled();
    });

    it("normalizes cancel and modify mutation payloads", async () => {
        const transport = unaryTransportByMethod({
            cancelOrder: {
                status: "cancelled",
                orderId: 22n,
                tsNs: 1_786_023_715_943_284_847n,
            },
            modifyOrder: {
                actionTaken: ProtoWrite.ModifyActionTaken.AMENDED,
                oldOrderId: 22n,
                finalOrderId: 22n,
                code: "ok",
                tsNs: 1_786_023_715_905_284_847n,
            },
        });
        const service = new OrdersService(
            transport.transport,
            realtimeClientStub().realtime,
            undefined,
            testScales(),
        );

        await expect(
            service.cancel({ orderId: "22", symbolId: 1, account: { subaccountId: "11" } }),
        ).resolves.toMatchObject({
            status: "cancelled",
            ts: 1_786_023_715_943,
            tsNs: "1786023715943284847",
        });
        await expect(
            service.cancel({
                clientOrderId: " client-1 ",
                symbolId: 1,
                account: { subaccountId: "11" },
            }),
        ).resolves.toMatchObject({
            status: "cancelled",
            ts: 1_786_023_715_943,
            tsNs: "1786023715943284847",
        });
        await expect(
            service.modify({
                clientOrderId: " client-1 ",
                symbolId: 1,
                requestId: " modify-1 ",
                newQty: "0.25",
                behavior: "AMEND_ONLY",
            }),
        ).resolves.toMatchObject({
            actionTaken: "AMENDED",
            code: "ok",
            ts: 1_786_023_715_905,
            tsNs: "1786023715905284847",
        });

        const cancelRequests = transport.calls.filter(
            (call) => call.method.localName === "cancelOrder",
        );
        expect(cancelRequests[0]?.message).toMatchObject({
            key: {
                case: "orderId",
                value: 22n,
            },
            symbolId: 1,
            subaccountId: 11n,
        });
        expect(cancelRequests[1]?.message).toMatchObject({
            key: {
                case: "clientOrderId",
                value: "client-1",
            },
            symbolId: 1,
            subaccountId: 11n,
        });
        const modifyMessage = transport.calls.find(
            (call) => call.method.localName === "modifyOrder",
        )?.message;
        expect(modifyMessage).toMatchObject({
            key: {
                case: "clientOrderId",
                value: "client-1",
            },
            requestId: "modify-1",
            newQtyScaled: 25_000_000n,
            behavior: ProtoWrite.ModifyBehavior.AMEND_ONLY,
            newClientOrderId: "",
            symbolId: 1,
        });
    });

    it("generates a request ID for cancelAll when omitted", async () => {
        const transport = unaryTransportByMethod({
            cancelAllOrders: {
                status: "ok",
                matchedOrders: 2,
                submittedCancels: 2,
                failedCancels: 0,
                tsNs: 1_000_000n,
            },
        });
        const service = new OrdersService(
            transport.transport,
            realtimeClientStub().realtime,
            undefined,
            testScales(),
        );

        await expect(service.cancelAll({ symbolId: 1 })).resolves.toMatchObject({
            status: "ok",
            matchedOrders: 2,
            submittedCancels: 2,
            failedCancels: 0,
            ts: 1,
        });

        const request = transport.lastCall()?.message;
        expect(request).toMatchObject({
            symbolId: 1,
        });
        expect(request?.requestId).toEqual(expect.any(String));
        const requestId = request?.requestId as string;
        expect(requestId.length).toBeGreaterThan(0);
    });

    it("preserves a caller-provided request ID for cancelAll", async () => {
        const transport = unaryTransportByMethod({
            cancelAllOrders: {
                status: "ok",
                matchedOrders: 0,
                submittedCancels: 0,
                failedCancels: 0,
                tsNs: 1_000_000n,
            },
        });
        const service = new OrdersService(
            transport.transport,
            realtimeClientStub().realtime,
            undefined,
            testScales(),
        );

        await service.cancelAll({ requestId: " retry-cancel-all-1 " });

        const request = transport.lastCall()?.message;
        expect(request?.requestId).toBe("retry-cancel-all-1");
    });

    it("exposes batch create with shared account scope and decimal item conversion", async () => {
        const controller = new AbortController();
        const transport = unaryTransportByMethod({
            batchCreateOrders: {
                results: [
                    {
                        clientOrderId: "order-a",
                        outcome: {
                            case: "accepted",
                            value: {
                                orderId: 11n,
                                resolvedBaseQtyScaled: 50_000_000n,
                                submittedMaxQuoteDebitScaled: 125_500_000n,
                            },
                        },
                    },
                ],
                acceptedCount: 1,
                rejectedCount: 0,
                tsNs: 1_000_000_123n,
            },
        });
        const service = new OrdersService(
            transport.transport,
            realtimeClientStub().realtime,
            undefined,
            testScales(),
        );

        await expect(
            service.batchCreate(
                {
                    account: { subaccountId: "11" },
                    requestId: " batch-create-1 ",
                    items: [
                        {
                            symbolId: 1,
                            side: "buy",
                            qty: "0.5",
                            execution: { type: "limit_gtc", price: "100.25" },
                            clientOrderId: "order-a",
                        },
                    ],
                },
                { signal: controller.signal, stepUpToken: " fresh-token " },
            ),
        ).resolves.toMatchObject({
            results: [
                {
                    status: "accepted",
                    clientOrderId: "order-a",
                    resolvedBaseQty: "0.5",
                    submittedMaxQuoteDebit: "125.5",
                },
            ],
            acceptedCount: 1,
            rejectedCount: 0,
            ts: 1_000,
            tsNs: "1000000123",
        });

        const call = transport.lastCall();
        expect(call?.method.localName).toBe("batchCreateOrders");
        expect(call?.signal).toBe(controller.signal);
        expect(new Headers(call?.headers).get(AUTH_STEP_UP_HEADER_NAME)).toBe("fresh-token");
        expect(call?.message).toMatchObject({
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
            ],
        });
    });

    it("exposes batch-replace admission and durable status APIs", async () => {
        const transport = unaryTransportByMethod({
            batchReplaceOrders: {
                batchRequestId: 21n,
                status: ProtoWrite.BatchReplaceAdmissionStatus.ADMITTED,
                results: [
                    {
                        itemIndex: 0,
                        status: ProtoWrite.BatchReplaceItemAdmissionStatus.ADMITTED,
                        oldOrderId: 11n,
                        replacementOrderId: 12n,
                        clientOrderId: "order-a-v2",
                        code: "",
                    },
                ],
                acceptedCount: 1,
                rejectedCount: 0,
                acceptedTsNs: 2_000_000_123n,
            },
            getBatchReplaceStatus: {
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
                        updatedTsNs: 3_000_000_456n,
                    },
                ],
                acceptedCount: 1,
                rejectedCount: 0,
                acceptedTsNs: 2_000_000_123n,
                updatedTsNs: 3_000_000_456n,
            },
        });
        const service = new OrdersService(
            transport.transport,
            realtimeClientStub().realtime,
            undefined,
            testScales(),
        );

        await expect(
            service.batchReplace({
                account: { subaccountId: "11" },
                symbolId: 1,
                requestId: "batch-replace-1",
                items: [
                    {
                        clientOrderId: "order-a",
                        newQty: "0.25",
                        newClientOrderId: "order-a-v2",
                    },
                ],
            }),
        ).resolves.toMatchObject({
            batchRequestId: formatId(21n),
            status: "admitted",
            results: [{ itemIndex: 0, status: "admitted" }],
            acceptedTsNs: "2000000123",
        });

        expect(transport.lastCall()).toMatchObject({
            method: { localName: "batchReplaceOrders" },
            message: {
                subaccountId: 11n,
                symbolId: 1,
                requestId: "batch-replace-1",
                items: [
                    {
                        key: { case: "clientOrderId", value: "order-a" },
                        newQtyScaled: 25_000_000n,
                        newClientOrderId: "order-a-v2",
                    },
                ],
            },
        });

        await expect(
            service.getBatchReplaceStatus({
                account: { subaccountId: "11" },
                batchRequestId: "21",
            }),
        ).resolves.toMatchObject({
            batchRequestId: formatId(21n),
            admissionStatus: "admitted",
            items: [{ itemIndex: 0, phase: "working", orderStatus: "working" }],
            acceptedTsNs: "2000000123",
            updatedTsNs: "3000000456",
        });
        expect(transport.lastCall()).toMatchObject({
            method: { localName: "getBatchReplaceStatus" },
            message: { subaccountId: 11n, batchRequestId: 21n },
        });
    });

    it("exposes batch cancel with exactly-one-key item encoding", async () => {
        const transport = unaryTransportByMethod({
            batchCancelOrders: {
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
                    },
                ],
                acceptedCount: 1,
                rejectedCount: 1,
                tsNs: 3_000_000_123n,
            },
        });
        const service = new OrdersService(
            transport.transport,
            realtimeClientStub().realtime,
            undefined,
            testScales(),
        );

        await expect(
            service.batchCancel({
                requestId: "batch-cancel-1",
                items: [{ orderId: "11", symbolId: 1 }, { clientOrderId: "order-b" }],
            }),
        ).resolves.toMatchObject({
            results: [
                { status: "accepted" },
                {
                    status: "rejected",
                    orderId: undefined,
                    clientOrderId: "order-b",
                    code: "ORDER_NOT_FOUND",
                },
            ],
            acceptedCount: 1,
            rejectedCount: 1,
            tsNs: "3000000123",
        });

        expect(transport.lastCall()).toMatchObject({
            method: { localName: "batchCancelOrders" },
            message: {
                requestId: "batch-cancel-1",
                items: [{ orderId: 11n, symbolId: 1 }, { clientOrderId: "order-b" }],
            },
        });
    });

    it("exposes cancelAllAfter and generates its wire-required request ID", async () => {
        const resolver: SubaccountResolver = {
            getDefaultSubaccountId: () => "11",
        };
        const transport = unaryTransportByMethod({
            cancelAllAfter: {
                status: "armed",
                effectiveTimeoutSec: 15,
                expiresAtTsNs: 20_000_000_456n,
                tsNs: 5_000_000_123n,
            },
        });
        const service = new OrdersService(
            transport.transport,
            realtimeClientStub().realtime,
            resolver,
            testScales(),
        );

        await expect(
            service.cancelAllAfter({
                timeoutSec: 15,
                symbolId: 1,
                side: "sell",
            }),
        ).resolves.toEqual({
            status: "armed",
            effectiveTimeoutSec: 15,
            expiresAt: 20_000,
            expiresAtNs: "20000000456",
            ts: 5_000,
            tsNs: "5000000123",
        });

        const call = transport.lastCall();
        expect(call?.method.localName).toBe("cancelAllAfter");
        expect(call?.message).toMatchObject({
            subaccountId: 11n,
            timeoutSec: 15,
            symbolId: 1,
            side: ProtoWrite.Side.SELL,
        });
        expect(call?.message.requestId).toEqual(expect.any(String));
    });

    it("rejects a batch response that omits per-item outcomes", async () => {
        const transport = unaryTransportByMethod({
            batchCancelOrders: {
                results: [],
                acceptedCount: 0,
                rejectedCount: 0,
                tsNs: 1_000_000n,
            },
        });
        const service = new OrdersService(
            transport.transport,
            realtimeClientStub().realtime,
            undefined,
            testScales(),
        );

        await expect(service.batchCancel({ items: [{ orderId: "11" }] })).rejects.toThrow(
            "batchCancel returned 0 results for 1 requested items",
        );
    });

    it("returns null when get order details response omits the order", async () => {
        const transport = unaryTransportByMethod({ getOrder: {} });
        const service = new OrdersService(
            transport.transport,
            realtimeClientStub().realtime,
            undefined,
            testScales(),
        );

        await expect(service.getDetails({ clientOrderId: " client-1 " })).resolves.toBeNull();

        const request = transport.lastCall()?.message;
        expect(request).toMatchObject({
            includeAttachedRisk: true,
            includeAttachedRiskState: true,
            key: {
                case: "clientOrderId",
                value: "client-1",
            },
        });
    });

    it("returns null when the backend reports that the order was not found", async () => {
        const service = new OrdersService(
            rejectingUnaryTransport(new ConnectError("order not found", Code.Unknown)),
            realtimeClientStub().realtime,
            undefined,
            testScales(),
        );

        await expect(service.getDetails({ orderId: "11" })).resolves.toBeNull();
    });

    it.each([
        ["NotFound status", new ConnectError("missing", Code.NotFound)],
        [
            "structured order error",
            new ConnectError("missing", Code.Unknown, undefined, [
                {
                    desc: ProtoWrite.ErrorDetailSchema,
                    value: create(ProtoWrite.ErrorDetailSchema, {
                        code: ProtoWrite.ErrorCode.NOT_FOUND,
                    }),
                },
            ]),
        ],
    ])("returns null for a stable %s", async (_name, error) => {
        const service = new OrdersService(
            rejectingUnaryTransport(error),
            realtimeClientStub().realtime,
            undefined,
            testScales(),
        );

        await expect(service.getDetails({ orderId: "11" })).resolves.toBeNull();
    });

    it("preserves unrelated get order failures", async () => {
        const service = new OrdersService(
            rejectingUnaryTransport(new ConnectError("database unavailable", Code.Unknown)),
            realtimeClientStub().realtime,
            undefined,
            testScales(),
        );

        await expect(service.getDetails({ orderId: "11" })).rejects.toThrow("database unavailable");
    });

    it("parses populated order details responses to decimal strings", async () => {
        const transport = unaryTransportByMethod({
            getOrder: {
                order: protoOrder({ status: ProtoRead.OrderStatus.FILLED }),
                trades: [
                    {
                        orderId: 11n,
                        symbolId: 1,
                        matchId: 5n,
                        side: ProtoWrite.Side.BUY,
                        isMaker: true,
                        priceTicks: 100_000_000n,
                        qtyScaled: 50_000_000n,
                        feeAmountE18: { hi: 0n, lo: 1_250_000_000_000_000n },
                        feeAsset: ProtoWrite.FeeAsset.QUOTE,
                        referralShareAmountE18: { hi: 0n, lo: 250_000_000_000_000n },
                        tsNs: 1_000_000n,
                        feeIsRebate: true,
                    },
                ],
                transfers: [
                    {
                        txId: "tx-1",
                        matchId: 5n,
                        assetId: 1,
                        amountE18: { hi: 0n, lo: 1_500_000_000_000_000_000n },
                        isDebit: false,
                        transferCode: TransferCode.INTERNAL_TRANSFER,
                        accountCode: AccountCode.TRADING,
                        tsNs: 1_000_000n,
                    },
                ],
            },
        });
        const service = new OrdersService(
            transport.transport,
            realtimeClientStub().realtime,
            undefined,
            testScales(),
        );

        await expect(service.getDetails({ orderId: "11" })).resolves.toMatchObject({
            order: {
                clientOrderId: "client-1",
                symbolId: 1,
                status: "filled",
                origQty: "1",
                price: "100",
            },
            trades: [
                expect.objectContaining({
                    orderId: formatId(11n),
                    matchId: "5",
                    fee: "0.00125",
                    referralShare: "0.00025",
                    feeIsRebate: true,
                }),
            ],
            transfers: [
                expect.objectContaining({
                    txId: "tx-1",
                    assetId: 1,
                    // BTC (ledgerId 1) quantityScale 8: 150000000n -> "1.5".
                    amount: "1.5",
                }),
            ],
        });
    });

    it("uses private order channels and parses realtime publications", async () => {
        const realtime = realtimeClientStub();
        const service = new OrdersService(
            unaryTransportByMethod({}).transport,
            realtime.realtime,
            undefined,
            testScales(),
        );
        const onEvent = vi.fn();
        const onOpen = vi.fn();
        const onClose = vi.fn();
        const onError = vi.fn();

        const unsubscribe = service.subscribe({
            accountId: "account-1",
            onEvent,
            onOpen,
            onClose,
            onError,
        });

        expect(realtime.params?.channel).toBe("private:spot:orders:account-1:proto");
        expect(realtime.params?.schema).toBe(ProtoRead.OrderSchema);
        realtime.params?.onConnected?.();
        realtime.params?.onDisconnected?.();
        realtime.params?.onError?.({
            channel: "channel",
            type: "transport",
            error: { code: 0, message: "boom" },
        });
        realtime.params?.onPublication(protoOrder({ status: ProtoRead.OrderStatus.FILLED }));
        await flushAsync();

        expect(onOpen).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onError).toHaveBeenCalledWith({
            channel: "channel",
            type: "transport",
            error: { code: 0, message: "boom" },
        });
        expect(onEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                clientOrderId: "client-1",
                symbolId: 1,
                status: "filled",
                origQty: "1",
                price: "100",
            }),
        );

        unsubscribe();
        expect(realtime.unsubscribe).toHaveBeenCalledTimes(1);
    });

    it("rejects malformed backend payloads and routes malformed publications to onError", async () => {
        const transport = unaryTransportByMethod({
            getOpenOrders: {
                orders: [protoOrder({ status: 999 as ProtoRead.OrderStatus })],
                nextPageToken: "",
            },
        });
        const service = new OrdersService(
            transport.transport,
            realtimeClientStub().realtime,
            undefined,
            testScales(),
        );

        await expect(service.listOpen()).rejects.toThrow();

        const realtime = realtimeClientStub();
        const onEvent = vi.fn();
        const onError = vi.fn();
        const subscriptionService = new OrdersService(
            unaryTransportByMethod({}).transport,
            realtime.realtime,
            undefined,
            testScales(),
        );
        subscriptionService.subscribe({ accountId: "account-1", onEvent, onError });

        realtime.params?.onPublication(protoOrder({ status: 999 as ProtoRead.OrderStatus }));
        await flushAsync();

        expect(onEvent).not.toHaveBeenCalled();
        expect(onError).toHaveBeenCalledWith(
            expect.objectContaining({
                channel: "private:spot:orders:account-1:proto",
                type: "publication_handler",
            }),
        );
    });
});
