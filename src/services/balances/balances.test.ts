import { create } from "@bufbuild/protobuf";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Proto from "../../gen/ledger/read/v1/ledger_read_pb.js";
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
    name: "Tether USD",
    quantityDisplayDecimals: 6,
    quantityScale: 6,
};

const oneLedgerUnit = { hi: 0n, lo: 1_000_000_000_000_000_000n };

function seedAssets() {
    return createTestCatalog({ assets: [usdt] });
}

function assetBalance(assetId: number) {
    return {
        assetId,
        trading: oneLedgerUnit,
        funding: { hi: 0n, lo: 0n },
        reserved: { hi: 0n, lo: 0n },
        available: oneLedgerUnit,
    };
}

describe("BalancesService", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("normalizes list subaccount inputs, forwards signal, and filters unknown assets", async () => {
        const catalog = seedAssets();
        const cases = [
            { name: "resolver default", input: {}, resolverDefault: "7", expected: 7n },
            {
                name: "explicit subaccount",
                input: { subaccountId: " 8 " },
                resolverDefault: "7",
                expected: 8n,
            },
            {
                name: "blank explicit subaccount",
                input: { subaccountId: "" },
                resolverDefault: "7",
                expected: undefined,
            },
        ] as const;

        for (const testCase of cases) {
            const controller = new AbortController();
            const transport = unaryTransport({
                balances: [assetBalance(1), assetBalance(999)],
            });
            const service = new BalancesService(
                transport.transport,
                realtimeClientStub().realtime,
                subaccountResolverStub(testCase.resolverDefault),
                catalog,
            );

            const balances = await service.list(testCase.input, { signal: controller.signal });
            const message = transport.lastCall()?.message as { subaccountId?: bigint };

            expect(message.subaccountId, testCase.name).toBe(testCase.expected);
            expect(transport.lastCall()?.signal, testCase.name).toBe(controller.signal);
            expect(balances).toEqual([
                {
                    asset: usdt,
                    funding: 0,
                    unified: 1,
                    reserved: 0,
                    available: 1,
                },
            ]);
        }
    });

    it("normalizes balance history requests and parses scaled balance series", async () => {
        const catalog = seedAssets();
        const transport = unaryTransport({
            range: Proto.BalanceRange.DAY_7,
            bucket: "1h",
            startTsSec: 100,
            endTsSec: 200,
            points: 2,
            series: [{ assetId: 1, accountCode: 301, balanceQ: [10_000_000n, 12_500_000n] }],
        });
        const service = new BalancesService(
            transport.transport,
            realtimeClientStub().realtime,
            undefined,
            catalog,
        );

        const history = await service.getBalanceHistory({
            subaccountId: " 9 ",
            range: "7d",
            ledger: 1,
            accountCodes: [301],
        });

        expect(transport.lastCall()?.message).toEqual({
            subaccountId: 9n,
            range: Proto.BalanceRange.DAY_7,
            ledger: 1,
            accountCodes: [301],
        });
        expect(history).toEqual({
            range: "7d",
            bucket: "1h",
            startTsSec: 100,
            endTsSec: 200,
            points: 2,
            series: [{ asset: usdt, accountCode: 301, balances: [1, 1.25] }],
        });
    });

    it("normalizes equity history defaults and parses account groupings", async () => {
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
                    grouping: { case: "account", value: { code: 301, name: "trading" } },
                    equityQ: [100n],
                },
            ],
        });
        const service = new BalancesService(
            transport.transport,
            realtimeClientStub().realtime,
            subaccountResolverStub("12"),
        );

        const history = await service.getEquityHistory(
            { range: "30d", accountCodes: [301] },
            { signal: controller.signal },
        );

        expect(transport.lastCall()?.message).toEqual({
            subaccountId: 12n,
            range: Proto.BalanceRange.DAY_30,
            accountCodes: [301],
            groupBy: Proto.EquityGroupBy.GROUP_BY_ACCOUNT,
        });
        expect(transport.lastCall()?.signal).toBe(controller.signal);
        expect(history.series).toEqual([
            {
                grouping: { type: "account", accountCode: 301, name: "trading" },
                equityQ: [100n],
            },
        ]);
        expect(history.btcPricesQ).toEqual([]);
    });

    it("rejects balance history responses with unmapped backend enums", async () => {
        const transport = unaryTransport({
            range: Proto.BalanceRange.BALANCE_RANGE_UNSPECIFIED,
            bucket: "1h",
            startTsSec: 100,
            endTsSec: 200,
            points: 0,
            series: [],
        });
        const service = new BalancesService(transport.transport, realtimeClientStub().realtime);

        await expect(service.getBalanceHistory({ range: "1d" })).rejects.toThrow(
            /\[BalanceHistoryResponseSchema\]: invalid range 0/,
        );
    });

    it("wires balance subscriptions, filters unknown assets, and parses publications", () => {
        const catalog = seedAssets();
        const realtime = realtimeClientStub();
        const onEvent = vi.fn();
        const onOpen = vi.fn();
        const onClose = vi.fn();
        const onError = vi.fn();
        const service = new BalancesService(
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

        expect(realtime.params?.channel).toBe("private:ledger:balances:acct-1:proto");
        expect(realtime.params?.schema).toBe(Proto.AssetBalanceSchema);

        realtime.params?.onConnected?.();
        realtime.params?.onDisconnected?.();
        const error = { channel: "c", type: "publication", error: { code: 1, message: "bad" } };
        realtime.params?.onError?.(error);

        realtime.params?.onPublication(create(Proto.AssetBalanceSchema, assetBalance(1)));
        realtime.params?.onPublication(create(Proto.AssetBalanceSchema, assetBalance(999)));

        expect(onOpen).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onError).toHaveBeenCalledWith(error);
        expect(onEvent).toHaveBeenCalledTimes(1);
        expect(onEvent.mock.calls[0]?.[0]).toMatchObject({ asset: usdt, unified: 1 });

        unsubscribe();
        expect(realtime.connectProtoChannel.mock.results[0]?.value).toHaveBeenCalledTimes(1);
    });

    it("throws on malformed balance publications", () => {
        const catalog = seedAssets();
        const realtime = realtimeClientStub();
        const service = new BalancesService(
            unaryTransport({}).transport,
            realtime.realtime,
            undefined,
            catalog,
        );

        service.subscribe({ accountId: "acct-1", onEvent: vi.fn() });

        expect(() =>
            realtime.params?.onPublication({
                assetId: 1,
                trading: { hi: 0n, lo: "bad" },
            } as never),
        ).toThrow();
    });
});
