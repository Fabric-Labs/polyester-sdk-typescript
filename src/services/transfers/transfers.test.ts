import { afterEach, describe, expect, it, vi } from "vitest";
import * as Proto from "../../gen/ledger/read/v1/ledger_read_pb.js";
import { createTestCatalog } from "../../testing/catalog.js";
import { realtimeClientStub, unaryTransport } from "../../testing/service-harness.js";
import type { SubaccountResolver } from "../subaccount-resolver.js";
import { TransfersService } from "./transfers.js";

function seedAssetCatalog() {
    return createTestCatalog({
        assets: [
            {
                symbol: "USDC",
                ledgerId: 1,
                name: "USD Coin",
                quantityDisplayDecimals: 2,
                quantityScale: 18,
            },
        ],
    });
}

function transferRow(overrides: Partial<Proto.TransferRow> = {}): Proto.TransferRow {
    return {
        txId: "tx-1",
        assetId: 1,
        amount: { hi: 0n, lo: 1_000_000_000_000_000_000n },
        balanceAfter: { hi: 0n, lo: 2_000_000_000_000_000_000n },
        isDebit: false,
        type: 1030,
        accountCode: 301,
        pending: false,
        timestamp: 1_700_000_000_123_456_789n,
        onchain: false,
        linkId: 22n,
        flowId: " flow-1 ",
        ...overrides,
    } as Proto.TransferRow;
}

describe("TransfersService", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("normalizes list inputs, resolver defaults, signals, and response parsing", async () => {
        const catalog = seedAssetCatalog();
        const controller = new AbortController();
        const resolver: SubaccountResolver = {
            getDefaultSubaccountId: () => "11",
        };
        const transport = unaryTransport({
            transfers: [transferRow()],
            nextCursor: 42n,
        });
        const service = new TransfersService(
            transport.transport,
            realtimeClientStub().realtime,
            resolver,
            catalog,
        );

        await expect(
            service.list(
                {
                    ledger: 1,
                    limit: 25,
                    reversed: true,
                    timestampMin: 1_700_000_000_123,
                    timestampMax: 1_700_000_001_123,
                    code: 1030,
                    since: 1_700_000_000_000,
                },
                { signal: controller.signal },
            ),
        ).resolves.toEqual({
            transfers: [
                {
                    txId: "tx-1",
                    amount: "+1",
                    symbol: "USDC",
                    type: "internal_transfer",
                    accountCode: "unified_trading",
                    pending: false,
                    onchain: false,
                    timestamp: 1_700_000_000_123,
                    balanceAfter: "2",
                    isDebit: false,
                    linkId: 22,
                    flowId: "flow-1",
                },
            ],
            nextCursor: 42,
        });

        const captured = transport.lastCall();
        expect(captured?.method.localName).toBe("listTransfers");
        expect(captured).toMatchObject({
            signal: controller.signal,
            message: {
                subaccountId: 11n,
                ledger: 1,
                limit: 25,
                reversed: true,
                timestampMin: 1_700_000_000_123_000_000n,
                timestampMax: 1_700_000_001_123_000_000n,
                code: 1030,
                since: 1_700_000_000_000n,
            },
        });
    });

    it("returns null nextCursor for empty or zero backend cursors", async () => {
        const transport = unaryTransport({
            transfers: [],
            nextCursor: 0n,
        });
        const service = new TransfersService(transport.transport, realtimeClientStub().realtime);

        await expect(service.list({})).resolves.toEqual({
            transfers: [],
            nextCursor: null,
        });
    });

    it("rejects malformed backend transfers", async () => {
        const transport = unaryTransport({
            transfers: [transferRow({ timestamp: undefined })],
            nextCursor: 0n,
        });
        const service = new TransfersService(transport.transport, realtimeClientStub().realtime);

        await expect(service.list({})).rejects.toThrow();
    });

    it("uses private transfer channels and parses realtime publications", () => {
        const catalog = seedAssetCatalog();
        const realtime = realtimeClientStub();
        const service = new TransfersService(
            unaryTransport({}).transport,
            realtime.realtime,
            undefined,
            catalog,
        );
        const onEvent = vi.fn();
        const onOpen = vi.fn();
        const onClose = vi.fn();
        const onError = vi.fn();

        const unsubscribe = service.subscribe({
            accountId: "account-1",
            onEvent,
            onOpen,
            onClose,
            onError,
        });

        expect(realtime.params?.channel).toBe("private:ledger:transfers:account-1:proto");
        expect(realtime.params?.schema).toBe(Proto.TransferRowSchema);
        realtime.params?.onConnected?.();
        realtime.params?.onDisconnected?.();
        realtime.params?.onError?.({
            channel: "channel",
            type: "transport",
            error: { code: 0, message: "boom" },
        });
        realtime.params?.onPublication(transferRow());

        expect(onOpen).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onError).toHaveBeenCalledWith({
            channel: "channel",
            type: "transport",
            error: { code: 0, message: "boom" },
        });
        expect(onEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                txId: "tx-1",
                amount: "+1",
                symbol: "USDC",
                timestamp: 1_700_000_000_123,
            }),
        );

        expect(() =>
            realtime.params?.onPublication(transferRow({ timestamp: undefined })),
        ).toThrow();

        unsubscribe();
        expect(realtime.unsubscribe).toHaveBeenCalledTimes(1);
    });
});
