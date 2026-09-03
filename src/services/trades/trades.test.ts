import { create } from "@bufbuild/protobuf";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as ProtoOrders from "../../gen/orders/v1/orders_pb.js";
import * as ProtoRead from "../../gen/orders/v1/orders_read_pb.js";
import type { EnrichedPairConfig } from "../../catalogs/index.js";
import { RealtimeClient } from "../../realtime/client.js";
import { createCatalogSdkScales } from "../../shared/decimal-surface.js";
import { AuthenticationError, ValidationError } from "../../shared/errors.js";
import { createTestCatalog } from "../../testing/catalog.js";
import {
    realtimeClientStub,
    subaccountResolverStub,
    unaryTransport,
} from "../../testing/service-harness.js";
import { formatId } from "../../utils/base58-id.js";
import { TradesService } from "./trades.js";

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

const userTrade = {
    orderId: 2n,
    symbolId: 101,
    side: ProtoOrders.Side.SELL,
    isMaker: true,
    feeAsset: ProtoOrders.FeeAsset.QUOTE,
    qtyScaled: 123_456_789n,
    priceTicks: 1_234_567n,
    feeAmountE18: { hi: 0n, lo: 1_000_000_000_000_000n },
    referralShareAmountE18: { hi: 0n, lo: 250_000_000_000_000n },
    feeIsRebate: false,
    tsNs: 1_700_000_000_000_000_000n,
    matchId: 22n,
};

