import { create } from "@bufbuild/protobuf";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssetDataSource } from "../../gen/marketdata/v1/asset_info_pb.js";
import * as Proto from "../../gen/marketdata/v1/marketdata_pb.js";
import type { EnrichedPairConfig } from "../../catalogs/index.js";
import { createCatalogSdkScales, type SdkScales } from "../../shared/decimal-surface.js";
import { createTestCatalog } from "../../testing/catalog.js";
import { realtimeClientStub, unaryTransport } from "../../testing/service-harness.js";
import { ResourceNotFoundError, ServiceUnavailableError } from "../../shared/errors.js";
import { MarketDataService } from "./market-data.js";

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
    symbolId: 101,
    symbol: "BTC-USDT",
    baseAsset: btc,
    quoteAsset: usdt,
    tickSize: "0.000001",
    stepSize: "0.00000001",
    minNotionalQuote: "1",
    minQtyBase: "0.00000001",
    allowBuyFeeFromBase: false,
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

const marketTrade = {
    symbolId: 101,
    matchId: 22n,
    isBuy: false,
    priceTicks: 1_234_567_000n,
    qtyScaled: 123_456_789n,
    tsNs: 1_700_000_000_000_000_000n,
};

describe("MarketDataService", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("normalizes public trade filters to the proto request and parses trades to decimal strings", async () => {
        const controller = new AbortController();
        const transport = unaryTransport({ trades: [marketTrade], nextPageToken: "next" });
        const service = new MarketDataService(
            { publicApi: transport.transport },
            realtimeClientStub().realtime,
            testScales(),
        );

        const result = await service.listTrades(
            {
                symbolId: 101,
                side: "buy",
                startTsNs: "1700000000123456789",
                endTsNs: "1700000001123456789",
                limit: 25,
                pageToken: " cursor-1 ",
            },
            { signal: controller.signal },
        );

        expect(transport.lastCall()?.message).toEqual({
            symbolId: 101,
            side: Proto.SideFilter.BUY,
            startTime: { seconds: 1_700_000_000n, nanos: 123_456_789 },
            endTime: { seconds: 1_700_000_001n, nanos: 123_456_789 },
            limit: 25,
            pageToken: "cursor-1",
        });
        expect(transport.lastCall()?.signal).toBe(controller.signal);
        expect(result).toEqual({
            trades: [
                expect.objectContaining({
                    symbolId: 101,
                    matchId: "22",
                    sideLabel: "sell",
                    qty: "1.23456789",
                    price: "1.234567",
                    tsMs: 1_700_000_000_000,
                }),
            ],
            nextPageToken: "next",
        });
    });

    it("walks trades gap-free from afterTradeId and returns the backfill cursor", async () => {
        const transport = unaryTransport({
            trades: [marketTrade],
            nextPageToken: "",
            completeThroughTradeId: 1_099_511_627_776n,
            nextAfterTradeId: 1_099_511_627_776n,
            epochEnds: [{ epoch: 1n, lastTradeId: 22n }],
        });
        const service = new MarketDataService(
            { publicApi: transport.transport },
            realtimeClientStub().realtime,
            testScales(),
        );

        const result = await service.listTrades({ symbolId: 101, afterTradeId: "0", limit: 10 });

        expect(transport.lastCall()?.message).toMatchObject({ symbolId: 101, afterTradeId: 0n });
        expect(result).toEqual({
            trades: [expect.objectContaining({ matchId: "22" })],
            nextPageToken: "",
            backfill: {
                completeThroughTradeId: "1099511627776",
                nextAfterTradeId: "1099511627776",
                epochEnds: [{ epoch: "1", lastTradeId: "22" }],
            },
        });
    });

    it("rejects afterTradeId combined with time, side or page filters, or past uint64", async () => {
        const transport = unaryTransport({ trades: [], nextPageToken: "" });
        const service = new MarketDataService(
            { publicApi: transport.transport },
            realtimeClientStub().realtime,
            testScales(),
        );
        const conflicts = [
            { side: "buy" },
            { startTsNs: "1" },
            { endTsNs: "1" },
            { pageToken: "cursor" },
        ] as const;

        for (const conflict of conflicts) {
            await expect(
                service.listTrades({ symbolId: 101, afterTradeId: "5", ...conflict }),
            ).rejects.toThrow(
                "afterTradeId cannot be combined with side, startTsNs, endTsNs or pageToken",
            );
        }
        await expect(
            service.listTrades({ symbolId: 101, afterTradeId: "18446744073709551616" }),
        ).rejects.toThrow("afterTradeId must be at most 18446744073709551615");
        expect(transport.lastCall()).toBeUndefined();
    });

    it("returns an empty public trade list for empty backend rows", async () => {
        const transport = unaryTransport({ trades: [], nextPageToken: "" });
        const service = new MarketDataService(
            { publicApi: transport.transport },
            realtimeClientStub().realtime,
            testScales(),
        );

        await expect(service.listTrades({ symbolId: 101 })).resolves.toEqual({
            trades: [],
            nextPageToken: "",
        });
    });

    it("rejects public trades for symbols unknown to the catalog", async () => {
        const transport = unaryTransport({
            trades: [{ ...marketTrade, symbolId: 999 }],
            nextPageToken: "",
        });
        const service = new MarketDataService(
            { publicApi: transport.transport },
            realtimeClientStub().realtime,
            testScales(),
        );

        await expect(service.listTrades({ symbolId: 999 })).rejects.toThrow(
            /symbolId not found: 999/,
        );
    });

    it("parses spot config responses without waiting on catalog readiness", async () => {
        const controller = new AbortController();
        const transport = unaryTransport({
            assets: [
                {
                    asset: "BTC",
                    ledgerId: 1,
                    name: "Bitcoin",
                    quantityDisplayDecimals: 8,
                    quantityScale: 8,
                },
            ],
            pairs: [
                {
                    symbolId: 101,
                    symbol: "BTC-USDT",
                    baseAsset: "BTC",
                    quoteAsset: "USDT",
                    tickSize: "0.000001",
                    stepSize: "0.00000001",
                    minNotionalQuote: "1",
                    minQtyBase: "0.00000001",
                    allowBuyFeeFromBase: false,
                    baseQuantityScale: 8,
                    quoteQuantityScale: 6,
                    defaultMarketSlippageBpsBuy: 25,
                    defaultMarketSlippageBpsSell: 50,
                    maxClientRefDriftBps: 10,
                    marketdata: { orderbookPriceBuckets: [0.01, 0.1] },
                    listingAt: { seconds: 1_700_000_000n, nanos: 0 },
                    status: Proto.PairStatus.ENABLED,
                },
            ],
            tsSec: 123n,
        });
        // getSpotConfig is the catalog's own data source: it must not await
        // scale readiness or read any scale, or the initial refresh deadlocks.
        const neverReadyScales: SdkScales = {
            ready: () => new Promise<never>(() => {}),
            price: () => {
                throw new Error("getSpotConfig must not use scales");
            },
            baseQty: () => {
                throw new Error("getSpotConfig must not use scales");
            },
            quoteAmount: () => {
                throw new Error("getSpotConfig must not use scales");
            },
            ledgerAmount: () => {
                throw new Error("getSpotConfig must not use scales");
            },
            zippedAssetAmount: () => {
                throw new Error("getSpotConfig must not use scales");
            },
            marketDataVolume: () => {
                throw new Error("getSpotConfig must not use scales");
            },
            referencePrice: () => {
                throw new Error("getSpotConfig must not use scales");
            },
        };
        const service = new MarketDataService(
            { publicApi: transport.transport },
            realtimeClientStub().realtime,
            neverReadyScales,
        );

        const config = await service.getSpotConfig({ signal: controller.signal });

        expect(transport.lastCall()?.message).toEqual({});
        expect(transport.lastCall()?.signal).toBe(controller.signal);
        expect(config).toMatchObject({
            assets: [
                {
                    symbol: "BTC",
                    ledgerId: 1,
                    name: "Bitcoin",
                    quantityDisplayDecimals: 8,
                    quantityScale: 8,
                },
            ],
            pairs: [
                {
                    symbolId: 101,
                    defaultMarketSlippagePctBuy: 0.25,
                    defaultMarketSlippagePctSell: 0.5,
                    maxClientRefDriftPct: 0.1,
                    marketdata: { orderbookPriceBuckets: [0.01, 0.1] },
                    listingAt: 1_700_000_000_000,
                },
            ],
            tsSec: 123_000,
        });
    });

    it("wires public trade subscriptions and parses publications", async () => {
        const realtime = realtimeClientStub();
        const onEvent = vi.fn();
        const onOpen = vi.fn();
        const onClose = vi.fn();
        const onError = vi.fn();
        const service = new MarketDataService(
            { publicApi: unaryTransport({}).transport },
            realtime.realtime,
            testScales(),
        );

        const unsubscribe = service.subscribeTrades({
            symbolId: 101,
            onEvent,
            onOpen,
            onClose,
            onError,
        });

        expect(realtime.params?.channel).toBe("public:spot:market:trades:101:proto");
        expect(realtime.params?.schema).toBe(Proto.MarketTradeBatchSchema);

        realtime.params?.onConnected?.();
        realtime.params?.onDisconnected?.();
        const error = { channel: "c", type: "decode", error: new Error("bad") };
        realtime.params?.onError?.(error);
        realtime.params?.onPublication(
            create(Proto.MarketTradeBatchSchema, { events: [marketTrade, marketTrade] }),
        );
        await flushAsync();

        expect(onOpen).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onError).toHaveBeenCalledWith(error);
        expect(onEvent).toHaveBeenCalledTimes(2);
        expect(onEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                symbolId: 101,
                sideLabel: "sell",
                price: "1.234567",
                qty: "1.23456789",
            }),
        );

        unsubscribe();
        expect(realtime.connectProtoChannel.mock.results[0]?.value).toHaveBeenCalledTimes(1);
    });

    it("uses the caller-provided subscription symbol id", () => {
        const realtime = realtimeClientStub();
        const service = new MarketDataService(
            { publicApi: unaryTransport({}).transport },
            realtime.realtime,
            testScales(),
        );

        service.subscribeTrades({
            symbolId: 999,
            onEvent: vi.fn(),
        });

        expect(realtime.params?.channel).toBe("public:spot:market:trades:999:proto");
    });

    it("routes trades that fail to format to the subscription onError", async () => {
        const realtime = realtimeClientStub();
        const onEvent = vi.fn();
        const onError = vi.fn();
        const service = new MarketDataService(
            { publicApi: unaryTransport({}).transport },
            realtime.realtime,
            testScales(),
        );

        service.subscribeTrades({ symbolId: 101, onEvent, onError });

        realtime.params?.onPublication(
            create(Proto.MarketTradeBatchSchema, {
                events: [{ ...marketTrade, symbolId: 999 }, marketTrade],
            }),
        );
        await flushAsync();

        // The malformed trade is reported on its own; the rest of the batch still arrives.
        expect(onEvent).toHaveBeenCalledTimes(1);
        expect(onError).toHaveBeenCalledTimes(1);
        expect(onError.mock.calls[0]?.[0]).toMatchObject({
            channel: "public:spot:market:trades:101:proto",
            type: "publication_handler",
        });
        expect(onError.mock.calls[0]?.[0].error.message).toMatch(/market symbolId not found: 999/);
    });

    it("reads a live price band with absent limits as null, not zero", async () => {
        const ns = (ms: number) => BigInt(ms) * 1_000_000n;
        const transport = unaryTransport({
            band: {
                symbolId: 101,
                state: Proto.PriceBandState.ACTIVE,
                referencePriceTicks: 1_750_000_000_000n,
                referenceSource: Proto.PriceBandReferenceSource.INDEX_PRICE,
                maxBuyPriceTicks: 1_837_500_000_000n,
                minSellPriceTicks: 1_662_500_000_000n,
                updatedTsNs: ns(1_700_000_000_000),
                reanchorPending: true,
                parameters: { lowerBps: 500, upperBps: 500, referenceWindowMs: 1_000 },
                epoch: 3n,
                updateId: 18_446_744_073_709_551_615n,
                asOfTsNs: 1_700_000_001_000_000_001n,
                validUntilTsNs: ns(1_700_000_006_000),
            },
        });
        const service = new MarketDataService(
            { publicApi: transport.transport },
            realtimeClientStub().realtime,
            // The fixed price scale needs no catalog, so a failed catalog load must not block it.
            { ...testScales(), ready: () => Promise.reject(new Error("catalog down")) },
        );

        const band = await service.getPriceBand({ symbolId: 101 });

        expect(transport.lastCall()?.method.name).toBe("GetPriceBand");
        expect(transport.lastCall()?.message).toEqual({ symbolId: 101 });
        expect(band).toEqual({
            symbolId: 101,
            state: "active",
            referencePrice: "1750",
            referenceSource: "index_price",
            maxBuyPrice: "1837.5",
            minSellPrice: "1662.5",
            minBuyPrice: null,
            maxSellPrice: null,
            updatedAtMs: 1_700_000_000_000,
            reanchorEligibleAtMs: null,
            reanchorPending: true,
            parameters: { lowerBps: 500, upperBps: 500, referenceWindowMs: 1_000 },
            epoch: "3",
            updateId: "18446744073709551615",
            asOfTsNs: "1700000001000000001",
            validUntilMs: 1_700_000_006_000,
        });
    });

    it("lists asset information with nullable unknown launch facts", async () => {
        const transport = unaryTransport({
            assetInfo: [
                {
                    assetId: 1,
                    editorial: {
                        description: "Peer-to-peer cash.",
                        websiteUrl: "https://bitcoin.org",
                        explorerUrls: ["https://mempool.space"],
                        issueDate: "2009-01-03",
                        issuePrice: { amount: "0", currency: "USD" },
                    },
                    editorialUpdatedAt: { seconds: 1_700_000_000n, nanos: 0 },
                },
                { assetId: 2 },
            ],
        });
        const service = new MarketDataService(
            { publicApi: transport.transport },
            realtimeClientStub().realtime,
            testScales(),
        );

        const info = await service.listAssetInfo({ assetIds: [1, 2] });

        expect(transport.lastCall()?.method.name).toBe("ListAssetInfo");
        expect(transport.lastCall()?.message).toEqual({ assetIds: [1, 2] });
        expect(info[0]).toEqual({
            assetId: 1,
            editorial: {
                description: "Peer-to-peer cash.",
                websiteUrl: "https://bitcoin.org",
                whitepaperUrl: "",
                explorerUrls: ["https://mempool.space"],
                xUrl: "",
                telegramUrl: "",
                discordUrl: "",
                githubUrl: "",
                issueDate: "2009-01-03",
                issuePrice: { amount: "0", currency: "USD" },
            },
            editorialUpdatedAt: 1_700_000_000_000,
            marketStats: null,
        });
        expect(info[1]).toMatchObject({
            assetId: 2,
            editorial: { description: "", issueDate: null, issuePrice: null },
            editorialUpdatedAt: null,
        });
    });

    it("reads market statistics as exact decimals with their source and time", async () => {
        const asOf = { seconds: 1_700_000_000n, nanos: 0 };
        const transport = unaryTransport({
            assetInfo: [
                {
                    assetId: 1,
                    marketStats: {
                        circulatingSupply: {
                            value: "19876543.123456789012345678",
                            source: AssetDataSource.COINMARKETCAP,
                            asOf,
                        },
                        maxSupplyUnlimited: { source: AssetDataSource.POLYESTER, asOf },
                        rank: { value: "1", source: 9, asOf },
                    },
                },
            ],
        });
        const service = new MarketDataService(
            { publicApi: transport.transport },
            realtimeClientStub().realtime,
            testScales(),
        );

        const [info] = await service.listAssetInfo();

        expect(info?.marketStats).toEqual({
            circulatingSupply: {
                value: "19876543.123456789012345678",
                source: "coinmarketcap",
                asOf: 1_700_000_000_000,
            },
            totalSupply: null,
            maxSupply: null,
            maxSupplyUnlimited: { source: "polyester", asOf: 1_700_000_000_000 },
            marketCapUsd: null,
            fullyDilutedMarketCapUsd: null,
            rank: { value: "1", source: "unspecified", asOf: 1_700_000_000_000 },
        });
    });

    it("rejects more than 1000 asset IDs before sending", async () => {
        const transport = unaryTransport({});
        const service = new MarketDataService(
            { publicApi: transport.transport },
            realtimeClientStub().realtime,
            testScales(),
        );

        await expect(
            service.listAssetInfo({ assetIds: Array.from({ length: 1001 }, (_, i) => i) }),
        ).rejects.toThrow();
        expect(transport.calls).toHaveLength(0);
    });
});

