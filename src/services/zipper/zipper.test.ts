import { create } from "@bufbuild/protobuf";
import { describe, expect, it, vi } from "vitest";
import * as Proto from "../../gen/chain/zipper/v1/zipper_pb.js";
import type { SdkScales } from "../../shared/decimal-surface.js";
import { realtimeClientStub, unaryTransport } from "../../testing/service-harness.js";
import { ZipperService } from "./zipper.js";

const testScales = {
    ready: async () => {},
    price: () => 6,
    baseQty: () => 6,
    quoteAmount: () => 6,
    ledgerAmount: () => 6,
    zippedAssetAmount: () => 6,
} satisfies SdkScales;

const flushAsync = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function supplyConfig(supplyQ: bigint) {
    return {
        chains: [],
        assets: [
            {
                asset: "USDT",
                ledgerId: 1,
                name: "Tether",
                icon: "",
                quantityScale: 6,
                quantityDisplayDecimals: 6,
                variants: [{ zippedAssetId: 1001, chainId: 1, supplyQ }],
                uAssetId: "u-usdt",
            },
        ],
        contracts: [],
        tsSec: 100n,
        polyesterChainId: 77,
    };
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((nextResolve, nextReject) => {
        resolve = nextResolve;
        reject = nextReject;
    });
    return { promise, resolve, reject };
}

