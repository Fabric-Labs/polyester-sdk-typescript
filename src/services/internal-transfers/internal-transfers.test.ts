import { describe, expect, it } from "vitest";
import { AUTH_STEP_UP_HEADER_NAME } from "../../shared/request-options.js";
import { unaryTransport } from "../../testing/service-harness.js";
import type { SubaccountResolver } from "../subaccount-resolver.js";
import { InternalTransfersService } from "./internal-transfers.js";

const acceptedTransfer = {
    requestId: "req-1",
    transferId: "transfer-1",
    acceptedAtUnixNs: 1_700_000_000_123_456_789n,
    assetId: 1,
    assetCode: "USDC",
    uAssetId: "u-usdc",
    quantityScaled: 100n,
    destination: {
        rootAccountPublicId: "root-public",
        subaccountPublicId: "",
        smartAccountAddress: "0xabc123",
    },
};

describe("InternalTransfersService", () => {
    it("normalizes create payloads, resolver defaults, and mutation options", async () => {
        const controller = new AbortController();
        const resolver: SubaccountResolver = {
            getDefaultSubaccountId: () => "11",
        };
        const transport = unaryTransport(acceptedTransfer);
        const service = new InternalTransfersService(transport.transport, resolver);

        await expect(
            service.create(
                {
                    destination: { type: "smartAccountAddress", address: " 0xabc123 " },
                    assetId: 1,
                    quantityScaled: "100",
                    idempotencyKey: " transfer-1 ",
                },
                { signal: controller.signal, stepUpToken: " fresh-token " },
            ),
        ).resolves.toEqual({
            requestId: "req-1",
            transferId: "transfer-1",
            acceptedAtUnixMs: 1_700_000_000_123,
            assetId: 1,
            assetCode: "USDC",
            uAssetId: "u-usdc",
            quantityScaled: "100",
            destination: {
                rootAccountId: "root-public",
                subaccountId: undefined,
                smartAccountAddress: "0xabc123",
            },
        });

        const captured = transport.lastCall();
        expect(captured?.method.localName).toBe("createInternalTransfer");
        expect(captured?.signal).toBe(controller.signal);
        expect(new Headers(captured?.headers).get(AUTH_STEP_UP_HEADER_NAME)).toBe("fresh-token");
        expect(captured?.message).toMatchObject({
            subaccountId: 11n,
            destination: {
                case: "destinationSmartAccountAddress",
                value: "0xabc123",
            },
            assetId: 1,
            quantityScaled: 100n,
            idempotencyKey: "transfer-1",
        });
    });

    it("treats an explicit empty subaccount as main account and bypasses the resolver", async () => {
        const resolver: SubaccountResolver = {
            getDefaultSubaccountId: () => "11",
        };
        const transport = unaryTransport(acceptedTransfer);
        const service = new InternalTransfersService(transport.transport, resolver);

        await service.create({
            subaccountId: "",
            destination: { type: "account", accountId: "22" },
            assetId: 1,
            quantityScaled: 1n,
            idempotencyKey: "transfer-2",
        });

        const captured = transport.lastCall();
        expect(captured?.message).not.toHaveProperty("subaccountId");
        expect((captured?.message as { destination?: unknown })?.destination).toEqual({
            case: "destinationAccountId",
            value: 22n,
        });
    });

    it("rejects malformed backend create responses", async () => {
        const transport = unaryTransport({
            ...acceptedTransfer,
            requestId: "",
        });
        const service = new InternalTransfersService(transport.transport);

        await expect(
            service.create({
                destination: { type: "account", accountId: "22" },
                assetId: 1,
                quantityScaled: "1",
                idempotencyKey: "transfer-3",
            }),
        ).rejects.toThrow();
    });
});
