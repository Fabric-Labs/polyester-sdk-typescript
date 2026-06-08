import type { Transport } from "@connectrpc/connect";
import { describe, expect, it, vi } from "vitest";
import type { RealtimeClient } from "../../realtime/client.js";
import { OrdersService } from "./orders.js";

function transportWithMessage(
    message: Record<string, unknown>,
    capture?: (message: Record<string, unknown>) => void,
): Transport {
    return {
        unary: vi.fn(async (...args: unknown[]) => {
            capture?.(args[4] as Record<string, unknown>);
            return {
                message,
                header: new Headers(),
                trailer: new Headers(),
                stream: false,
                service: undefined,
                method: undefined,
            };
        }),
        stream: vi.fn(),
    } as unknown as Transport;
}

describe("OrdersService", () => {
    it("generates a request ID for cancelAll when omitted", async () => {
        let request: Record<string, unknown> | undefined;
        const service = new OrdersService(
            transportWithMessage(
                {
                    status: "ok",
                    matchedOrders: 2,
                    submittedCancels: 2,
                    failedCancels: 0,
                    tsNs: 1000000n,
                },
                (message) => {
                    request = message;
                },
            ),
            {} as RealtimeClient,
        );

        await expect(service.cancelAll({ symbol: " BTC-USDT " })).resolves.toMatchObject({
            status: "ok",
            matchedOrders: 2,
            submittedCancels: 2,
            failedCancels: 0,
            ts: 1,
        });

        expect(request).toMatchObject({
            symbol: "BTC-USDT",
        });
        expect(request?.requestId).toEqual(expect.any(String));
        expect((request?.requestId as string).length).toBeGreaterThan(0);
    });

    it("preserves a caller-provided request ID for cancelAll", async () => {
        let request: Record<string, unknown> | undefined;
        const service = new OrdersService(
            transportWithMessage(
                {
                    status: "ok",
                    matchedOrders: 0,
                    submittedCancels: 0,
                    failedCancels: 0,
                    tsNs: 1000000n,
                },
                (message) => {
                    request = message;
                },
            ),
            {} as RealtimeClient,
        );

        await service.cancelAll({ requestId: " retry-cancel-all-1 " });

        expect(request?.requestId).toBe("retry-cancel-all-1");
    });

    it("returns null when get order details response omits the order", async () => {
        let request: Record<string, unknown> | undefined;
        const service = new OrdersService(
            transportWithMessage({}, (message) => {
                request = message;
            }),
            {} as RealtimeClient,
        );

        await expect(service.getDetails({ clientOrderId: " client-1 " })).resolves.toBeNull();

        expect(request).toMatchObject({
            includeAttachedRisk: true,
            includeAttachedRiskState: true,
            key: {
                case: "clientOrderId",
                value: "client-1",
            },
        });
    });
});
