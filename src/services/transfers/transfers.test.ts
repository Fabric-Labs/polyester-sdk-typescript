import { afterEach, describe, expect, it, vi } from "vitest";
import { create } from "@bufbuild/protobuf";
import * as Proto from "../../gen/ledger/read/v1/ledger_read_pb.js";
import { U128Schema } from "../../gen/polyester/type/v1/u128_pb.js";
import { createCatalogSdkScales } from "../../shared/decimal-surface.js";
import { createTestCatalog } from "../../testing/catalog.js";
import { realtimeClientStub, unaryTransport } from "../../testing/service-harness.js";
import { formatId } from "../../utils/base58-id.js";
import type { SubaccountResolver } from "../subaccount-resolver.js";
import { TransfersService } from "./transfers.js";

const usdt = {
    symbol: "USDT",
    ledgerId: 1,
    name: "Tether",
    quantityDisplayDecimals: 2,
    quantityScale: 6,
};

function testScales() {
    const catalog = createTestCatalog({ assets: [usdt] });
    return createCatalogSdkScales(() => catalog);
}

const flushAsync = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const onePointFiveE18 = 1_500_000_000_000_000_000n;
const twoPointFiveE18 = 2_500_000_000_000_000_000n;

function transferRow(overrides: Partial<Proto.TransferRow> = {}): Proto.TransferRow {
    return {
        assetId: 1,
        amountE18: { hi: 0n, lo: onePointFiveE18 },
        balanceAfterE18: { hi: 0n, lo: twoPointFiveE18 },
        isDebit: false,
        transferCode: 1030,
        accountCode: 301,
        tsUs: 1_781_190_257_836_112n,
        linkId: 22n,
        flowId: " flow-1 ",
        source: {
            kind: Proto.TransferSideKind.FUNDING_ACCOUNT,
            accountId: 11n,
            address: "0x1111111111111111111111111111111111111111",
        },
        destination: {
            kind: Proto.TransferSideKind.EXTERNAL_ADDRESS,
            address: "0x2222222222222222222222222222222222222222",
        },
        ...overrides,
    } as Proto.TransferRow;
}

