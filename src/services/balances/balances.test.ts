import { create } from "@bufbuild/protobuf";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Proto from "../../gen/ledger/read/v1/ledger_read_pb.js";
import { AccountCode, TransferCode } from "../../gen/ledger/v1/catalog_pb.js";
import { createCatalogSdkScales } from "../../shared/decimal-surface.js";
import { createTestCatalog } from "../../testing/catalog.js";
import {
    realtimeClientStub,
    subaccountResolverStub,
    unaryTransport,
    unaryTransportByMethod,
} from "../../testing/service-harness.js";
import { formatId } from "../../utils/base58-id.js";
import { toU128 } from "../../utils/u128.js";

const E18 = 10n ** 18n;
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
        fundingRevision: 102n,
    };
}

describe("BalancesService", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("normalizes list subaccount inputs, forwards signal, and converts ledger E18 wire balances", async () => {
        const cases = [
            {
                name: "resolver default",
                input: {},
                resolverDefault: formatId(7n),
                expected: 7n,
            },
            {
                name: "explicit subaccount",
                input: { account: { subaccountId: ` ${formatId(8n)} ` } },
                resolverDefault: formatId(7n),
                expected: 8n,
            },
            {
                name: "explicit main account",
                input: { account: "main" },
                resolverDefault: formatId(7n),
                expected: undefined,
            },
        ] as const;

        for (const testCase of cases) {
            const controller = new AbortController();
            const transport = unaryTransport({
                balances: [assetBalance(1, onePointFiveE18), assetBalance(999, onePointFiveE18)],
            });
            const service = new BalancesService(
                { authApi: transport.transport },
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
                    fundingRevision: "102",
                },
                {
                    assetId: 999,
                    funding: "0",
                    trading: "1.5",
                    reserved: "0",
                    available: "1.5",
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
            { authApi: transport.transport },
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
                    balance: [toU128(10n * E18), toU128(125n * 10n ** 17n)],
                },
                {
                    assetId: 999,
                    accountCode: AccountCode.FUNDING,
                    balance: [toU128(48_938_484n * 10n ** 13n), toU128(0n)],
                },
            ],
        });
        const service = new BalancesService(
            { authApi: transport.transport },
            realtimeClientStub().realtime,
            undefined,
            testScales(),
        );

        const history = await service.getBalanceHistory({
            account: { subaccountId: ` ${formatId(9n)} ` },
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

    it.each([-1, 1.5, 4_294_967_296])(
        "rejects an invalid balance-history ledger before transport: %s",
        async (ledger) => {
            const transport = unaryTransport({});
            const service = new BalancesService(
                { authApi: transport.transport },
                realtimeClientStub().realtime,
                undefined,
                testScales(),
            );

            await expect(
                service.getBalanceHistory({ account: "main", range: "1d", ledger }),
            ).rejects.toMatchObject({ name: "ValidationError" });
            expect(transport.unary).not.toHaveBeenCalled();
        },
    );

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
            btcPricesQ: [65_000_123_456_000n],
        });
        const service = new BalancesService(
            { authApi: transport.transport },
            realtimeClientStub().realtime,
            subaccountResolverStub(formatId(12n)),
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
        // Price-tick scale (1e9).
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
            { authApi: transport.transport },
            realtimeClientStub().realtime,
            undefined,
            testScales(),
        );

        const history = await service.getEquityHistory({ range: "30d" });

        expect(history.btcPrices).toEqual([]);
    });

    it("returns root portfolio equity history and snapshot as public decimal and ID values", async () => {
        const controller = new AbortController();
        const transport = unaryTransportByMethod({
            getPortfolioEquityHistorySeries: {
                range: Proto.BalanceRange.DAY_7,
                bucket: "1h",
                startTsSec: 100,
                endTsSec: 200,
                quoteAsset: "USDT",
                points: 2,
                series: [
                    {
                        grouping: {
                            case: "portfolioAccount",
                            value: { accountId: 42n, remaining: false },
                        },
                        equityQ: [12_345n, -100n],
                    },
                    {
                        grouping: {
                            case: "portfolioAccount",
                            value: { remaining: true },
                        },
                        equityQ: [50_000n, 0n],
                    },
                ],
                btcPricesQ: [65_000_123_456_000n, 64_000_000_000_000n],
            },
            getPortfolioEquitySnapshot: {
                quoteAsset: "USDT",
                totalEquityQ: 1_000_000n,
                accounts: [{ accountId: 42n, equityQ: 12_345n, topAssetIds: [1, 999] }],
                assets: [
                    { assetId: 999, balance: toU128(123_456_789n * 10n ** 11n), equityQ: -100n },
                ],
                btcPriceQ: 0n,
            },
        });
        const service = new BalancesService(
            { authApi: transport.transport },
            realtimeClientStub().realtime,
            undefined,
            testScales(),
        );

        const history = await service.getPortfolioEquityHistory(
            { range: "7d" },
            { signal: controller.signal },
        );

        expect(transport.calls[0]?.message).toEqual({ range: Proto.BalanceRange.DAY_7 });
        expect(transport.calls[0]?.signal).toBe(controller.signal);
        expect(history).toEqual({
            range: "7d",
            bucket: "1h",
            startTsSec: 100,
            endTsSec: 200,
            quoteAsset: "USDT",
            points: 2,
            series: [
                {
                    grouping: {
                        type: "portfolioAccount",
                        accountId: formatId(42n),
                        remaining: false,
                    },
                    equity: ["1.2345", "-0.01"],
                },
                {
                    grouping: { type: "portfolioAccount", remaining: true },
                    equity: ["5", "0"],
                },
            ],
            btcPrices: ["65000.123456", "64000"],
        });

        await expect(service.getPortfolioEquitySnapshot()).resolves.toEqual({
            quoteAsset: "USDT",
            totalEquity: "100",
            accounts: [{ accountId: formatId(42n), equity: "1.2345", topAssetIds: [1, 999] }],
            assets: [{ assetId: 999, balance: "12.3456789", equity: "-0.01" }],
            btcPrice: "0",
        });
        expect(transport.calls[1]?.message).toEqual({});
    });

    it("maps unmapped backend balance ranges to unspecified", async () => {
        const transport = unaryTransport({
            range: 999 as Proto.BalanceRange,
            bucket: "1h",
            startTsSec: 100,
            endTsSec: 200,
            points: 0,
            series: [],
        });
        const service = new BalancesService(
            { authApi: transport.transport },
            realtimeClientStub().realtime,
            undefined,
            testScales(),
        );

        await expect(service.getBalanceHistory({ range: "1d" })).resolves.toMatchObject({
            range: "unspecified",
        });
    });

    it("seeds the balance stream with the snapshot position", async () => {
        const transport = unaryTransport({
            balances: [assetBalance(1, onePointFiveE18)],
            tradingEpoch: 4_294_967_303n,
            tradingSequence: 42n,
            tradingAppliedThroughTsNs: 1_767_225_600_123_456_789n,
        });
        const service = new BalancesService(
            { authApi: transport.transport },
            realtimeClientStub().realtime,
            undefined,
            testScales(),
        );

        await expect(service.getSnapshot()).resolves.toMatchObject({
            balances: [{ assetId: 1, trading: "1.5" }],
            tradingEpoch: "4294967303",
            tradingSequence: "42",
            tradingAppliedThroughTsNs: "1767225600123456789",
        });
    });

    it("seeds the balance subscription with a snapshot and applies the next Trading step", async () => {
        const realtime = realtimeClientStub();
        const transport = unaryTransport({
            balances: [assetBalance(1, onePointFiveE18)],
            tradingEpoch: 7n,
            tradingSequence: 42n,
            tradingAppliedThroughTsNs: 90n,
        });
        const onEvent = vi.fn();
        const onOpen = vi.fn();
        const onClose = vi.fn();
        const onError = vi.fn();
        const service = new BalancesService(
            { authApi: transport.transport },
            realtime.realtime,
            undefined,
            testScales(),
        );

        const unsubscribe = service.subscribe({
            accountId: "acct-1",
            account: { subaccountId: formatId(8n) },
            onEvent,
            onOpen,
            onClose,
            onError,
        });

        expect(realtime.params?.channel).toBe("private:ledger:balances:acct-1:proto");
        expect(realtime.params?.schema).toBe(Proto.BalanceUpdateSchema);

        realtime.params?.onConnected?.();
        realtime.params?.onPublication(
            create(Proto.BalanceUpdateSchema, {
                account: AccountCode.TRADING,
                tradingEpoch: 7n,
                tradingSequence: 43n,
                complete: true,
                tradingAppliedThroughTsNs: 99n,
                balances: [{ assetId: 1, trading: { hi: 0n, lo: 2n * E18 } }],
                transfers: [
                    {
                        assetId: 1,
                        amountE18: { hi: 0n, lo: onePointFiveE18 },
                        transferCode: TransferCode.TRADE_QUOTE,
                        accountCode: AccountCode.TRADING,
                        tsUs: 1n,
                        tsNs: 1_000n,
                        transferId: "5",
                    },
                ],
            }),
        );
        await flushAsync();

        expect(onOpen).toHaveBeenCalledTimes(1);
        expect((transport.lastCall()?.message as { subaccountId?: bigint }).subaccountId).toBe(8n);
        expect(onEvent.mock.calls.map(([event]) => event)).toEqual([
            expect.objectContaining({
                kind: "snapshot",
                tradingEpoch: "7",
                tradingSequence: "42",
                balances: [
                    expect.objectContaining({ assetId: 1, trading: "1.5", fundingRevision: "102" }),
                ],
            }),
            expect.objectContaining({
                kind: "trading",
                tradingSequence: "43",
                tradingAppliedThroughTsNs: "99",
                balances: [
                    expect.objectContaining({ assetId: 1, trading: "2", fundingRevision: "102" }),
                ],
                transfers: [expect.objectContaining({ transferId: "5", tsNs: "1000" })],
            }),
        ]);
        expect(onError).not.toHaveBeenCalled();

        realtime.params?.onDisconnected?.();
        expect(onClose).toHaveBeenCalledTimes(1);
        unsubscribe();
        expect(realtime.connectProtoChannel.mock.results[0]?.value).toHaveBeenCalledTimes(1);
    });

    it("pins the snapshot scope when subscribing, so an account switch does not change it", async () => {
        const realtime = realtimeClientStub();
        const transport = unaryTransport({ balances: [] });
        let active: string | null = formatId(8n);
        const service = new BalancesService(
            { authApi: transport.transport },
            realtime.realtime,
            { getDefaultSubaccountId: () => active },
            testScales(),
        );

        service.subscribe({ accountId: "acct-8", onEvent: vi.fn() });
        active = formatId(9n);
        realtime.params?.onConnected?.();
        await flushAsync();

        expect((transport.lastCall()?.message as { subaccountId?: bigint }).subaccountId).toBe(8n);
    });

    it("routes malformed balance publications to the subscription onError", async () => {
        const realtime = realtimeClientStub();
        const onEvent = vi.fn();
        const onError = vi.fn();
        const service = new BalancesService(
            { authApi: unaryTransport({}).transport },
            realtime.realtime,
            undefined,
            testScales(),
        );

        service.subscribe({ accountId: "acct-1", onEvent, onError });

        realtime.params?.onPublication({
            account: AccountCode.TRADING,
            balances: [{ assetId: 1, trading: { hi: 1n << 64n, lo: 0n } }],
            transfers: [],
        } as never);
        await flushAsync();

        expect(onEvent).not.toHaveBeenCalled();
        expect(onError.mock.calls[0]?.[0]).toMatchObject({
            channel: "private:ledger:balances:acct-1:proto",
            type: "publication_handler",
        });
        expect(onError.mock.calls[0]?.[0].error.message).toMatch(
            /U128 hi must be between 0 and 2\^64 - 1/,
        );
    });
});
