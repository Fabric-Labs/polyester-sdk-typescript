import { afterEach, describe, expect, it, vi } from "vitest";
import * as ProtoRead from "../../gen/orders/v1/orders_read_pb.js";
import * as ProtoWrite from "../../gen/orders/v1/orders_pb.js";
import { createPolyesterCatalog, staticCatalog } from "../../catalogs/index.js";
import { AUTH_STEP_UP_HEADER_NAME } from "../../shared/request-options.js";
import { createTestCatalog } from "../../testing/catalog.js";
import { realtimeClientStub, unaryTransportByMethod } from "../../testing/service-harness.js";
import type { AssetConfig, PairConfig, SpotConfig } from "../market-data/market-data.schemas.js";
import type { SubaccountResolver } from "../subaccount-resolver.js";
import type { DepositWithdrawConfig } from "../zipper/zipper.schemas.js";
import { OrdersService } from "./orders.js";

const emptyZipperConfig = {
    chains: [],
    assets: [],
    polyesterChainId: 0,
    contracts: [],
    tsMs: 0,
} satisfies DepositWithdrawConfig;

function testAsset(
    symbol: string,
    ledgerId: number,
    quantityScale: number,
    quantityDisplayDecimals = quantityScale,
): AssetConfig {
    return {
        symbol,
        ledgerId,
        name: symbol,
        quantityDisplayDecimals,
        quantityScale,
    };
}

function testPair(params: {
    symbol: string;
    symbolId: number;
    baseAsset: AssetConfig;
    quoteAsset: AssetConfig;
}): PairConfig {
    return {
        symbolId: params.symbolId,
        symbol: params.symbol,
        baseAsset: params.baseAsset.symbol,
        quoteAsset: params.quoteAsset.symbol,
        tickSize: "0.01",
        stepSize: "0.01",
        minNotionalQuote: "1",
        minQtyBase: "0.01",
        allowBuyFeeFromReceived: false,
        defaultMarketSlippagePctBuy: 0,
        defaultMarketSlippagePctSell: 0,
        maxClientRefDriftPct: 0,
        baseQuantityScale: params.baseAsset.quantityScale,
        quoteQuantityScale: params.quoteAsset.quantityScale,
        listingAt: null,
        delistingAt: null,
        status: "enabled",
    };
}

function refreshMarketSeed(params: {
    symbol: string;
    symbolId: number;
    baseAsset: AssetConfig;
    quoteAsset: AssetConfig;
}): SpotConfig {
    return {
        assets: [params.baseAsset, params.quoteAsset],
        pairs: [testPair(params)],
        tsSec: 0,
    };
}

