import type { Transport } from "@connectrpc/connect";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setEnrichedPairCatalog } from "../../catalogs/market-data-catalog.js";
import * as ProtoRead from "../../gen/orders/v1/orders_read_pb.js";
import * as ProtoWrite from "../../gen/orders/v1/orders_pb.js";
import type { RealtimeClient } from "../../realtime/client.js";
import { AUTH_STEP_UP_HEADER_NAME } from "../../shared/request-options.js";
import type { SubaccountResolver } from "../subaccount-resolver.js";
import { OrdersService } from "./orders.js";

type CapturedUnary = {
    method: string;
    signal: AbortSignal | undefined;
    headers: HeadersInit | undefined;
    message: Record<string, unknown>;
};

function transportWithResponses(
    responses: Record<string, Record<string, unknown>>,
    capture?: (call: CapturedUnary) => void,
): Transport {
    return {
        unary: vi.fn(
            async (
                method: { localName: string },
                signal: AbortSignal | undefined,
                _timeoutMs: number | undefined,
                headers: HeadersInit | undefined,
                message: Record<string, unknown>,
            ) => {
                capture?.({
                    method: method.localName,
                    signal,
                    headers,
                    message,
                });
                return {
                    message: responses[method.localName] ?? {},
                    header: new Headers(),
                    trailer: new Headers(),
                    stream: false,
                    service: undefined,
                    method: undefined,
                };
            },
        ),
        stream: vi.fn(),
    } as unknown as Transport;
}

function createRealtimeStub(): {
    realtime: RealtimeClient;
    params: Parameters<RealtimeClient["connectProtoChannel"]>[0] | undefined;
    unsubscribe: ReturnType<typeof vi.fn>;
} {
    let params: Parameters<RealtimeClient["connectProtoChannel"]>[0] | undefined;
    const unsubscribe = vi.fn();
    return {
        realtime: {
            connectProtoChannel: vi.fn(
                (nextParams: Parameters<RealtimeClient["connectProtoChannel"]>[0]) => {
                    params = nextParams;
                    return unsubscribe;
                },
            ),
        } as unknown as RealtimeClient,
        get params() {
            return params;
        },
        unsubscribe,
    };
}

function seedPairCatalog(): void {
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
        name: "Tether USD",
        quantityDisplayDecimals: 2,
        quantityScale: 6,
    };

    setEnrichedPairCatalog([
        {
            symbolId: 1,
            symbol: "BTC-USDT",
            baseAsset: btc,
            quoteAsset: usdt,
            tickSize: "0.01",
            stepSize: "0.000001",
            minNotionalQuote: "1",
            minQtyBase: "0.000001",
            allowBuyFeeFromReceived: false,
            defaultMarketSlippagePctBuy: 0.5,
            defaultMarketSlippagePctSell: 0.5,
            maxClientRefDriftPct: 0.1,
            listingAt: null,
            delistingAt: null,
            status: "enabled",
        },
    ]);
}

function protoOrder(overrides: Partial<ProtoRead.Order> = {}): ProtoRead.Order {
    return {
        orderId: 11n,
        symbolId: 1,
        clientOrderId: "client-1",
        side: ProtoWrite.Side.BUY,
        status: ProtoRead.OrderStatus.WORKING,
        orderType: ProtoWrite.OrderType.LIMIT,
        tif: ProtoWrite.TIF.GTC,
        stpMode: ProtoWrite.STPMode.EXPIRE_MAKER,
        feeSource: ProtoWrite.FeeSource.QUOTE,
        postOnly: false,
        origQty: 100_000_000n,
        cumQty: 0n,
        leavesQty: 100_000_000n,
        avgPxTicks: 0n,
        priceTicks: 100_000_000n,
        createdTsNs: 1_000_000n,
        terminalTsNs: 0n,
        terminalReason: "",
        terminalReasonCode: 0,
        marketClientRefPriceTicks: 0n,
        marketMaxSlippageTicks: 0,
        marketMaxSlippageBps: 0,
        ...overrides,
    } as ProtoRead.Order;
}

