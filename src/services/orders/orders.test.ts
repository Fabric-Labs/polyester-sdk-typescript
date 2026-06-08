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
    it("returns null when get order response omits the order", async () => {
        let request: Record<string, unknown> | undefined;
        const service = new OrdersService(
            transportWithMessage({}, (message) => {
                request = message;
            }),
            {} as RealtimeClient,
        );

        await expect(service.get({ clientOrderId: " client-1 " })).resolves.toBeNull();

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
