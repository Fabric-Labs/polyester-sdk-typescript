import { create } from "@bufbuild/protobuf";
import { describe, expect, it, vi } from "vitest";
import * as Proto from "../gen/chain/zipper/v1/zipper_pb.js";
import { realtimeClientStub } from "../testing/service-harness.js";
import { ServiceUnavailableError, ValidationError } from "../shared/errors.js";
import { snapshotThenStream } from "./snapshot-then-stream.js";

const flushAsync = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function publication(zippedAssetId: number) {
    return create(Proto.ZippedAssetSupplyBatchSchema, {
        updates: [{ zippedAssetId, supplyQ: 1n }],
    });
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

describe("snapshotThenStream", () => {
    it("attaches before capturing and buffers publications within the subscribed epoch", async () => {
        const snapshot = deferred<number>();
        const realtime = realtimeClientStub();
        const fetchSnapshot = vi.fn(() => snapshot.promise);
        const applySnapshot = vi.fn();

        snapshotThenStream({
            realtime: realtime.realtime,
            channel: "public:test",
            schema: Proto.ZippedAssetSupplyBatchSchema,
            fetchSnapshot,
            readPublication: (batch) => batch.updates.map((update) => update.zippedAssetId),
            applySnapshot,
            applyLivePublications: vi.fn(),
        });

        expect(fetchSnapshot).not.toHaveBeenCalled();
        realtime.params?.onConnected?.();
        realtime.params?.onPublication(publication(7));
        await flushAsync();

        expect(fetchSnapshot).toHaveBeenCalledOnce();
        snapshot.resolve(1);
        await flushAsync();

        expect(applySnapshot).toHaveBeenCalledWith(1, [7]);
    });

    it("does not replay buffered publications from an abandoned subscription epoch", async () => {
        const firstSnapshot = deferred<number>();
        const realtime = realtimeClientStub();
        const fetchSnapshot = vi
            .fn<() => Promise<number>>()
            .mockReturnValueOnce(firstSnapshot.promise)
            .mockResolvedValueOnce(10);
        const applySnapshot = vi.fn();

        snapshotThenStream({
            realtime: realtime.realtime,
            channel: "public:test",
            schema: Proto.ZippedAssetSupplyBatchSchema,
            fetchSnapshot,
            readPublication: (batch) => batch.updates.map((update) => update.zippedAssetId),
            applySnapshot,
            applyLivePublications: vi.fn(),
        });

        realtime.params?.onConnected?.();
        realtime.params?.onPublication(publication(7));
        await flushAsync();

        realtime.params?.onConnected?.();
        await flushAsync();

        expect(applySnapshot).toHaveBeenCalledOnce();
        expect(applySnapshot).toHaveBeenCalledWith(10, []);

        firstSnapshot.resolve(1);
        await flushAsync();
        expect(applySnapshot).toHaveBeenCalledOnce();
    });

    it("captures one new snapshot for every subscribed epoch", async () => {
        const realtime = realtimeClientStub();
        const fetchSnapshot = vi.fn(async () => 1);

        snapshotThenStream({
            realtime: realtime.realtime,
            channel: "public:test",
            schema: Proto.ZippedAssetSupplyBatchSchema,
            fetchSnapshot,
            readPublication: () => [],
            applySnapshot: vi.fn(),
            applyLivePublications: vi.fn(),
        });

        realtime.params?.onConnected?.();
        await flushAsync();
        realtime.params?.onConnected?.();
        await flushAsync();

        expect(fetchSnapshot).toHaveBeenCalledTimes(2);
    });

    it("fails open after a snapshot error and cancels its retry on unsubscribe", async () => {
        const snapshot = deferred<number>();
        const realtime = realtimeClientStub();
        const applyLivePublications = vi.fn();
        const onError = vi.fn();
        const fetchSnapshot = vi.fn(() => snapshot.promise);
        const stream = snapshotThenStream({
            realtime: realtime.realtime,
            channel: "public:test",
            schema: Proto.ZippedAssetSupplyBatchSchema,
            snapshotRetry: { maxAttempts: 1, delayMs: 10 },
            snapshotFailureMode: "live",
            fetchSnapshot,
            readPublication: (batch) => batch.updates.map((update) => update.zippedAssetId),
            applySnapshot: vi.fn(),
            applyLivePublications,
            onError,
        });

        realtime.params?.onConnected?.();
        realtime.params?.onPublication(publication(7));
        snapshot.reject(new Error("snapshot unavailable"));
        await flushAsync();

        expect(stream.isReady()).toBe(true);
        expect(applyLivePublications).toHaveBeenCalledWith([7]);
        expect(onError).toHaveBeenCalledWith(
            expect.objectContaining({ channel: "public:test", type: "snapshot" }),
        );

        realtime.params?.onPublication(publication(8));
        expect(applyLivePublications).toHaveBeenLastCalledWith([8]);

        stream.unsubscribe();
        await new Promise<void>((resolve) => setTimeout(resolve, 20));
        expect(stream.isDisposed()).toBe(true);
        expect(fetchSnapshot).toHaveBeenCalledOnce();
        expect(realtime.unsubscribe).toHaveBeenCalledOnce();
    });

    it("retries a failed snapshot without waiting for a reconnect", async () => {
        const realtime = realtimeClientStub();
        const fetchSnapshot = vi
            .fn<() => Promise<number>>()
            .mockRejectedValueOnce(new Error("snapshot unavailable"))
            .mockResolvedValueOnce(2);
        const applySnapshot = vi.fn();
        const stream = snapshotThenStream({
            realtime: realtime.realtime,
            channel: "public:test",
            schema: Proto.ZippedAssetSupplyBatchSchema,
            snapshotRetry: { maxAttempts: 1, delayMs: 1 },
            snapshotFailureMode: "live",
            fetchSnapshot,
            readPublication: () => [],
            applySnapshot,
            applyLivePublications: vi.fn(),
        });

        realtime.params?.onConnected?.();
        await new Promise<void>((resolve) => setTimeout(resolve, 10));

        expect(fetchSnapshot).toHaveBeenCalledTimes(2);
        expect(applySnapshot).toHaveBeenCalledWith(2, []);
        stream.unsubscribe();
    });

    it("retains buffered publications across a retry in the same subscription epoch", async () => {
        const realtime = realtimeClientStub();
        const fetchSnapshot = vi
            .fn<() => Promise<number>>()
            .mockRejectedValueOnce(new Error("snapshot unavailable"))
            .mockResolvedValueOnce(10);
        const applySnapshot = vi.fn();
        const stream = snapshotThenStream({
            realtime: realtime.realtime,
            channel: "public:test",
            schema: Proto.ZippedAssetSupplyBatchSchema,
            snapshotRetry: { maxAttempts: 1, delayMs: 1 },
            fetchSnapshot,
            readPublication: (batch) => batch.updates.map((update) => update.zippedAssetId),
            applySnapshot,
            applyLivePublications: vi.fn(),
        });

        realtime.params?.onConnected?.();
        realtime.params?.onPublication(publication(7));
        await new Promise<void>((resolve) => setTimeout(resolve, 10));

        expect(fetchSnapshot).toHaveBeenCalledTimes(2);
        expect(applySnapshot).toHaveBeenCalledWith(10, [7]);
        stream.unsubscribe();
    });

    it("keeps retrying a retryable snapshot error with capped backoff, but stops on a non-retryable one", async () => {
        vi.useFakeTimers();
        try {
            const realtime = realtimeClientStub();
            const fetchSnapshot = vi
                .fn<() => Promise<number>>()
                .mockRejectedValue(new ServiceUnavailableError("not available yet"));
            const applySnapshot = vi.fn();
            const stream = snapshotThenStream({
                realtime: realtime.realtime,
                channel: "public:test",
                schema: Proto.ZippedAssetSupplyBatchSchema,
                snapshotRetry: { maxAttempts: Number.POSITIVE_INFINITY, delayMs: 1, maxDelayMs: 4 },
                fetchSnapshot,
                readPublication: () => [],
                applySnapshot,
                applyLivePublications: vi.fn(),
            });

            realtime.params?.onConnected?.();
            // 1 + 2 + 4 + 4 + 4 ms of backoff: well past where an uncapped 3-attempt limit stopped.
            await vi.advanceTimersByTimeAsync(15);
            expect(fetchSnapshot).toHaveBeenCalledTimes(6);

            fetchSnapshot.mockResolvedValueOnce(5);
            await vi.advanceTimersByTimeAsync(4);
            expect(applySnapshot).toHaveBeenCalledWith(5, []);

            stream.refreshSnapshot();
            fetchSnapshot.mockClear().mockRejectedValue(new ValidationError("bad symbol"));
            await vi.advanceTimersByTimeAsync(50);
            expect(fetchSnapshot).toHaveBeenCalledOnce();
            stream.unsubscribe();
        } finally {
            vi.useRealTimers();
        }
    });

    it("isolates snapshot application failures without misclassifying them as fetch failures", async () => {
        const realtime = realtimeClientStub();
        const cause = new Error("consumer failed");
        const onError = vi.fn();
        const stream = snapshotThenStream({
            realtime: realtime.realtime,
            channel: "public:test",
            schema: Proto.ZippedAssetSupplyBatchSchema,
            fetchSnapshot: async () => 1,
            readPublication: () => [],
            applySnapshot: () => {
                throw cause;
            },
            applyLivePublications: vi.fn(),
            onError,
        });

        realtime.params?.onConnected?.();
        await flushAsync();

        expect(stream.isReady()).toBe(true);
        expect(onError).toHaveBeenCalledOnce();
        expect(onError).toHaveBeenCalledWith(
            expect.objectContaining({
                channel: "public:test",
                type: "publication_handler",
                error: cause,
            }),
        );
        stream.unsubscribe();
    });
});
