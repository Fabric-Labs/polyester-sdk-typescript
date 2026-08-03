import { create } from "@bufbuild/protobuf";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Proto from "../../gen/ledger/read/v1/ledger_read_pb.js";
import { AccountCode } from "../../gen/ledger/v1/catalog_pb.js";
import { createCatalogSdkScales } from "../../shared/decimal-surface.js";
import { createTestCatalog } from "../../testing/catalog.js";
import {
    realtimeClientStub,
    subaccountResolverStub,
    unaryTransport,
} from "../../testing/service-harness.js";
import { BalancesService } from "./balances.js";

const usdt = {
    symbol: "USDT",
    ledgerId: 1,
    name: "Tether",
    quantityDisplayDecimals: 2,
    quantityScale: 6,
};
const btc = {
    symbol: "BTC",
    ledgerId: 999,
    name: "Bitcoin",
    quantityDisplayDecimals: 8,
    quantityScale: 8,
};

function testScales() {
    const catalog = createTestCatalog({ assets: [usdt, btc] });
    return createCatalogSdkScales(() => catalog);
}

const flushAsync = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const onePointFiveE18 = 1_500_000_000_000_000_000n;

function assetBalance(assetId: number, lo: bigint) {
    return {
        assetId,
        trading: { hi: 0n, lo },
        funding: { hi: 0n, lo: 0n },
        reserved: { hi: 0n, lo: 0n },
        available: { hi: 0n, lo },
        tradingRevision: 101n,
        fundingRevision: 102n,
    };
}

