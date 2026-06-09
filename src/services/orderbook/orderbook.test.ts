import { create } from "@bufbuild/protobuf";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Proto from "../../gen/orderbook/v1/orderbook_pb.js";
import { createTestCatalog } from "../../testing/catalog.js";
import {
    realtimeClientStub,
    rejectingUnaryTransport,
    unaryTransport,
} from "../../testing/service-harness.js";
import { OrderbookService } from "./orderbook.js";

async function flushMicrotasks(): Promise<void> {
    for (let i = 0; i < 3; i++) {
        await Promise.resolve();
    }
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

describe("OrderbookService", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("normalizes get requests, forwards signals, and parses snapshots", async () => {
        const catalog = seedPairCatalog();
        const controller = new AbortController();
        const transport = unaryTransport({
            bookSeq: 12n,
            bids: [{ priceTicks: 100_000_000n, qtyScaled: 100_000_000n }],
            asks: [{ priceTicks: 100_250_000n, qtyScaled: 50_000_000n }],
        });
        const service = new OrderbookService(
            transport.transport,
            realtimeClientStub().realtime,
            catalog,
        );

        await expect(
            service.get({ symbol: "BTC-USDT", depth: 37 }, { signal: controller.signal }),
        ).resolves.toMatchObject({
            symbol: "BTC-USDT",
            depth: 50,
            bookSeq: "12",
            bids: [
                {
                    priceTicks: "100000000",
                    qtyScaled: "100000000",
                    priceDisplay: "100",
                    qtyDisplay: "1",
                },
            ],
            asks: [
                {
                    priceTicks: "100250000",
                    qtyScaled: "50000000",
                    priceDisplay: "100.25",
                    qtyDisplay: "0.5",
                },
            ],
        });

        const captured = transport.lastCall();
        expect(captured?.method.localName).toBe("getOrderBook");
        expect(captured).toMatchObject({
            signal: controller.signal,
            message: {
                symbol: "BTC-USDT",
                depth: Proto.Depth.DEPTH_50,
            },
        });
    });

    it("rejects malformed backend snapshots", async () => {
        const catalog = seedPairCatalog();
        const transport = unaryTransport({
            bookSeq: 12n,
            bids: [{ priceTicks: 100_000_000n }],
            asks: [],
        });
        const service = new OrderbookService(
            transport.transport,
            realtimeClientStub().realtime,
            catalog,
        );

        await expect(service.get({ symbol: "BTC-USDT" })).rejects.toThrow();
    });

    it("reports snapshot failures without emitting an empty ready book", async () => {
        const catalog = seedPairCatalog();
        const realtime = realtimeClientStub();
        const service = new OrderbookService(
            rejectingUnaryTransport(new Error("snapshot unavailable")),
            realtime.realtime,
            catalog,
        );
        const onEvent = vi.fn();
        const onError = vi.fn();

        const subscription = service.createSubscription({
            symbol: "BTC-USDT",
            depth: 50,
            onEvent,
            onError,
        });
        await flushMicrotasks();

        expect(onEvent).not.toHaveBeenCalled();
        expect(onError).toHaveBeenCalledTimes(1);
        expect(onError.mock.calls[0]?.[0]).toMatchObject({
            type: "snapshot",
            error: {
                code: 0,
                message: "snapshot unavailable",
            },
        });

        realtime.params?.onPublication(
            create(Proto.OrderBookDeltaSchema, {
                symbolId: 1,
                bookSeqStart: 1n,
                bookSeqEnd: 1n,
                bids: [],
                asks: [],
                reset: false,
            }),
        );

        expect(onEvent).not.toHaveBeenCalled();
        subscription.unsubscribe();
    });

    it("uses the public delta channel, callbacks, and parsed publications for subscriptions", async () => {
        const catalog = seedPairCatalog();
        const realtime = realtimeClientStub();
        const transport = unaryTransport({
            bookSeq: 1n,
            bids: [{ priceTicks: 100_000_000n, qtyScaled: 100_000_000n }],
            asks: [{ priceTicks: 101_000_000n, qtyScaled: 50_000_000n }],
        });
        const service = new OrderbookService(transport.transport, realtime.realtime, catalog);
        const onEvent = vi.fn();
        const onOpen = vi.fn();
        const onClose = vi.fn();
        const onError = vi.fn();

        const subscription = service.createSubscription({
            symbol: "BTC-USDT",
            depth: 1000,
            bucket: "0.01",
            onEvent,
            onOpen,
            onClose,
            onError,
        });

        expect(realtime.params?.channel).toBe("public:spot:orderbook:deltas:depth:500:1:proto");
        expect(realtime.params?.schema).toBe(Proto.OrderBookDeltaSchema);
        realtime.params?.onConnected?.();
        realtime.params?.onDisconnected?.();
        realtime.params?.onError?.({
            channel: "channel",
            type: "transport",
            error: { code: 0, message: "boom" },
        });

        await flushMicrotasks();

        const captured = transport.lastCall();
        expect(captured?.method.localName).toBe("getOrderBook");
        expect(captured).toMatchObject({
            message: {
                symbol: "BTC-USDT",
                depth: Proto.Depth.DEPTH_500,
            },
        });
        expect(onOpen).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onError).toHaveBeenCalledWith({
            channel: "channel",
            type: "transport",
            error: { code: 0, message: "boom" },
        });
        expect(onEvent).toHaveBeenLastCalledWith(
            expect.objectContaining({
                depth: 500,
                bookSeq: "1",
                bids: [
                    expect.objectContaining({
                        priceDisplay: "100",
                        qtyDisplay: "1",
                    }),
                ],
            }),
        );

        realtime.params?.onPublication(
            create(Proto.OrderBookDeltaSchema, {
                symbolId: 1,
                bookSeqStart: 2n,
                bookSeqEnd: 2n,
                bids: [{ priceTicks: 100_500_000n, qtyScaled: 25_000_000n }],
                asks: [{ priceTicks: 101_000_000n, qtyScaled: 0n }],
                reset: false,
            }),
        );

        expect(onEvent).toHaveBeenLastCalledWith(
            expect.objectContaining({
                bookSeq: "2",
                asks: [],
                bids: expect.arrayContaining([
                    expect.objectContaining({
                        priceDisplay: "100.5",
                        qtyDisplay: "0.25",
                    }),
                ]),
            }),
        );

        subscription.unsubscribe();
    });

    it("validates the subscription symbol before connecting realtime", () => {
        const realtime = realtimeClientStub();
        const service = new OrderbookService(unaryTransport({}).transport, realtime.realtime);

        expect(() =>
            service.subscribe({
                symbol: "UNKNOWN-USDT",
                onEvent: vi.fn(),
            }),
        ).toThrow("[catalog] market pairSymbol not found: UNKNOWN-USDT");
        expect(realtime.realtime.connectProtoChannel).not.toHaveBeenCalled();
    });
});