function seedPairCatalog() {
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

    return createTestCatalog({
        pairs: [
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
        ],
    });
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
        vi.restoreAllMocks();
    });

    it("normalizes read requests, resolver defaults, and forwards signals", async () => {
        const catalog = seedPairCatalog();
        const controller = new AbortController();
        const resolver: SubaccountResolver = {
            getDefaultSubaccountId: () => "11",
        };
        const transport = unaryTransportByMethod({
            getOpenOrders: { orders: [], nextPageToken: "open-next" },
            getOrderHistory: { orders: [], nextPageToken: "history-next" },
        });
        const service = new OrdersService(
            transport.transport,
            realtimeClientStub().realtime,
            resolver,
            catalog,
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
            const captured = transport.calls.find(
                (call) => call.method.localName === testCase.expectedMethod,
            );

            expect(result).toEqual({ orders: [], nextPageToken: testCase.expectedNextPageToken });
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

    it("normalizes create requests, parses create responses, and forwards mutation options", async () => {
        const catalog = seedPairCatalog();
        const controller = new AbortController();
        const transport = unaryTransportByMethod({
            createOrder: {
                status: "accepted",
                orderId: 11n,
                clientOrderId: "client-1",
                tsNs: 1_000_000n,
            },
        });
        const service = new OrdersService(
            transport.transport,
            realtimeClientStub().realtime,
            undefined,
            catalog,
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

        const captured = transport.lastCall();
        expect(captured?.method.localName).toBe("createOrder");
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

    it("uses refreshed client catalog snapshots when parsing later read responses", async () => {
        const quote = testAsset("REFRESH_QUOTE", 902, 2);
        const initialMarket = refreshMarketSeed({
            symbol: "REFRESH_OLD-USD",
            symbolId: 77,
            baseAsset: testAsset("REFRESH_OLD", 901, 2),
            quoteAsset: quote,
        });
        const refreshedMarket = refreshMarketSeed({
            symbol: "REFRESH_NEW-USD",
            symbolId: 77,
            baseAsset: testAsset("REFRESH_NEW", 903, 4),
            quoteAsset: quote,
        });
        const catalog = createPolyesterCatalog({
            seed: {
                market: initialMarket,
                zipper: emptyZipperConfig,
            },
            refresh: {
                market: vi.fn(() => Promise.resolve(refreshedMarket)),
                zipper: vi.fn(() => Promise.resolve(emptyZipperConfig)),
            },
        });
        const transport = unaryTransportByMethod({
            getOpenOrders: {
                orders: [
                    protoOrder({
                        symbolId: 77,
                        origQty: 12_345n,
                        leavesQty: 12_345n,
                    }),
                ],
                nextPageToken: "",
            },
        });
        const service = new OrdersService(
            transport.transport,
            realtimeClientStub().realtime,
            undefined,
            catalog,
        );

        const beforeRefresh = await service.listOpen();
        await catalog.refresh();
        const afterRefresh = await service.listOpen();

        expect(beforeRefresh.orders[0]).toMatchObject({
            symbol: "REFRESH_OLD-USD",
            origQty: "123.45",
        });
        expect(afterRefresh.orders[0]).toMatchObject({
            symbol: "REFRESH_NEW-USD",
            origQty: "1.2345",
        });
        expect(staticCatalog.market.getPairBySymbol("REFRESH_NEW-USD")).toBeNull();
    });

    it("normalizes cancel and modify mutation payloads", async () => {
        const catalog = seedPairCatalog();
        const transport = unaryTransportByMethod({
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
        });
        const service = new OrdersService(
            transport.transport,
            realtimeClientStub().realtime,
            undefined,
            catalog,
        );

        await expect(
            service.cancel({ orderId: "22", symbolId: 1, subaccountId: "11" }),
        ).resolves.toMatchObject({ status: "cancelled", tsNs: 2 });
        await expect(
            service.cancel({ clientOrderId: " client-1 ", symbolId: 1, subaccountId: "11" }),
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
        expect(
            transport.calls.find((call) => call.method.localName === "modifyOrder")?.message,
        ).toMatchObject({
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
        const transport = unaryTransportByMethod({
            cancelAllOrders: {
                status: "ok",
                matchedOrders: 2,
                submittedCancels: 2,
                failedCancels: 0,
                tsNs: 1_000_000n,
            },
        });
        const service = new OrdersService(transport.transport, realtimeClientStub().realtime);

        await expect(service.cancelAll({ symbol: " BTC-USDT " })).resolves.toMatchObject({
            status: "ok",
            matchedOrders: 2,
            submittedCancels: 2,
            failedCancels: 0,
            ts: 1,
        });

        const request = transport.lastCall()?.message;
        expect(request).toMatchObject({
            symbol: "BTC-USDT",
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
        const service = new OrdersService(transport.transport, realtimeClientStub().realtime);

        await service.cancelAll({ requestId: " retry-cancel-all-1 " });

        const request = transport.lastCall()?.message;
        expect(request?.requestId).toBe("retry-cancel-all-1");
    });

    it("returns null when get order details response omits the order", async () => {
        const transport = unaryTransportByMethod({ getOrder: {} });
        const service = new OrdersService(transport.transport, realtimeClientStub().realtime);

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

    it("parses populated order details responses", async () => {
        const catalog = seedPairCatalog();
        const transport = unaryTransportByMethod({
            getOrder: {
                order: protoOrder({ status: ProtoRead.OrderStatus.FILLED }),
                trades: [],
                transfers: [],
            },
        });
        const service = new OrdersService(
            transport.transport,
            realtimeClientStub().realtime,
            undefined,
            catalog,
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
        const catalog = seedPairCatalog();
        const realtime = realtimeClientStub();
        const service = new OrdersService(
            unaryTransportByMethod({}).transport,
            realtime.realtime,
            undefined,
            catalog,
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
        const catalog = seedPairCatalog();
        const transport = unaryTransportByMethod({
            getOpenOrders: {
                orders: [protoOrder({ status: ProtoRead.OrderStatus.ORDER_STATUS_UNSPECIFIED })],
                nextPageToken: "",
            },
        });
        const service = new OrdersService(
            transport.transport,
            realtimeClientStub().realtime,
            undefined,
            catalog,
        );

        await expect(service.listOpen()).rejects.toThrow();

        const realtime = realtimeClientStub();
        const subscriptionService = new OrdersService(
            unaryTransportByMethod({}).transport,
            realtime.realtime,
            undefined,
            catalog,
        );
        subscriptionService.subscribe({ accountId: "account-1", onEvent: vi.fn() });

        expect(() =>
            realtime.params?.onPublication(
                protoOrder({ status: ProtoRead.OrderStatus.ORDER_STATUS_UNSPECIFIED }),
            ),
        ).toThrow();
    });
});
