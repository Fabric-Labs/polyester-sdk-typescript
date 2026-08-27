import { create } from "@bufbuild/protobuf";
import { describe, expect, it, vi } from "vitest";
import { CatalogNotReadyError } from "../catalogs/types.js";
import * as Proto from "../gen/orders/v1/orders_read_pb.js";
import { realtimeClientStub } from "../testing/service-harness.js";
import { connectReadyGatedProtoChannel } from "./ready-gated-subscription.js";

function deferred() {
    let resolve: (() => void) | undefined;
    let reject: ((error: unknown) => void) | undefined;
    const promise = new Promise<void>((nextResolve, nextReject) => {
        resolve = nextResolve;
        reject = nextReject;
    });
    return { promise, resolve, reject };
}

describe("connectReadyGatedProtoChannel", () => {
    it("visibly closes the subscription when the readiness queue overflows", async () => {
        const readiness = deferred();
        const realtime = realtimeClientStub();
        const onPublication = vi.fn();
        const onDisconnected = vi.fn();
        const onError = vi.fn();

        connectReadyGatedProtoChannel(realtime.realtime, {
            channel: "private:spot:orders:account-1:proto",
            schema: Proto.OrderSchema,
            ready: () => readiness.promise,
            onPublication,
            onDisconnected,
            onError,
        });

        const publication = create(Proto.OrderSchema);
        for (let index = 0; index < 1_025; index++) {
            realtime.params?.onPublication(publication);
        }

        expect(onError).toHaveBeenCalledOnce();
        expect(onError.mock.calls[0]?.[0]).toMatchObject({
            channel: "private:spot:orders:account-1:proto",
            type: "publication_handler",
            error: expect.any(CatalogNotReadyError),
        });
        expect(realtime.unsubscribe).toHaveBeenCalledOnce();
        expect(onDisconnected).toHaveBeenCalledOnce();
        expect(onPublication).not.toHaveBeenCalled();

        readiness.resolve?.();
        await readiness.promise;
        await Promise.resolve();
        realtime.params?.onPublication(publication);

        expect(onDisconnected).toHaveBeenCalledOnce();
        expect(onPublication).not.toHaveBeenCalled();
    });

    it("terminates on readiness rejection and clears pending publications", async () => {
        const readiness = deferred();
        const realtime = realtimeClientStub();
        const onPublication = vi.fn();
        const onDisconnected = vi.fn();
        const onError = vi.fn();

        connectReadyGatedProtoChannel(realtime.realtime, {
            channel: "private:spot:orders:account-1:proto",
            schema: Proto.OrderSchema,
            ready: () => readiness.promise,
            onPublication,
            onDisconnected,
            onError,
        });
        realtime.params?.onPublication(create(Proto.OrderSchema));

        readiness.reject?.(new Error("catalog unavailable"));
        await readiness.promise.catch(() => undefined);
        for (let index = 0; index < 3; index++) await Promise.resolve();

        expect(onError).toHaveBeenCalledWith(
            expect.objectContaining({
                type: "publication_handler",
                error: expect.objectContaining({ message: "catalog unavailable" }),
            }),
        );
        expect(realtime.unsubscribe).toHaveBeenCalledOnce();
        expect(onDisconnected).toHaveBeenCalledOnce();
        expect(onPublication).not.toHaveBeenCalled();
    });

    it("does not deliver queued publications after caller unsubscribe", async () => {
        const readiness = deferred();
        const realtime = realtimeClientStub();
        const onPublication = vi.fn();
        const unsubscribe = connectReadyGatedProtoChannel(realtime.realtime, {
            channel: "private:spot:orders:account-1:proto",
            schema: Proto.OrderSchema,
            ready: () => readiness.promise,
            onPublication,
        });
        realtime.params?.onPublication(create(Proto.OrderSchema));

        unsubscribe();
        readiness.resolve?.();
        await readiness.promise;
        await Promise.resolve();

        expect(realtime.unsubscribe).toHaveBeenCalledOnce();
        expect(onPublication).not.toHaveBeenCalled();
    });
});