describe("TradesService", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("normalizes list filters, resolver defaults, signal, and parses trades to decimal strings", async () => {
        const controller = new AbortController();
        const transport = unaryTransport({ trades: [userTrade], nextPageToken: "next-page" });
        const service = new TradesService(
            { authApi: transport.transport },
            realtimeClientStub().realtime,
            subaccountResolverStub(formatId(12n)),
            testScales(),
        );

        const result = await service.list(
            {
                symbolId: " 101 ",
                side: "sell",
                startTsNs: "100",
                endTsNs: "200",
                limit: 10,
                pageToken: " next ",
                afterMatchId: "21",
            },
            { signal: controller.signal },
        );

        expect(transport.lastCall()?.message).toEqual({
            subaccountId: 12n,
            symbolId: 101,
            side: ProtoOrders.Side.SELL,
            startTsNs: 100n,
            endTsNs: 200n,
            limit: 10,
            pageToken: "next",
            afterMatchId: 21n,
        });
        expect(transport.lastCall()?.signal).toBe(controller.signal);
        expect(result).toEqual({
            nextPageToken: "next-page",
            trades: [
                expect.objectContaining({
                    orderId: formatId(2n),
                    symbolId: 101,
                    sideLabel: "sell",
                    liquidityLabel: "maker",
                    feeAsset: "quote",
                    qty: "1.23456789",
                    price: "1.234567",
                    fee: "0.001",
                    referralShare: "0.00025",
                    feeIsRebate: false,
                    tsNs: "1700000000000000000",
                    tsMs: 1_700_000_000_000,
                    matchId: "22",
                }),
            ],
        });
    });

    it("decodes base-asset fees from their exact E18 amount", async () => {
        const transport = unaryTransport({
            trades: [{ ...userTrade, feeAsset: ProtoOrders.FeeAsset.BASE }],
            nextPageToken: "",
        });
        const service = new TradesService(
            { authApi: transport.transport },
            realtimeClientStub().realtime,
            undefined,
            testScales(),
        );

        const result = await service.list();

        expect(result.trades[0]).toMatchObject({
            feeAsset: "base",
            fee: "0.001",
        });
    });

    it("omits undefined list fields and lets explicit main scope force root scope", async () => {
        const transport = unaryTransport({ trades: [], nextPageToken: "" });
        const service = new TradesService(
            { authApi: transport.transport },
            realtimeClientStub().realtime,
            subaccountResolverStub(formatId(12n)),
            testScales(),
        );

        await expect(service.list({ account: "main", symbolId: "101" })).resolves.toEqual({
            trades: [],
            nextPageToken: "",
        });

        const message = transport.lastCall()?.message as Record<string, unknown>;
        expect(message).toEqual({ symbolId: 101 });
        expect(Object.hasOwn(message, "subaccountId")).toBe(false);
    });

    it("rejects afterMatchId without a symbolId before any request", async () => {
        const transport = unaryTransport({ trades: [], nextPageToken: "" });
        const service = new TradesService(
            { authApi: transport.transport },
            realtimeClientStub().realtime,
            undefined,
            testScales(),
        );
        const rule = /symbolId is required when afterMatchId is set/;

        await expect(
            // @ts-expect-error afterMatchId requires symbolId
            service.list({ afterMatchId: "10" }),
        ).rejects.toThrow(ValidationError);
        await expect(
            // @ts-expect-error afterMatchId requires symbolId
            service.list({ afterMatchId: "10" }),
        ).rejects.toThrow(rule);
        await expect(service.list({ afterMatchId: "10", symbolId: "0" })).rejects.toThrow(rule);
        await expect(service.list({ afterMatchId: "10", symbolId: "" })).rejects.toThrow(rule);
        expect(transport.unary).not.toHaveBeenCalled();
    });

    it("sends afterMatchId together with a positive symbolId", async () => {
        const transport = unaryTransport({ trades: [], nextPageToken: "" });
        const service = new TradesService(
            { authApi: transport.transport },
            realtimeClientStub().realtime,
            undefined,
            testScales(),
        );

        await service.list({ afterMatchId: "10", symbolId: "3" });

        expect(transport.lastCall()?.message).toEqual({ symbolId: 3, afterMatchId: 10n });
    });

    it("keeps browsing without a cursor working with and without a symbolId", async () => {
        const transport = unaryTransport({ trades: [], nextPageToken: "" });
        const service = new TradesService(
            { authApi: transport.transport },
            realtimeClientStub().realtime,
            undefined,
            testScales(),
        );

        await service.list({ symbolId: "3" });
        expect(transport.lastCall()?.message).toEqual({ symbolId: 3 });

        await service.list({});
        expect(transport.lastCall()?.message).toEqual({});
    });

    it("rejects user trades with unmapped backend side values", async () => {
        const transport = unaryTransport({
            trades: [{ ...userTrade, side: 999 as ProtoOrders.Side }],
            nextPageToken: "",
        });
        const service = new TradesService(
            { authApi: transport.transport },
            realtimeClientStub().realtime,
            undefined,
            testScales(),
        );

        await expect(service.list()).rejects.toThrow(/\[UserTradeSchema\]: invalid side 999/);
    });

    it("rejects user trades whose symbol is unknown to the catalog", async () => {
        const transport = unaryTransport({
            trades: [{ ...userTrade, symbolId: 999 }],
            nextPageToken: "",
        });
        const service = new TradesService(
            { authApi: transport.transport },
            realtimeClientStub().realtime,
            undefined,
            testScales(),
        );

        await expect(service.list()).rejects.toThrow(/symbolId not found: 999/);
    });

    it("wires private trade subscriptions and parses publications", async () => {
        const realtime = realtimeClientStub();
        const onEvent = vi.fn();
        const onOpen = vi.fn();
        const onClose = vi.fn();
        const onError = vi.fn();
        const service = new TradesService(
            { authApi: unaryTransport({}).transport },
            realtime.realtime,
            undefined,
            testScales(),
        );

        const unsubscribe = service.subscribe({
            accountId: "acct-1",
            onEvent,
            onOpen,
            onClose,
            onError,
        });

        expect(realtime.params?.channel).toBe("private:spot:trades:acct-1:proto");
        expect(realtime.params?.schema).toBe(ProtoRead.UserTradeSchema);

        realtime.params?.onConnected?.();
        realtime.params?.onDisconnected?.();
        const error = { channel: "c", type: "decode", error: { code: 1, message: "bad" } };
        realtime.params?.onError?.(error);
        realtime.params?.onPublication(create(ProtoRead.UserTradeSchema, userTrade));
        await flushAsync();

        expect(onOpen).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onError).toHaveBeenCalledWith(error);
        expect(onEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                orderId: formatId(2n),
                sideLabel: "sell",
                liquidityLabel: "maker",
                feeAsset: "quote",
                qty: "1.23456789",
                price: "1.234567",
                fee: "0.001",
                referralShare: "0.00025",
                feeIsRebate: false,
                tsNs: "1700000000000000000",
            }),
        );

        unsubscribe();
        expect(realtime.connectProtoChannel.mock.results[0]?.value).toHaveBeenCalledTimes(1);
    });

    it("throws when a private subscription has neither authentication nor an error observer", () => {
        const service = new TradesService(
            { authApi: unaryTransport({}).transport },
            new RealtimeClient({
                wsUrl: "wss://stream.example.test",
                tokenEndpoint: "https://api.example.test/v1/rt/token",
                subscribeEndpoint: "https://api.example.test/v1/rt/subscribe",
            }),
            undefined,
            testScales(),
        );

        expect(() =>
            service.subscribe({
                accountId: "acct-1",
                onEvent: vi.fn(),
            }),
        ).toThrow(AuthenticationError);
    });

    it("queues publications until scales are ready and flushes them in order", async () => {
        const realtime = realtimeClientStub();
        const onEvent = vi.fn();
        const service = new TradesService(
            { authApi: unaryTransport({}).transport },
            realtime.realtime,
            undefined,
            testScales(),
        );

        service.subscribe({ accountId: "acct-1", onEvent });

        // Published synchronously after subscribing — before catalog readiness
        // resolves — so both must queue and then flush in arrival order.
        realtime.params?.onPublication(create(ProtoRead.UserTradeSchema, userTrade));
        realtime.params?.onPublication(
            create(ProtoRead.UserTradeSchema, { ...userTrade, matchId: 23n }),
        );
        expect(onEvent).not.toHaveBeenCalled();

        await flushAsync();

        expect(onEvent).toHaveBeenCalledTimes(2);
        expect(onEvent.mock.calls[0]?.[0]).toMatchObject({ matchId: "22" });
        expect(onEvent.mock.calls[1]?.[0]).toMatchObject({ matchId: "23" });
    });

    it("routes malformed trade publications to the subscription onError", async () => {
        const realtime = realtimeClientStub();
        const onEvent = vi.fn();
        const onError = vi.fn();
        const service = new TradesService(
            { authApi: unaryTransport({}).transport },
            realtime.realtime,
            undefined,
            testScales(),
        );

        service.subscribe({ accountId: "acct-1", onEvent, onError });

        realtime.params?.onPublication(
            create(ProtoRead.UserTradeSchema, {
                ...userTrade,
                side: 999 as ProtoOrders.Side,
            }),
        );
        await flushAsync();

        expect(onEvent).not.toHaveBeenCalled();
        expect(onError.mock.calls[0]?.[0]).toMatchObject({
            channel: "private:spot:trades:acct-1:proto",
            type: "publication_handler",
        });
        expect(onError.mock.calls[0]?.[0].error.message).toMatch(/invalid side 999/);
    });
});