describe("MarketDataService.subscribePriceBand", () => {
    const NOW_MS = 1_800_000_000_000;
    const ns = (ms: number) => BigInt(ms) * 1_000_000n;
    const channel = "public:spot:market:price_band:101:proto";

    /** A confirmed ACTIVE band; `asOfMs` defaults to now and `validUntil` is 5 s later. */
    function band(epoch: bigint, updateId: bigint, asOfMs = NOW_MS, init = {}) {
        return create(Proto.LivePriceBandSchema, {
            symbolId: 101,
            state: Proto.PriceBandState.ACTIVE,
            referencePriceTicks: 61_000_000_000_000n,
            referenceSource: Proto.PriceBandReferenceSource.LAST_TRADE,
            maxBuyPriceTicks: 64_000_000_000_000n,
            minSellPriceTicks: 58_000_000_000_000n,
            parameters: { lowerBps: 500, upperBps: 500, referenceWindowMs: 60_000 },
            updatedTsNs: ns(asOfMs),
            epoch,
            updateId,
            asOfTsNs: ns(asOfMs),
            validUntilTsNs: ns(asOfMs + 5_000),
            ...init,
        });
    }
    /** The stream's UNKNOWN for the confirmation `epoch/updateId/asOfMs`. */
    function unknown(epoch: bigint, updateId: bigint, asOfMs: number) {
        return create(Proto.LivePriceBandSchema, {
            symbolId: 101,
            state: Proto.PriceBandState.UNKNOWN,
            updatedTsNs: ns(asOfMs),
            epoch,
            updateId,
            asOfTsNs: ns(asOfMs),
            validUntilTsNs: ns(asOfMs),
        });
    }
    const response = (b: Proto.LivePriceBand) =>
        create(Proto.GetPriceBandResponseSchema, { band: b });

    function setup(seed: () => unknown) {
        const realtime = realtimeClientStub();
        const transport = unaryTransport(seed as never);
        const service = new MarketDataService(
            { publicApi: transport.transport },
            realtime.realtime,
            testScales(),
        );
        const onEvent = vi.fn();
        const onError = vi.fn();
        const unsubscribe = service.subscribePriceBand({ symbolId: 101, onEvent, onError });
        const publish = (b: Proto.LivePriceBand) => realtime.params?.onPublication(response(b));
        const emitted = () =>
            onEvent.mock.calls.map(([b]) => `${b.state} ${b.epoch}/${b.updateId}/${b.asOfTsNs}`);
        return { realtime, transport, onEvent, onError, unsubscribe, publish, emitted };
    }
    const settle = () => vi.advanceTimersByTimeAsync(0);
    const id = (epoch: number, updateId: number, asOfMs = NOW_MS) =>
        `${epoch}/${updateId}/${ns(asOfMs)}`;

    beforeEach(() => {
        vi.useFakeTimers({ now: NOW_MS });
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it("seeds from getPriceBand on the price band proto channel and emits the formatted band", async () => {
        const { realtime, transport, onEvent, onError } = setup(() => response(band(3n, 41n)));

        expect(realtime.params?.channel).toBe(channel);
        expect(realtime.params?.schema).toBe(Proto.GetPriceBandResponseSchema);
        realtime.params?.onConnected?.();
        await settle();

        expect(transport.lastCall()?.method.name).toBe("GetPriceBand");
        expect(transport.lastCall()?.message).toEqual({ symbolId: 101 });
        expect(onEvent).toHaveBeenCalledTimes(1);
        expect(onEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                symbolId: 101,
                state: "active",
                maxBuyPrice: "64000",
                minSellPrice: "58000",
                validUntilMs: NOW_MS + 5_000,
            }),
        );
        expect(onError).not.toHaveBeenCalled();
    });

    it("emits only newer bands by epoch, then updateId, then asOf, through reconnect replays", async () => {
        const { realtime, publish, emitted } = setup(() => response(band(3n, 41n)));
        realtime.params?.onConnected?.();
        await settle();

        publish(band(3n, 40n)); // older updateId
        publish(band(3n, 41n)); // duplicate
        publish(band(2n, 99n)); // older epoch, greater updateId
        publish(band(3n, 41n, NOW_MS + 1_000)); // same update, re-sent later
        publish(band(4n, 1n, NOW_MS + 1_000)); // new epoch restarts updateId

        // Reconnect: the re-seed and the recovered history are older than what was emitted.
        realtime.params?.onDisconnected?.();
        realtime.params?.onConnected?.();
        publish(band(3n, 41n, NOW_MS + 1_000));
        await settle();
        publish(band(4n, 1n, NOW_MS + 1_000));

        expect(emitted()).toEqual([
            `active ${id(3, 41)}`,
            `active ${id(3, 41, NOW_MS + 1_000)}`,
            `active ${id(4, 1, NOW_MS + 1_000)}`,
        ]);
    });

    it.each([
        ["the stream got ahead of the seed", 42n, 41n],
        ["the seed got ahead of the stream", 41n, 42n],
    ])("emits only the newest band when %s", async (_case, streamed, seeded) => {
        let resolveSeed!: (value: unknown) => void;
        const { realtime, publish, emitted } = setup(
            () => new Promise((resolve) => (resolveSeed = resolve)),
        );
        realtime.params?.onConnected?.();
        await settle();

        publish(band(3n, streamed));
        resolveSeed(response(band(3n, seeded)));
        await settle();

        expect(emitted()).toEqual([`active ${id(3, 42)}`]);
    });

    it("keeps UNKNOWN on a tie and replaces it with a later confirmation", async () => {
        const { realtime, publish, emitted, onEvent } = setup(() => response(band(3n, 41n)));
        realtime.params?.onConnected?.();
        await settle();

        publish(unknown(3n, 41n, NOW_MS)); // same confirmation: UNKNOWN wins
        publish(band(3n, 41n)); // a late copy of the confirmation it replaced
        publish(unknown(3n, 41n, NOW_MS)); // repeated UNKNOWN
        publish(band(3n, 41n, NOW_MS + 2_000)); // the band returns

        expect(emitted()).toEqual([
            `active ${id(3, 41)}`,
            `unknown ${id(3, 41)}`,
            `active ${id(3, 41, NOW_MS + 2_000)}`,
        ]);
        expect(onEvent.mock.calls[1]?.[0]).toMatchObject({
            referencePrice: null,
            maxBuyPrice: null,
            minSellPrice: null,
            referenceSource: "unspecified",
            parameters: null,
            validUntilMs: NOW_MS,
        });
    });

    it.each(["PRICE_BAND_STALE", "PRICE_BAND_UNKNOWN"])(
        "emits an unknown band, not an error, when the seed is refused %s",
        async (code) => {
            const { realtime, publish, emitted, onError } = setup(() => {
                throw new ServiceUnavailableError(code);
            });
            realtime.params?.onConnected?.();
            await settle();

            expect(emitted()).toEqual(["unknown 0/0/0"]);
            expect(onError).not.toHaveBeenCalled();

            publish(band(3n, 41n));
            expect(emitted()).toEqual(["unknown 0/0/0", `active ${id(3, 41)}`]);
        },
    );

    it("reports other seed failures and still delivers the stream", async () => {
        const { realtime, publish, emitted, onError } = setup(() => {
            throw new ResourceNotFoundError("UNKNOWN_SYMBOL");
        });
        realtime.params?.onConnected?.();
        await settle();

        expect(onError).toHaveBeenCalledWith(
            expect.objectContaining({ channel, type: "snapshot" }),
        );
        publish(band(3n, 41n));
        expect(emitted()).toEqual([`active ${id(3, 41)}`]);
    });

    it("emits a stale seed as unknown", async () => {
        const { realtime, emitted } = setup(() => response(band(3n, 41n, NOW_MS - 5_000)));
        realtime.params?.onConnected?.();
        await settle();

        expect(emitted()).toEqual([`unknown ${id(3, 41, NOW_MS - 5_000)}`]);
    });

    it("emits unknown when validUntil passes with no newer band, and stops after unsubscribe", async () => {
        const { realtime, publish, emitted, unsubscribe } = setup(() => response(band(3n, 41n)));
        realtime.params?.onConnected?.();
        await settle();

        await vi.advanceTimersByTimeAsync(2_000);
        publish(band(3n, 41n, NOW_MS + 2_000)); // the re-send pushes validUntil out
        await vi.advanceTimersByTimeAsync(4_999);
        expect(emitted()).toHaveLength(2);

        await vi.advanceTimersByTimeAsync(1);
        expect(emitted()).toEqual([
            `active ${id(3, 41)}`,
            `active ${id(3, 41, NOW_MS + 2_000)}`,
            `unknown ${id(3, 41, NOW_MS + 2_000)}`,
        ]);

        publish(band(3n, 42n, NOW_MS + 8_000));
        unsubscribe();
        await vi.advanceTimersByTimeAsync(10_000);
        expect(emitted()).toHaveLength(4);
        expect(realtime.unsubscribe).toHaveBeenCalledTimes(1);
    });
});