describe("BalancesService", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("normalizes list subaccount inputs, forwards signal, and converts ledger E18 wire balances", async () => {
        const cases = [
            { name: "resolver default", input: {}, resolverDefault: "7", expected: 7n },
            {
                name: "explicit subaccount",
                input: { account: { subaccountId: " 8 " } },
                resolverDefault: "7",
                expected: 8n,
            },
            {
                name: "explicit main account",
                input: { account: "main" },
                resolverDefault: "7",
                expected: undefined,
            },
        ] as const;

        for (const testCase of cases) {
            const controller = new AbortController();
            const transport = unaryTransport({
                balances: [assetBalance(1, onePointFiveE18), assetBalance(999, onePointFiveE18)],
            });
            const service = new BalancesService(
                transport.transport,
                realtimeClientStub().realtime,
                subaccountResolverStub(testCase.resolverDefault),
                testScales(),
            );

            const balances = await service.list(testCase.input, { signal: controller.signal });
            const message = transport.lastCall()?.message as { subaccountId?: bigint };

            expect(message.subaccountId, testCase.name).toBe(testCase.expected);
            expect(transport.lastCall()?.signal, testCase.name).toBe(controller.signal);
            expect(balances).toEqual([
                {
                    assetId: 1,
                    funding: "0",
                    trading: "1.5",
                    reserved: "0",
                    available: "1.5",
                    tradingRevision: "101",
                    fundingRevision: "102",
                },
                {
                    assetId: 999,
                    funding: "0",
                    trading: "1.5",
                    reserved: "0",
                    available: "1.5",
                    tradingRevision: "101",
                    fundingRevision: "102",
                },
            ]);
        }
    });

    it("preserves balances for assets unknown to the catalog", async () => {
        const transport = unaryTransport({
            balances: [assetBalance(404, 1n)],
        });
        const service = new BalancesService(
            transport.transport,
            realtimeClientStub().realtime,
            undefined,
            testScales(),
        );

        await expect(service.list()).resolves.toEqual([
            {
                assetId: 404,
                funding: "0",
                trading: "0.000000000000000001",
                reserved: "0",
                available: "0.000000000000000001",
                tradingRevision: "101",
                fundingRevision: "102",
            },
        ]);
    });

    it("normalizes balance history requests and converts balance series to decimal strings", async () => {
        const transport = unaryTransport({
            range: Proto.BalanceRange.DAY_7,
            bucket: "1h",
            startTsSec: 100,
            endTsSec: 200,
            points: 2,
            series: [
                {
                    assetId: 1,
                    accountCode: AccountCode.TRADING,
                    balanceQ: [100_000_000n, 125_000_000n],
                },
                {
                    assetId: 999,
                    accountCode: AccountCode.FUNDING,
                    balanceQ: [4_893_848_400n, 0n],
                },
            ],
        });
        const service = new BalancesService(
            transport.transport,
            realtimeClientStub().realtime,
            undefined,
            testScales(),
        );

        const history = await service.getBalanceHistory({
            account: { subaccountId: " 9 " },
            range: "7d",
            ledger: 1,
            accountCodes: ["trading"],
        });

        expect(transport.lastCall()?.message).toEqual({
            subaccountId: 9n,
            range: Proto.BalanceRange.DAY_7,
            ledger: 1,
            accountCodes: [AccountCode.TRADING],
        });
        expect(history).toEqual({
            range: "7d",
            bucket: "1h",
            startTsSec: 100,
            endTsSec: 200,
            points: 2,
            series: [
                { assetId: 1, accountCode: "trading", balance: ["10", "12.5"] },
                { assetId: 999, accountCode: "funding", balance: ["489.38484", "0"] },
            ],
        });
    });

    it("normalizes equity history defaults and converts equity and btc price series", async () => {
        const controller = new AbortController();
        const transport = unaryTransport({
            range: Proto.BalanceRange.DAY_30,
            bucket: "1d",
            startTsSec: 100,
            endTsSec: 200,
            quoteAsset: "USDT",
            points: 1,
            series: [
                {
                    grouping: {
                        case: "account",
                        value: { accountCode: AccountCode.TRADING, name: "trading" },
                    },
                    equityQ: [100n, -25_000n],
                },
            ],
            btcPricesQ: [65_000_123_456n],
        });
        const service = new BalancesService(
            transport.transport,
            realtimeClientStub().realtime,
            subaccountResolverStub("12"),
            testScales(),
        );

        const history = await service.getEquityHistory(
            { range: "30d", accountCodes: ["trading"] },
            { signal: controller.signal },
        );

        expect(transport.lastCall()?.message).toEqual({
            subaccountId: 12n,
            range: Proto.BalanceRange.DAY_30,
            accountCodes: [AccountCode.TRADING],
            groupBy: Proto.EquityGroupBy.GROUP_BY_ACCOUNT,
        });
        expect(transport.lastCall()?.signal).toBe(controller.signal);
        expect(history.series).toEqual([
            {
                grouping: { type: "account", accountCode: "trading", name: "trading" },
                // Fixed 1e4 equity scale from the proto contract.
                equity: ["0.01", "-2.5"],
            },
        ]);
        // Price-tick scale (1e6).
        expect(history.btcPrices).toEqual(["65000.123456"]);
    });

    it("defaults missing btc prices to an empty array", async () => {
        const transport = unaryTransport({
            range: Proto.BalanceRange.DAY_30,
            bucket: "1d",
            startTsSec: 100,
            endTsSec: 200,
            quoteAsset: "USDT",
            points: 0,
            series: [],
        });
        const service = new BalancesService(
            transport.transport,
            realtimeClientStub().realtime,
            undefined,
            testScales(),
        );

        const history = await service.getEquityHistory({ range: "30d" });

        expect(history.btcPrices).toEqual([]);
    });

    it("rejects balance history responses with unmapped backend enums", async () => {
        const transport = unaryTransport({
            range: 999 as Proto.BalanceRange,
            bucket: "1h",
            startTsSec: 100,
            endTsSec: 200,
            points: 0,
            series: [],
        });
        const service = new BalancesService(
            transport.transport,
            realtimeClientStub().realtime,
            undefined,
            testScales(),
        );

        await expect(service.getBalanceHistory({ range: "1d" })).rejects.toThrow(/received 999/);
    });

    it("wires balance subscriptions and parses publications to decimal strings", async () => {
        const realtime = realtimeClientStub();
        const onEvent = vi.fn();
        const onOpen = vi.fn();
        const onClose = vi.fn();
        const onError = vi.fn();
        const service = new BalancesService(
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

        expect(realtime.params?.channel).toBe("private:ledger:balances:acct-1:proto");
        expect(realtime.params?.schema).toBe(Proto.AssetBalanceSchema);

        realtime.params?.onConnected?.();
        realtime.params?.onDisconnected?.();
        const error = { channel: "c", type: "publication", error: { code: 1, message: "bad" } };
        realtime.params?.onError?.(error);

        realtime.params?.onPublication(
            create(Proto.AssetBalanceSchema, assetBalance(1, onePointFiveE18)),
        );
        realtime.params?.onPublication(
            create(Proto.AssetBalanceSchema, assetBalance(999, onePointFiveE18)),
        );
        await flushAsync();

        expect(onOpen).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onError).toHaveBeenCalledWith(error);
        expect(onEvent).toHaveBeenCalledTimes(2);
        expect(onEvent.mock.calls[0]?.[0]).toMatchObject({
            assetId: 1,
            trading: "1.5",
        });
        expect(onEvent.mock.calls[1]?.[0]).toMatchObject({
            assetId: 999,
            trading: "1.5",
        });

        unsubscribe();
        expect(realtime.connectProtoChannel.mock.results[0]?.value).toHaveBeenCalledTimes(1);
    });

    it("routes malformed balance publications to the subscription onError", async () => {
        const realtime = realtimeClientStub();
        const onEvent = vi.fn();
        const onError = vi.fn();
        const service = new BalancesService(
            unaryTransport({}).transport,
            realtime.realtime,
            undefined,
            testScales(),
        );

        service.subscribe({ accountId: "acct-1", onEvent, onError });

        realtime.params?.onPublication({
            assetId: 1,
            trading: { hi: 0n, lo: "bad" },
        } as never);
        await flushAsync();

        expect(onEvent).not.toHaveBeenCalled();
        expect(onError.mock.calls[0]?.[0]).toMatchObject({
            channel: "private:ledger:balances:acct-1:proto",
            type: "publication_handler",
        });
        expect(onError.mock.calls[0]?.[0].error.message).toMatch(
            /Invalid type: Expected bigint but received "bad"/,
        );
    });
});
