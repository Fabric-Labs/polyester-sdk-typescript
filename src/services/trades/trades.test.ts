import { create } from "@bufbuild/protobuf";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as ProtoOrders from "../../gen/orders/v1/orders_pb.js";
import * as ProtoRead from "../../gen/orders/v1/orders_read_pb.js";
import type { EnrichedPairConfig } from "../../catalogs/index.js";
import { createCatalogSdkScales } from "../../shared/decimal-surface.js";
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
    tradeId: 3n,
    orderId: 2n,
    subaccountId: 12n,
    symbolId: 101,
    side: ProtoOrders.Side.SELL,
    isMaker: true,
    feeAsset: ProtoOrders.FeeAsset.QUOTE,
    qtyScaled: 123_456_789n,
    priceTicks: 1_234_567n,
    feeScaled: 1_000n,
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
            transport.transport,
            realtimeClientStub().realtime,
            subaccountResolverStub("12"),
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
        });
        expect(transport.lastCall()?.signal).toBe(controller.signal);
        expect(result).toEqual({
            nextPageToken: "next-page",
            trades: [
                expect.objectContaining({
                    tradeId: formatId(3n),
                    orderId: formatId(2n),
                    subaccountId: formatId(12n),
                    symbolId: 101,
                    sideLabel: "sell",
                    liquidityLabel: "maker",
                    feeAsset: "quote",
                    qty: "1.23456789",
                    price: "1.234567",
                    fee: "0.001",
                    tsNs: "1700000000000000000",
                    tsMs: 1_700_000_000_000,
                    matchId: "22",
                }),
            ],
        });
    });

    it("scales base-asset fees by the base asset quantity scale", async () => {
        const transport = unaryTransport({
            trades: [{ ...userTrade, feeAsset: ProtoOrders.FeeAsset.BASE }],
            nextPageToken: "",
        });
        const service = new TradesService(
            transport.transport,
            realtimeClientStub().realtime,
            undefined,
            testScales(),
        );

        const result = await service.list();

        expect(result.trades[0]).toMatchObject({
            feeAsset: "base",
            // 1000n at the BTC base-quantity scale (8), not the quote scale (6).
            fee: "0.00001",
        });
    });

    it("omits undefined list fields and lets explicit main scope force root scope", async () => {
        const transport = unaryTransport({ trades: [], nextPageToken: "" });
        const service = new TradesService(
            transport.transport,
            realtimeClientStub().realtime,
            subaccountResolverStub("12"),
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

    it("rejects user trades with unmapped backend side values", async () => {
        const transport = unaryTransport({
            trades: [{ ...userTrade, side: 999 as ProtoOrders.Side }],
            nextPageToken: "",
        });
        const service = new TradesService(
            transport.transport,
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
            transport.transport,
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
            unaryTransport({}).transport,
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
                tsNs: "1700000000000000000",
            }),
        );

        unsubscribe();
        expect(realtime.connectProtoChannel.mock.results[0]?.value).toHaveBeenCalledTimes(1);
    });

    it("queues publications until scales are ready and flushes them in order", async () => {
        const realtime = realtimeClientStub();
        const onEvent = vi.fn();
        const service = new TradesService(
            unaryTransport({}).transport,
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
            unaryTransport({}).transport,
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