describe("ZipperService", () => {
    it("parses deposit/withdraw config and propagates read call options", async () => {
        const transport = unaryTransport({
            chains: [
                {
                    chainId: 8453,
                    code: "base",
                    name: "Base",
                    nativeCurrencySymbol: "ETH",
                    explorerUrl: "https://basescan.org",
                    icon: "base.svg",
                    requiredConfirmations: 2,
                    confirmationTimeSeconds: 4,
                    minAddressLength: 42,
                    maxAddressLength: 42,
                },
            ],
            assets: [
                {
                    asset: "USDC",
                    ledgerId: 1,
                    name: "USD Coin",
                    icon: "usdc.svg",
                    quantityScale: 6,
                    quantityDisplayDecimals: 2,
                    variants: [
                        {
                            zippedAssetId: 100,
                            chainId: 8453,
                            isNativeAsset: false,
                            networkFee: "0.25",
                            networkFeeTsSec: 10n,
                            sourceAddress: "0x1111111111111111111111111111111111111111",
                            sourceDecimals: 6,
                            ztokenAddress: "0x2222222222222222222222222222222222222222",
                            ztokenDecimals: 18,
                            depositMinAmount: "1",
                            withdrawMinAmount: "2",
                            supplyQ: 12_345_678n,
                        },
                    ],
                },
            ],
            contracts: [{ name: "Gateway", address: "0x3333333333333333333333333333333333333333" }],
            tsSec: 100n,
            polyesterChainId: 77,
        });
        const service = new ZipperService({ publicApi: transport.transport });
        const signal = new AbortController().signal;

        await expect(service.getDepositWithdrawConfig({ signal })).resolves.toMatchObject({
            tsMs: 100000,
            polyesterChainId: 77,
            chains: [{ chainId: 8453, nativeChainId: "", isCaseSensitive: false }],
            assets: [
                {
                    asset: "USDC",
                    variants: [
                        {
                            zippedAssetId: 100,
                            networkFeeTsSec: 10,
                            supply: "12.345678",
                            sourceToken: {
                                address: "0x1111111111111111111111111111111111111111",
                                decimals: 6,
                            },
                            zToken: {
                                address: "0x2222222222222222222222222222222222222222",
                                decimals: 18,
                            },
                        },
                    ],
                },
            ],
            contracts: [
                {
                    name: "Gateway",
                    address: "0x3333333333333333333333333333333333333333",
                    type: "",
                    description: "",
                    version: 0,
                },
            ],
        });
        expect(transport.lastCall()?.message).toEqual({});
        expect(transport.lastCall()?.signal).toBe(signal);
    });

    it("emits an initial supply snapshot before parsing live updates", async () => {
        const realtime = realtimeClientStub();
        const onEvent = vi.fn();
        const onOpen = vi.fn();
        const onError = vi.fn();
        const service = new ZipperService(
            { publicApi: unaryTransport(supplyConfig(10_000_000n)).transport },
            realtime.realtime,
            testScales,
        );

        const unsubscribe = service.subscribeZippedAssetSupply({
            onEvent,
            onOpen,
            onError,
        });

        expect(realtime.params?.channel).toBe("public:chain:zipped-asset:supply:proto");
        expect(realtime.params?.schema).toBe(Proto.ZippedAssetSupplyBatchSchema);

        realtime.params?.onConnected?.();
        await flushAsync();
        expect(onEvent).toHaveBeenLastCalledWith({
            updates: [{ zippedAssetId: 1001, supply: "10" }],
        });

        realtime.params?.onPublication(
            create(Proto.ZippedAssetSupplyBatchSchema, {
                updates: [{ zippedAssetId: 1001, supplyQ: 123_456_789n }],
            }),
        );
        await flushAsync();

        expect(onOpen).toHaveBeenCalledTimes(1);
        expect(onEvent).toHaveBeenLastCalledWith({
            updates: [{ zippedAssetId: 1001, supply: "123.456789" }],
        });

        unsubscribe();
        expect(realtime.connectProtoChannel.mock.results[0]?.value).toHaveBeenCalledTimes(1);
    });

    it("buffers live supply updates until the initial snapshot resolves", async () => {
        const snapshot = deferred<Record<string, unknown>>();
        const realtime = realtimeClientStub();
        const onEvent = vi.fn();
        const service = new ZipperService(
            { publicApi: unaryTransport(() => snapshot.promise).transport },
            realtime.realtime,
            testScales,
        );

        service.subscribeZippedAssetSupply({ onEvent });
        realtime.params?.onConnected?.();
        realtime.params?.onPublication(
            create(Proto.ZippedAssetSupplyBatchSchema, {
                updates: [{ zippedAssetId: 1001, supplyQ: 20_000_000n }],
            }),
        );

        expect(onEvent).not.toHaveBeenCalled();
        snapshot.resolve(supplyConfig(10_000_000n));
        await flushAsync();

        expect(onEvent).toHaveBeenCalledOnce();
        expect(onEvent).toHaveBeenCalledWith({
            updates: [{ zippedAssetId: 1001, supply: "20" }],
        });
    });

    it("retains a keyed supply update through more than 200 unrelated buffered batches", async () => {
        const snapshot = deferred<Record<string, unknown>>();
        const realtime = realtimeClientStub();
        const onEvent = vi.fn();
        const service = new ZipperService(
            { publicApi: unaryTransport(() => snapshot.promise).transport },
            realtime.realtime,
            testScales,
        );

        service.subscribeZippedAssetSupply({ onEvent });
        realtime.params?.onConnected?.();
        realtime.params?.onPublication(
            create(Proto.ZippedAssetSupplyBatchSchema, {
                updates: [{ zippedAssetId: 1001, supplyQ: 10_000_000n }],
            }),
        );
        for (let index = 1; index <= 200; index++) {
            realtime.params?.onPublication(
                create(Proto.ZippedAssetSupplyBatchSchema, {
                    updates: [{ zippedAssetId: 1002, supplyQ: BigInt(index) }],
                }),
            );
        }

        snapshot.resolve(supplyConfig(0n));
        await flushAsync();

        expect(onEvent).toHaveBeenCalledOnce();
        expect(onEvent).toHaveBeenCalledWith({
            updates: expect.arrayContaining([{ zippedAssetId: 1001, supply: "10" }]),
        });
    });

    it("refetches the supply snapshot when the channel resubscribes after transport loss", async () => {
        const transport = unaryTransport((_call, index) =>
            supplyConfig(index === 0 ? 10_000_000n : 20_000_000n),
        );
        const realtime = realtimeClientStub();
        const onEvent = vi.fn();
        const onClose = vi.fn();
        const service = new ZipperService(
            { publicApi: transport.transport },
            realtime.realtime,
            testScales,
        );

        service.subscribeZippedAssetSupply({ onEvent, onClose });
        realtime.params?.onConnected?.();
        await flushAsync();
        expect(onEvent).toHaveBeenLastCalledWith({
            updates: [{ zippedAssetId: 1001, supply: "10" }],
        });

        realtime.params?.onConnected?.();
        await flushAsync();

        expect(onClose).not.toHaveBeenCalled();
        expect(transport.unary).toHaveBeenCalledTimes(2);
        expect(onEvent).toHaveBeenLastCalledWith({
            updates: [{ zippedAssetId: 1001, supply: "20" }],
        });
    });

    it("continues delivering publications when the initial snapshot fails", async () => {
        const snapshot = deferred<Record<string, unknown>>();
        const realtime = realtimeClientStub();
        const onEvent = vi.fn();
        const onError = vi.fn();
        const service = new ZipperService(
            { publicApi: unaryTransport(() => snapshot.promise).transport },
            realtime.realtime,
            testScales,
        );

        const unsubscribe = service.subscribeZippedAssetSupply({ onEvent, onError });
        realtime.params?.onConnected?.();
        snapshot.reject(new Error("snapshot unavailable"));
        await flushAsync();

        realtime.params?.onPublication(
            create(Proto.ZippedAssetSupplyBatchSchema, {
                updates: [{ zippedAssetId: 1001, supplyQ: 20_000_000n }],
            }),
        );
        await flushAsync();

        expect(onError).toHaveBeenCalledWith(
            expect.objectContaining({
                channel: "public:chain:zipped-asset:supply:proto",
                type: "snapshot",
            }),
        );
        expect(onEvent).toHaveBeenCalledWith({
            updates: [{ zippedAssetId: 1001, supply: "20" }],
        });

        unsubscribe();
    });

    it("does not enter live mode when catalog readiness fails", async () => {
        const realtime = realtimeClientStub();
        const onEvent = vi.fn();
        const onError = vi.fn();
        const scales = {
            ...testScales,
            ready: async () => {
                throw new Error("catalog unavailable");
            },
        };
        const service = new ZipperService(
            { publicApi: unaryTransport(supplyConfig(10_000_000n)).transport },
            realtime.realtime,
            scales,
        );

        const unsubscribe = service.subscribeZippedAssetSupply({ onEvent, onError });
        realtime.params?.onConnected?.();
        await flushAsync();
        realtime.params?.onPublication(
            create(Proto.ZippedAssetSupplyBatchSchema, {
                updates: [{ zippedAssetId: 1001, supplyQ: 20_000_000n }],
            }),
        );

        expect(onError).toHaveBeenCalledWith(
            expect.objectContaining({
                channel: "public:chain:zipped-asset:supply:proto",
                type: "snapshot",
            }),
        );
        expect(onEvent).not.toHaveBeenCalled();
        unsubscribe();
    });

    it("routes malformed supply publications to onError", async () => {
        const realtime = realtimeClientStub();
        const onEvent = vi.fn();
        const onError = vi.fn();
        const service = new ZipperService(
            { publicApi: unaryTransport(supplyConfig(10_000_000n)).transport },
            realtime.realtime,
            testScales,
        );

        service.subscribeZippedAssetSupply({ onEvent, onError });
        realtime.params?.onConnected?.();
        await flushAsync();
        onEvent.mockClear();
        onError.mockClear();
        realtime.params?.onPublication({
            updates: [{ zippedAssetId: 1001, supplyQ: "bad" }],
        } as never);
        await flushAsync();

        expect(onEvent).not.toHaveBeenCalled();
        expect(onError).toHaveBeenCalledWith({
            channel: "public:chain:zipped-asset:supply:proto",
            type: "publication_handler",
            error: expect.objectContaining({ message: expect.any(String) }),
        });
    });
});