describe("OrdersService", () => {
    afterEach(() => {
        setEnrichedPairCatalog([]);
        vi.restoreAllMocks();
    });

    it("normalizes read requests, resolver defaults, and forwards signals", async () => {
        seedPairCatalog();
        const controller = new AbortController();
        const resolver: SubaccountResolver = {
            getDefaultSubaccountId: () => "11",
        };
        const captures: CapturedUnary[] = [];
        const service = new OrdersService(
            transportWithResponses(
                {
                    getOpenOrders: { orders: [], nextPageToken: "open-next" },
                    getOrderHistory: { orders: [], nextPageToken: "history-next" },
                },
                (call) => captures.push(call),
            ),
            createRealtimeStub().realtime,
            resolver,
        );

        const cases = [
            {
                name: "listOpen",
                call: () =>
                    service.listOpen(
                        {
                            symbolId: [1],
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
                            subaccountId: "",
                            status: "FILLED",
                            startTsNs: " 100 ",
                            endTsNs: "200",
                        },
                        { signal: controller.signal },
                    ),
                expectedMethod: "getOrderHistory",
                expectedMessage: {
                    status: ProtoRead.OrderStatus.FILLED,
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
            const captured = captures.find((call) => call.method === testCase.expectedMethod);

            expect(result).toEqual({ orders: [], nextPageToken: testCase.expectedNextPageToken });
            expect(captured).toMatchObject({
                method: testCase.expectedMethod,
                signal: controller.signal,
                message: testCase.expectedMessage,
            });
        }

        expect(
            captures.find((call) => call.method === "getOrderHistory")?.message,
        ).not.toHaveProperty("subaccountId");
    });

    it("normalizes create requests, parses create responses, and forwards mutation options", async () => {
        seedPairCatalog();
        let captured: CapturedUnary | undefined;
        const controller = new AbortController();
        const service = new OrdersService(
            transportWithResponses(
                {
                    createOrder: {
                        status: "accepted",
                        orderId: 11n,
                        clientOrderId: "client-1",
                        tsNs: 1_000_000n,
                    },
                },
                (call) => {
                    captured = call;
                },
            ),
            createRealtimeStub().realtime,
        );

        await expect(
            service.create(
                {
                    subaccountId: "11",
                    symbol: " BTC-USDT ",
                    side: "buy",
                    orderType: "limit",
                    tif: "gtc",
                    price: "100.25",
                    qty: "0.5",
                    postOnly: true,
                    clientOrderId: " client-1 ",
                    feeSource: "received",
                    stpMode: "expire_both",
                },
                { signal: controller.signal, stepUpToken: " fresh-token " },
            ),
        ).resolves.toMatchObject({
            status: "accepted",
            clientOrderId: "client-1",
            tsNs: 1,
        });

        expect(captured?.method).toBe("createOrder");
        expect(captured?.signal).toBe(controller.signal);
        expect(new Headers(captured?.headers).get(AUTH_STEP_UP_HEADER_NAME)).toBe("fresh-token");
        expect(captured?.message).toMatchObject({
            subaccountId: 11n,
            symbol: "BTC-USDT",
            side: ProtoWrite.Side.BUY,
            orderType: ProtoWrite.OrderType.LIMIT,
            tif: ProtoWrite.TIF.GTC,
            priceTicks: 100_250_000n,
            qtyScaled: 50_000_000n,
            postOnly: true,
            clientOrderId: "client-1",
            feeSource: ProtoWrite.FeeSource.RECEIVED,
            stpMode: ProtoWrite.STPMode.EXPIRE_BOTH,
        });
    });

    it("normalizes cancel and modify mutation payloads", async () => {
        seedPairCatalog();
        const captures: CapturedUnary[] = [];
        const service = new OrdersService(
            transportWithResponses(
                {
                    cancelOrder: {
                        status: "cancelled",
                        orderId: 22n,
                        tsNs: 2_000_000n,
                    },
                    modifyOrder: {
                        actionTaken: ProtoWrite.ModifyActionTaken.AMENDED,
                        oldOrderId: 22n,
                        finalOrderId: 22n,
                        code: "ok",
                        tsNs: 3_000_000n,
                    },
                },
                (call) => captures.push(call),
            ),
            createRealtimeStub().realtime,
        );

        await expect(
            service.cancel({ orderId: "22", symbolId: 1, subaccountId: "11" }),
        ).resolves.toMatchObject({ status: "cancelled", tsNs: 2 });
        await expect(
            service.modify({
                clientOrderId: " client-1 ",
                requestId: " modify-1 ",
                symbol: "BTC-USDT",
                newQty: "0.25",
                behavior: "AMEND_ONLY",
            }),
        ).resolves.toMatchObject({
            actionTaken: "AMENDED",
            code: "ok",
            tsNs: 3,
        });

        expect(captures.find((call) => call.method === "cancelOrder")?.message).toMatchObject({
            key: {
                case: "orderId",
                value: 22n,
            },
            symbolId: 1,
            subaccountId: 11n,
        });
        expect(captures.find((call) => call.method === "modifyOrder")?.message).toMatchObject({
            key: {
                case: "clientOrderId",
                value: "client-1",
            },
            requestId: "modify-1",
            newQtyScaled: 25_000_000n,
            behavior: ProtoWrite.ModifyBehavior.AMEND_ONLY,
            newClientOrderId: "",
        });
    });

    it("generates a request ID for cancelAll when omitted", async () => {
        let request: Record<string, unknown> | undefined;
        const service = new OrdersService(
            transportWithResponses(
                {
                    cancelAllOrders: {
                        status: "ok",
                        matchedOrders: 2,
                        submittedCancels: 2,
                        failedCancels: 0,
                        tsNs: 1_000_000n,
                    },
                },
                (call) => {
                    request = call.message;
                },
            ),
            createRealtimeStub().realtime,
        );

        await expect(service.cancelAll({ symbol: " BTC-USDT " })).resolves.toMatchObject({
            status: "ok",
            matchedOrders: 2,
            submittedCancels: 2,
            failedCancels: 0,
            ts: 1,
        });

        expect(request).toMatchObject({
            symbol: "BTC-USDT",
        });
        expect(request?.requestId).toEqual(expect.any(String));
        expect((request?.requestId as string).length).toBeGreaterThan(0);
    });

    it("preserves a caller-provided request ID for cancelAll", async () => {
        let request: Record<string, unknown> | undefined;
        const service = new OrdersService(
            transportWithResponses(
                {
                    cancelAllOrders: {
                        status: "ok",
                        matchedOrders: 0,
                        submittedCancels: 0,
                        failedCancels: 0,
                        tsNs: 1_000_000n,
                    },
                },
                (call) => {
                    request = call.message;
                },
            ),
            createRealtimeStub().realtime,
        );

        await service.cancelAll({ requestId: " retry-cancel-all-1 " });

        expect(request?.requestId).toBe("retry-cancel-all-1");
    });

    it("returns null when get order details response omits the order", async () => {
        let request: Record<string, unknown> | undefined;
        const service = new OrdersService(
            transportWithResponses({ getOrder: {} }, (call) => {
                request = call.message;
            }),
            createRealtimeStub().realtime,
        );

        await expect(service.getDetails({ clientOrderId: " client-1 " })).resolves.toBeNull();

        expect(request).toMatchObject({
            includeAttachedRisk: true,
            includeAttachedRiskState: true,
            key: {
                case: "clientOrderId",
                value: "client-1",
            },
        });
    });

    it("parses populated order details responses", async () => {
        seedPairCatalog();
        const service = new OrdersService(
            transportWithResponses({
                getOrder: {
                    order: protoOrder({ status: ProtoRead.OrderStatus.FILLED }),
                    trades: [],
                    transfers: [],
                },
            }),
            createRealtimeStub().realtime,
        );

        await expect(service.getDetails({ orderId: "11" })).resolves.toMatchObject({
            order: {
                clientOrderId: "client-1",
                symbol: "BTC-USDT",
                status: "filled",
                origQty: "1",
                price: "100",
            },
            trades: [],
            transfers: [],
        });
    });

    it("uses private order channels and parses realtime publications", () => {
        seedPairCatalog();
        const realtime = createRealtimeStub();
        const service = new OrdersService(transportWithResponses({}), realtime.realtime);
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
                symbol: "BTC-USDT",
                status: "filled",
            }),
        );

        unsubscribe();
        expect(realtime.unsubscribe).toHaveBeenCalledTimes(1);
    });

    it("rejects malformed backend and realtime order payloads", async () => {
        seedPairCatalog();
        const service = new OrdersService(
            transportWithResponses({
                getOpenOrders: {
                    orders: [
                        protoOrder({ status: ProtoRead.OrderStatus.ORDER_STATUS_UNSPECIFIED }),
                    ],
                    nextPageToken: "",
                },
            }),
            createRealtimeStub().realtime,
        );

        await expect(service.listOpen()).rejects.toThrow();

        const realtime = createRealtimeStub();
        const subscriptionService = new OrdersService(
            transportWithResponses({}),
            realtime.realtime,
        );
        subscriptionService.subscribe({ accountId: "account-1", onEvent: vi.fn() });

        expect(() =>
            realtime.params?.onPublication(
                protoOrder({ status: ProtoRead.OrderStatus.ORDER_STATUS_UNSPECIFIED }),
            ),
        ).toThrow();
    });
});
