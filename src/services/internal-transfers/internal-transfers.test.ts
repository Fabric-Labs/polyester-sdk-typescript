import { describe, expect, it } from "vitest";
import { AUTH_STEP_UP_HEADER_NAME } from "../../shared/request-options.js";
import { createCatalogSdkScales } from "../../shared/decimal-surface.js";
import { createTestCatalog } from "../../testing/catalog.js";
import { unaryTransport } from "../../testing/service-harness.js";
import type { SubaccountResolver } from "../subaccount-resolver.js";
import { InternalTransfersService } from "./internal-transfers.js";

const usdc = {
    symbol: "USDC",
    ledgerId: 1,
    name: "USD Coin",
    quantityDisplayDecimals: 2,
    quantityScale: 6,
};

function testScales() {
    const catalog = createTestCatalog({ assets: [usdc] });
    return createCatalogSdkScales(() => catalog);
}

const acceptedTransfer = {
    requestId: "req-1",
    transferId: "transfer-1",
    acceptedAtTsNs: 1_700_000_000_123_456_789n,
    assetId: 1,
    assetCode: "USDC",
    uAssetId: "u-usdc",
    amountE18: { hi: 0n, lo: 1_500_000_000_000_000_000n },
    destination: {
        rootAccountPublicId: "root-public",
        subaccountPublicId: "",
        smartAccountAddress: "0xabc123",
    },
};

describe("InternalTransfersService", () => {
    it("converts decimal quantities, resolver defaults, and mutation options", async () => {
        const controller = new AbortController();
        const resolver: SubaccountResolver = {
            getDefaultSubaccountId: () => "11",
        };
        const transport = unaryTransport(acceptedTransfer);
        const service = new InternalTransfersService(transport.transport, resolver, testScales());

        await expect(
            service.create(
                {
                    destination: { type: "smartAccountAddress", address: " 0xabc123 " },
                    assetId: 1,
                    quantity: "100",
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
            quantity: "1.5",
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
            amountE18: {
                hi: 5n,
                lo: 7_766_279_631_452_241_920n,
            },
            idempotencyKey: "transfer-1",
        });
    });

    it("treats explicit main scope as main account and bypasses the resolver", async () => {
        const resolver: SubaccountResolver = {
            getDefaultSubaccountId: () => "11",
        };
        const transport = unaryTransport(acceptedTransfer);
        const service = new InternalTransfersService(transport.transport, resolver, testScales());

        await service.create({
            account: "main",
            destination: { type: "account", accountId: "22" },
            assetId: 1,
            quantity: "0.000001",
            idempotencyKey: "transfer-2",
        });

        const captured = transport.lastCall();
        expect(captured?.message).not.toHaveProperty("subaccountId");
        expect((captured?.message as { destination?: unknown })?.destination).toEqual({
            case: "destinationAccountId",
            value: 22n,
        });
        expect(captured?.message).toMatchObject({
            amountE18: { hi: 0n, lo: 1_000_000_000_000n },
        });
    });

    it("rejects quantities that are invalid, non-positive, or too precise", async () => {
        const transport = unaryTransport(acceptedTransfer);
        const service = new InternalTransfersService(transport.transport, undefined, testScales());
        const base = {
            destination: { type: "account", accountId: "22" } as const,
            assetId: 1,
            idempotencyKey: "transfer-3",
        };

        await expect(service.create({ ...base, quantity: "not-a-number" })).rejects.toThrow(
            /quantity must be a non-negative decimal number/,
        );
        await expect(service.create({ ...base, quantity: "0" })).rejects.toThrow(
            /quantity must be greater than 0/,
        );
        await expect(service.create({ ...base, quantity: "1.2345678" })).rejects.toThrow(
            /quantity supports at most 6 decimal places/,
        );
        expect(transport.unary).not.toHaveBeenCalled();
    });

    it("rejects malformed backend create responses", async () => {
        const transport = unaryTransport({
            ...acceptedTransfer,
            requestId: "",
        });
        const service = new InternalTransfersService(transport.transport, undefined, testScales());

        await expect(
            service.create({
                destination: { type: "account", accountId: "22" },
                assetId: 1,
                quantity: "1",
                idempotencyKey: "transfer-3",
            }),
        ).rejects.toThrow();
    });
});
