import type { Transport } from "@connectrpc/connect";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setEnrichedPairCatalog } from "../catalogs/market-data-catalog.js";
import type { RealtimeClient } from "../realtime/client.js";
import { CandlesService } from "./candles/candles.js";
import { HeatmapService } from "./heatmap/heatmap.js";
import { MarketDataService } from "./market-data/market-data.js";
import { OrderbookService } from "./orderbook/orderbook.js";

function noopTransport(): Transport {
    return {
        unary: vi.fn(),
        stream: vi.fn(),
    } as unknown as Transport;
}

function realtimeStub(): {
    realtime: RealtimeClient;
    connectProtoChannel: ReturnType<typeof vi.fn>;
} {
    const connectProtoChannel = vi.fn(() => vi.fn());
    return {
        realtime: { connectProtoChannel } as unknown as RealtimeClient,
        connectProtoChannel,
    };
}

describe("subscription input validation", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        setEnrichedPairCatalog([]);
    });

    it("throws for unknown market trade symbols before connecting realtime", () => {
        const realtime = realtimeStub();
        const service = new MarketDataService(noopTransport(), realtime.realtime);

        expect(() =>
            service.subscribeTrades({
                symbol: "NOPE-USDT",
                onEvent: vi.fn(),
            }),
        ).toThrow(/Unknown pair symbol: NOPE-USDT/);
        expect(realtime.connectProtoChannel).not.toHaveBeenCalled();
    });

    it("throws for unknown orderbook symbols before connecting realtime", () => {
        const realtime = realtimeStub();
        const service = new OrderbookService(noopTransport(), realtime.realtime);

        expect(() =>
            service.createSubscription({
                symbol: "NOPE-USDT",
                onEvent: vi.fn(),
            }),
        ).toThrow(/Unknown pair symbol: NOPE-USDT/);
        expect(realtime.connectProtoChannel).not.toHaveBeenCalled();
    });

    it("throws for unsupported candle subscription timeframes before connecting realtime", () => {
        const realtime = realtimeStub();
        const service = new CandlesService(noopTransport(), realtime.realtime);

        expect(() =>
            service.subscribe({
                symbolId: 1,
                timeframe: "2m" as never,
                onEvent: vi.fn(),
            }),
        ).toThrow();
        expect(() =>
            service.subscribeInts({
                symbolId: 1,
                timeframe: "2m" as never,
                onEvent: vi.fn(),
            }),
        ).toThrow();
        expect(realtime.connectProtoChannel).not.toHaveBeenCalled();
    });

    it("throws for unsupported heatmap intervals before connecting realtime", () => {
        const realtime = realtimeStub();
        const service = new HeatmapService(noopTransport(), realtime.realtime);

        expect(() =>
            service.subscribeLive({
                symbolId: 1,
                interval: "15m" as never,
                onEvent: vi.fn(),
            }),
        ).toThrow();
        expect(realtime.connectProtoChannel).not.toHaveBeenCalled();
    });
});
