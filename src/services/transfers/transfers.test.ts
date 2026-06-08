import type { Transport } from "@connectrpc/connect";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setAssetCatalog } from "../../catalogs/market-data-catalog.js";
import * as Proto from "../../gen/ledger/read/v1/ledger_read_pb.js";
import type { RealtimeClient } from "../../realtime/index.js";
import type { SubaccountResolver } from "../subaccount-resolver.js";
import { TransfersService } from "./transfers.js";

type CapturedUnary = {
    method: string;
    signal: AbortSignal | undefined;
    headers: HeadersInit | undefined;
    message: Record<string, unknown>;
};

function transportWithResponse(
    response: Record<string, unknown>,
    capture?: (call: CapturedUnary) => void,
): Transport {
    return {
        unary: vi.fn(
            async (
                method: { localName: string },
                signal: AbortSignal | undefined,
                _timeoutMs: number | undefined,
                headers: HeadersInit | undefined,
                message: Record<string, unknown>,
            ) => {
                capture?.({
                    method: method.localName,
                    signal,
                    headers,
                    message,
                });
                return {
                    message: response,
                    header: new Headers(),
                    trailer: new Headers(),
                    stream: false,
                    service: undefined,
                    method: undefined,
                };
            },
        ),
        stream: vi.fn(),
    } as unknown as Transport;
}

function createRealtimeStub(): {
    realtime: RealtimeClient;
    params: Parameters<RealtimeClient["connectProtoChannel"]>[0] | undefined;
    unsubscribe: ReturnType<typeof vi.fn>;
} {
    let params: Parameters<RealtimeClient["connectProtoChannel"]>[0] | undefined;
    const unsubscribe = vi.fn();
    return {
        realtime: {
            connectProtoChannel: vi.fn(
                (nextParams: Parameters<RealtimeClient["connectProtoChannel"]>[0]) => {
                    params = nextParams;
                    return unsubscribe;
                },
            ),
        } as unknown as RealtimeClient,
        get params() {
            return params;
        },
        unsubscribe,
    };
}

function seedAssetCatalog(): void {
    setAssetCatalog([
        {
            symbol: "USDC",
            ledgerId: 1,
            name: "USD Coin",
            quantityDisplayDecimals: 2,
            quantityScale: 18,
        },
    ]);
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
        setAssetCatalog([]);
        vi.restoreAllMocks();
    });

    it("normalizes list inputs, resolver defaults, signals, and response parsing", async () => {
        seedAssetCatalog();
        let captured: CapturedUnary | undefined;
        const controller = new AbortController();
        const resolver: SubaccountResolver = {
            getDefaultSubaccountId: () => "11",
        };
        const service = new TransfersService(
            transportWithResponse(
                {
                    transfers: [transferRow()],
                    nextCursor: 42n,
                },
                (call) => {
                    captured = call;
                },
            ),
            createRealtimeStub().realtime,
            resolver,
        );

        await expect(
            service.list(
                {
                    ledger: 1,
                    limit: 25,
                    reversed: true,
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

        expect(captured).toMatchObject({
            method: "listTransfers",
            signal: controller.signal,
            message: {
                subaccountId: 11n,
                ledger: 1,
                limit: 25,
                reversed: true,
                since: 1_700_000_000_000n,
            },
        });
    });

    it("returns null nextCursor for empty or zero backend cursors", async () => {
        const service = new TransfersService(
            transportWithResponse({
                transfers: [],
                nextCursor: 0n,
            }),
            createRealtimeStub().realtime,
        );

        await expect(service.list({})).resolves.toEqual({
            transfers: [],
            nextCursor: null,
        });
    });

    it("rejects malformed backend transfers", async () => {
        const service = new TransfersService(
            transportWithResponse({
                transfers: [transferRow({ timestamp: undefined })],
                nextCursor: 0n,
            }),
            createRealtimeStub().realtime,
        );

        await expect(service.list({})).rejects.toThrow();
    });

    it("uses private transfer channels and parses realtime publications", () => {
        seedAssetCatalog();
        const realtime = createRealtimeStub();
        const service = new TransfersService(transportWithResponse({}), realtime.realtime);
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
