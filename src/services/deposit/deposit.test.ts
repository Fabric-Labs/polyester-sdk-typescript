import { AUTH_STEP_UP_HEADER_NAME } from "../../shared/request-options.js";
import { subaccountResolverStub, unaryTransport } from "../../testing/service-harness.js";
import { formatId } from "../../utils/base58-id.js";
import { describe, expect, it } from "vitest";
import { DepositService } from "./deposit.js";

describe("DepositService", () => {
    it("normalizes create requests with resolver defaults and parses deposit addresses", async () => {
        const transport = unaryTransport({
            depositAddress: {
                chainId: 8453,
                depositAddress: " 0x1111111111111111111111111111111111111111 ",
            },
        });
        const service = new DepositService(
            { authApi: transport.transport },
            subaccountResolverStub(formatId(42n)),
        );

        await expect(
            service.createAddress({ chainId: 8453 }, { stepUpToken: " fresh-token " }),
        ).resolves.toEqual({
            chainId: 8453,
            depositAddress: "0x1111111111111111111111111111111111111111",
        });

        expect(transport.lastCall()?.message).toEqual({ subaccountId: 42n, chainId: 8453 });
        expect(new Headers(transport.lastCall()?.headers).get(AUTH_STEP_UP_HEADER_NAME)).toBe(
            "fresh-token",
        );
    });

    it("returns null when create responses omit the deposit address", async () => {
        const transport = unaryTransport({});
        const service = new DepositService({ authApi: transport.transport });

        await expect(service.createAddress({ chainId: 1 })).resolves.toBeNull();
    });

    it("normalizes list requests and lets explicit main scope force root scope", async () => {
        const transport = unaryTransport({
            depositAddresses: [
                {
                    chainId: 8453,
                    depositAddress: "0x1111111111111111111111111111111111111111",
                },
            ],
        });
        const service = new DepositService(
            { authApi: transport.transport },
            subaccountResolverStub(formatId(42n)),
        );
        const signal = new AbortController().signal;

        await expect(
            service.listAddresses({ account: "main", chainId: 8453 }, { signal }),
        ).resolves.toEqual([
            {
                chainId: 8453,
                depositAddress: "0x1111111111111111111111111111111111111111",
            },
        ]);

        expect(transport.lastCall()?.message).toEqual({ chainId: 8453 });
        expect(transport.lastCall()?.signal).toBe(signal);
    });
});