describe("TransfersService", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("normalizes list inputs, resolver defaults, signals, and converts decimal amounts", async () => {
        const controller = new AbortController();
        const resolver: SubaccountResolver = {
            getDefaultSubaccountId: () => formatId(11n),
        };
        const transport = unaryTransport({
            transfers: [transferRow()],
            nextPageToken: "42",
        });
        const service = new TransfersService(
            transport.transport,
            realtimeClientStub().realtime,
            resolver,
            testScales(),
        );

        await expect(
            service.list(
                {
                    ledger: 1,
                    limit: 25,
                    reversed: true,
                    timestampMin: 1_700_000_000_123,
                    timestampMax: 1_700_000_001_123,
                    transferCode: "internal_transfer",
                    pageToken: "cursor-1",
                },
                { signal: controller.signal },
            ),
        ).resolves.toEqual({
            transfers: [
                {
                    assetId: 1,
                    amount: "1.5",
                    type: "internal_transfer",
                    accountCode: "trading",
                    timestamp: 1_781_190_257_836,
                    balanceAfter: "2.5",
                    isDebit: false,
                    linkId: "22",
                    flowId: "flow-1",
                    source: {
                        kind: "funding_account",
                        accountId: formatId(11n),
                        address: "0x1111111111111111111111111111111111111111",
                    },
                    destination: {
                        kind: "external_address",
                        accountId: undefined,
                        address: "0x2222222222222222222222222222222222222222",
                    },
                },
            ],
            nextPageToken: "42",
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
                tsMinUs: 1_700_000_000_123_000n,
                tsMaxUs: 1_700_000_001_123_000n,
                transferCode: 1030,
                pageToken: "cursor-1",
            },
        });
    });

    it("lists transfers when input is omitted or undefined and validates null", async () => {
        const transport = unaryTransport({
            transfers: [],
            nextPageToken: "",
        });
        const service = new TransfersService(
            transport.transport,
            realtimeClientStub().realtime,
            undefined,
            testScales(),
        );
        const expected = { transfers: [], nextPageToken: "" };

        await expect(service.list()).resolves.toEqual(expected);
        await expect(service.list(undefined)).resolves.toEqual(expected);
        await expect(service.list(null as never)).rejects.toThrow(
            "Account-scoped input must be an object when provided.",
        );
        expect(transport.lastCall()?.method.localName).toBe("listTransfers");
    });

    it("returns empty nextPageToken when the backend has no further page", async () => {
        const transport = unaryTransport({
            transfers: [],
            nextPageToken: "",
        });
        const service = new TransfersService(
            transport.transport,
            realtimeClientStub().realtime,
            undefined,
            testScales(),
        );

        await expect(service.list({})).resolves.toEqual({
            transfers: [],
            nextPageToken: "",
        });
    });

    it("preserves balanceAfter when the backend reports zero", async () => {
        const transport = unaryTransport({
            transfers: [transferRow({ balanceAfterE18: create(U128Schema) })],
            nextPageToken: "",
        });
        const service = new TransfersService(
            transport.transport,
            realtimeClientStub().realtime,
            undefined,
            testScales(),
        );

        const { transfers } = await service.list({});

        expect(transfers[0]?.balanceAfter).toBe("0");
    });

    it("omits balanceAfter when the backend does not provide it", async () => {
        const transport = unaryTransport({
            transfers: [transferRow({ balanceAfterE18: undefined })],
            nextPageToken: "",
        });
        const service = new TransfersService(
            transport.transport,
            realtimeClientStub().realtime,
            undefined,
            testScales(),
        );

        const { transfers } = await service.list({});

        expect(transfers[0]?.balanceAfter).toBeUndefined();
    });

    it("preserves unknown asset ids using the catalog fallback path", async () => {
        const transport = unaryTransport({
            transfers: [transferRow({ assetId: 404 })],
            nextPageToken: "",
        });
        const service = new TransfersService(
            transport.transport,
            realtimeClientStub().realtime,
            undefined,
            testScales(),
        );

        await expect(service.list({})).resolves.toMatchObject({
            transfers: [{ assetId: 404, amount: "1.5" }],
            nextPageToken: "",
        });
    });

    it("preserves every transfer and exposes unspecified display-side metadata", async () => {
        const incompleteSideTransfer = transferRow({
            linkId: 23n,
            source: create(Proto.TransferSideSchema),
        });
        const transport = unaryTransport({
            transfers: [transferRow(), incompleteSideTransfer],
            nextPageToken: "",
        });
        const service = new TransfersService(
            transport.transport,
            realtimeClientStub().realtime,
            undefined,
            testScales(),
        );

        const { transfers } = await service.list({});

        expect(transfers).toHaveLength(2);
        expect(transfers[1]).toMatchObject({
            assetId: 1,
            amount: "1.5",
            type: "internal_transfer",
            accountCode: "trading",
            timestamp: 1_781_190_257_836,
            isDebit: false,
            linkId: "23",
            source: {
                kind: "unspecified",
                address: "",
            },
            destination: {
                kind: "external_address",
                address: "0x2222222222222222222222222222222222222222",
            },
        });
    });

    it("rejects malformed backend transfers", async () => {
        const transport = unaryTransport({
            transfers: [transferRow({ tsUs: undefined })],
            nextPageToken: "",
        });
        const service = new TransfersService(
            transport.transport,
            realtimeClientStub().realtime,
            undefined,
            testScales(),
        );

        await expect(service.list({})).rejects.toThrow();
    });

    it("uses private transfer channels and parses realtime publications", async () => {
        const realtime = realtimeClientStub();
        const service = new TransfersService(
            unaryTransport({}).transport,
            realtime.realtime,
            undefined,
            testScales(),
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
        await flushAsync();

        expect(onOpen).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onError).toHaveBeenCalledWith({
            channel: "channel",
            type: "transport",
            error: { code: 0, message: "boom" },
        });
        expect(onEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                assetId: 1,
                amount: "1.5",
                balanceAfter: "2.5",
                timestamp: 1_781_190_257_836,
                source: expect.objectContaining({ kind: "funding_account" }),
                destination: expect.objectContaining({ kind: "external_address" }),
            }),
        );

        onEvent.mockClear();
        realtime.params?.onPublication(
            transferRow({
                tsUs: 1_700_000_000_123_456n,
            }),
        );
        await flushAsync();

        expect(onEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                timestamp: 1_700_000_000_123,
            }),
        );

        unsubscribe();
        expect(realtime.unsubscribe).toHaveBeenCalledTimes(1);
    });

    it("routes malformed transfer publications to the subscription onError", async () => {
        const realtime = realtimeClientStub();
        const onEvent = vi.fn();
        const onError = vi.fn();
        const service = new TransfersService(
            unaryTransport({}).transport,
            realtime.realtime,
            undefined,
            testScales(),
        );

        service.subscribe({ accountId: "account-1", onEvent, onError });

        realtime.params?.onPublication(transferRow({ tsUs: undefined }));
        await flushAsync();

        expect(onEvent).not.toHaveBeenCalled();
        expect(onError).toHaveBeenCalledWith({
            channel: "private:ledger:transfers:account-1:proto",
            type: "publication_handler",
            error: expect.any(Error),
        });
    });
});
