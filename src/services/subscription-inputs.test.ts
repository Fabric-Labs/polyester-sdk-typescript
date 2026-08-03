import type { Transport } from "@connectrpc/connect";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RealtimeClient } from "../realtime/client.js";
import { createCatalogSdkScales } from "../shared/decimal-surface.js";
import { createTestCatalog } from "../testing/catalog.js";
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

function testScales() {
    return createCatalogSdkScales(() => createTestCatalog());
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
    });

    it("uses caller-provided market trade symbol ids for realtime routing", () => {
        const realtime = realtimeStub();
        const service = new MarketDataService(noopTransport(), realtime.realtime, testScales());

        service.subscribeTrades({
            symbolId: 999,
            onEvent: vi.fn(),
        });

        expect(realtime.connectProtoChannel).toHaveBeenCalledWith(
            expect.objectContaining({ channel: "public:spot:market:trades:999:proto" }),
        );
    });

    it("uses caller-provided orderbook symbol ids for realtime routing", () => {
        const realtime = realtimeStub();
        const service = new OrderbookService(noopTransport(), realtime.realtime, testScales());

        service.subscribe({
            symbol: "NOPE-USDT",
            symbolId: 999,
            onEvent: vi.fn(),
        });

        expect(realtime.connectProtoChannel).toHaveBeenCalledWith(
            expect.objectContaining({
                channel: "public:spot:orderbook:deltas:depth:50:999:proto",
            }),
        );
    });

    it("throws for unsupported candle subscription timeframes before connecting realtime", () => {
        const realtime = realtimeStub();
        const service = new CandlesService(noopTransport(), realtime.realtime, testScales());

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
        const service = new HeatmapService(noopTransport(), realtime.realtime, testScales());

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
