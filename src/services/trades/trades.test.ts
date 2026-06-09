import { create } from "@bufbuild/protobuf";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EnrichedPairConfig } from "../../catalogs/index.js";
import * as ProtoOrders from "../../gen/orders/v1/orders_pb.js";
import * as ProtoRead from "../../gen/orders/v1/orders_read_pb.js";
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
    name: "Tether USD",
    quantityDisplayDecimals: 6,
    quantityScale: 6,
};

const btcUsdtPair: EnrichedPairConfig = {
    symbolId: 101,
    symbol: "BTC-USDT",
    baseAsset: btc,
    quoteAsset: usdt,
    tickSize: "0.000001",
    stepSize: "0.00000001",
    minNotionalQuote: "1",
    minQtyBase: "0.00000001",
    allowBuyFeeFromReceived: false,
    defaultMarketSlippagePctBuy: 0,
    defaultMarketSlippagePctSell: 0,
    maxClientRefDriftPct: 0,
    listingAt: null,
    delistingAt: null,
    status: "enabled",
};

const userTrade = {
    tradeId: 3n,
    orderId: 2n,
    subaccountId: 12n,
    symbolId: 101,
    side: ProtoOrders.Side.SELL,
    isMaker: true,
    feeSource: ProtoOrders.FeeSource.QUOTE,
    qtyScaled: 123_456_789n,
    priceTicks: 1_234_567n,
    feeScaled: 1_000n,
    tsNs: 1_700_000_000_000_000_000n,
    matchId: 22n,
};

function seedPairCatalog() {
    return createTestCatalog({ assets: [btc, usdt], pairs: [btcUsdtPair] });
}

describe("TradesService", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("normalizes list filters, resolver defaults, signal, and parses trades", async () => {
        const catalog = seedPairCatalog();
        const controller = new AbortController();
        const transport = unaryTransport({ trades: [userTrade], nextPageToken: "next-page" });
        const service = new TradesService(
            transport.transport,
            realtimeClientStub().realtime,
            subaccountResolverStub("12"),
            catalog,
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
                    symbolLabel: "BTC-USDT",
                    sideLabel: "sell",
                    liquidityLabel: "maker",
                    feeSourceLabel: "quote",
                    qtyDisplay: "1.23456789",
                    priceDisplay: "1.234567",
                    fee: 0.001,
                    tsMs: 1_700_000_000_000,
                    matchId: 22,
                }),
            ],
        });
    });

    it("omits undefined list fields and lets explicit main scope force root scope", async () => {
        const transport = unaryTransport({ trades: [], nextPageToken: "" });
        const service = new TradesService(
            transport.transport,
            realtimeClientStub().realtime,
            subaccountResolverStub("12"),
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
        const catalog = seedPairCatalog();
        const transport = unaryTransport({
            trades: [{ ...userTrade, side: ProtoOrders.Side.SIDE_UNSPECIFIED }],
            nextPageToken: "",
        });
        const service = new TradesService(
            transport.transport,
            realtimeClientStub().realtime,
            undefined,
            catalog,
        );

        await expect(service.list()).rejects.toThrow(/\[UserTradeSchema\]: invalid side 0/);
    });

    it("wires private trade subscriptions and parses publications", () => {
        const catalog = seedPairCatalog();
        const realtime = realtimeClientStub();
        const onEvent = vi.fn();
        const onOpen = vi.fn();
        const onClose = vi.fn();
        const onError = vi.fn();
        const service = new TradesService(
            unaryTransport({}).transport,
            realtime.realtime,
            undefined,
            catalog,
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

        expect(onOpen).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onError).toHaveBeenCalledWith(error);
        expect(onEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                orderId: formatId(2n),
                symbolLabel: "BTC-USDT",
                sideLabel: "sell",
                liquidityLabel: "maker",
            }),
        );

        unsubscribe();
        expect(realtime.connectProtoChannel.mock.results[0]?.value).toHaveBeenCalledTimes(1);
    });

    it("throws on malformed trade publications", () => {
        const catalog = seedPairCatalog();
        const realtime = realtimeClientStub();
        const service = new TradesService(
            unaryTransport({}).transport,
            realtime.realtime,
            undefined,
            catalog,
        );

        service.subscribe({ accountId: "acct-1", onEvent: vi.fn() });

        expect(() =>
            realtime.params?.onPublication(
                create(ProtoRead.UserTradeSchema, {
                    ...userTrade,
                    side: ProtoOrders.Side.SIDE_UNSPECIFIED,
                }),
            ),
        ).toThrow(/\[UserTradeSchema\]: invalid side 0/);
    });
});
