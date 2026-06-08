import type { Transport } from "@connectrpc/connect";
import { create } from "@bufbuild/protobuf";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RealtimeClient } from "../../realtime/client.js";
import { setEnrichedPairCatalog } from "../../catalogs/market-data-catalog.js";
import * as Proto from "../../gen/orderbook/v1/orderbook_pb.js";
import { OrderbookService } from "./orderbook.js";

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
});
