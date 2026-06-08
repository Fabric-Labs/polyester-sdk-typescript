import type { Transport } from "@connectrpc/connect";
import { create } from "@bufbuild/protobuf";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RealtimeClient } from "../../realtime/client.js";
import { setEnrichedPairCatalog } from "../../catalogs/market-data-catalog.js";
import * as Proto from "../../gen/orderbook/v1/orderbook_pb.js";
import { OrderbookService } from "./orderbook.js";

type CapturedUnary = {
    method: string;
    signal: AbortSignal | undefined;
    headers: HeadersInit | undefined;
    message: Record<string, unknown>;
};

function transportWithMessage(
    message: Record<string, unknown>,
    capture?: (call: CapturedUnary) => void,
): Transport {
    return {
        unary: vi.fn(
            async (
                method: { localName: string },
                signal: AbortSignal | undefined,
                _timeoutMs: number | undefined,
                headers: HeadersInit | undefined,
                input: Record<string, unknown>,
            ) => {
                capture?.({
                    method: method.localName,
                    signal,
                    headers,
                    message: input,
                });
                return {
                    message,
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

function rejectingTransport(error: unknown): Transport {
    return {
        unary: vi.fn(async () => {
            throw error;
        }),
        stream: vi.fn(),
    } as unknown as Transport;
}

function createRealtimeStub(): {
    realtime: RealtimeClient;
    params: Parameters<RealtimeClient["connectProtoChannel"]>[0] | undefined;
} {
    let params: Parameters<RealtimeClient["connectProtoChannel"]>[0] | undefined;
    return {
        realtime: {
            connectProtoChannel: vi.fn(
                (nextParams: Parameters<RealtimeClient["connectProtoChannel"]>[0]) => {
                    params = nextParams;
                    return vi.fn();
                },
            ),
        } as unknown as RealtimeClient,
        get params() {
            return params;
        },
    };
}

async function flushMicrotasks(): Promise<void> {
    for (let i = 0; i < 3; i++) {
        await Promise.resolve();
    }
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

describe("OrderbookService", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        setEnrichedPairCatalog([]);
    });

    it("normalizes get requests, forwards signals, and parses snapshots", async () => {
        seedPairCatalog();
        let captured: CapturedUnary | undefined;
        const controller = new AbortController();
        const service = new OrderbookService(
            transportWithMessage(
                {
                    bookSeq: 12n,
                    bids: [{ priceTicks: 100_000_000n, qtyScaled: 100_000_000n }],
                    asks: [{ priceTicks: 100_250_000n, qtyScaled: 50_000_000n }],
                },
                (call) => {
                    captured = call;
                },
            ),
            createRealtimeStub().realtime,
        );

        await expect(
            service.get({ symbol: "BTC-USDT", depth: 37 }, { signal: controller.signal }),
        ).resolves.toMatchObject({
            symbol: "BTC-USDT",
            depth: Proto.Depth.DEPTH_50,
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

        expect(captured).toMatchObject({
            method: "getOrderBook",
            signal: controller.signal,
            message: {
                symbol: "BTC-USDT",
                depth: Proto.Depth.DEPTH_50,
            },
        });
    });

    it("rejects malformed backend snapshots", async () => {
        seedPairCatalog();
        const service = new OrderbookService(
            transportWithMessage({
                bookSeq: 12n,
                bids: [{ priceTicks: 100_000_000n }],
                asks: [],
            }),
            createRealtimeStub().realtime,
        );

        await expect(service.get({ symbol: "BTC-USDT" })).rejects.toThrow();
    });

    it("reports snapshot failures without emitting an empty ready book", async () => {
        seedPairCatalog();
        const realtime = createRealtimeStub();
        const service = new OrderbookService(
            rejectingTransport(new Error("snapshot unavailable")),
            realtime.realtime,
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
        seedPairCatalog();
        const realtime = createRealtimeStub();
        const service = new OrderbookService(
            transportWithMessage({
                bookSeq: 1n,
                bids: [{ priceTicks: 100_000_000n, qtyScaled: 100_000_000n }],
                asks: [{ priceTicks: 101_000_000n, qtyScaled: 50_000_000n }],
            }),
            realtime.realtime,
        );
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
        const realtime = createRealtimeStub();
        const service = new OrderbookService(transportWithMessage({}), realtime.realtime);

        expect(() =>
            service.subscribe({
                symbol: "UNKNOWN-USDT",
                onEvent: vi.fn(),
            }),
        ).toThrow("[catalog] market pairSymbol not found: UNKNOWN-USDT");
        expect(realtime.realtime.connectProtoChannel).not.toHaveBeenCalled();
    });
});
