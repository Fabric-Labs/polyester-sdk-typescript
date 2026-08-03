import { describe, expect, it, vi } from "vitest";
import { sendPolyesterUserOperation } from "./smart-account.js";

describe("sendPolyesterUserOperation", () => {
    it("estimates gas and sends the operation with buffered limits", async () => {
        const parameters = { calls: [{ to: "0x1111111111111111111111111111111111111111" }] };
        const client = {
            estimateUserOperationGas: vi.fn().mockResolvedValue({
                callGasLimit: 100_000n,
                preVerificationGas: 20_000n,
                verificationGasLimit: 1_000_000n,
            }),
            sendUserOperation: vi.fn().mockResolvedValue("0xuser-operation"),
        };

        await expect(
            sendPolyesterUserOperation(client as never, parameters as never),
        ).resolves.toBe("0xuser-operation");

        expect(client.estimateUserOperationGas).toHaveBeenCalledWith({
            callGasLimit: 0n,
            preVerificationGas: 0n,
            verificationGasLimit: 0n,
            ...parameters,
        });
        expect(client.sendUserOperation).toHaveBeenCalledWith({
            ...parameters,
            callGasLimit: 150_000n,
            preVerificationGas: 70_000n,
            verificationGasLimit: 1_200_000n,
        });
    });

    it("falls back to the normal send path when the extra estimate fails", async () => {
        const parameters = { calls: [{ to: "0x1111111111111111111111111111111111111111" }] };
        const client = {
            estimateUserOperationGas: vi.fn().mockRejectedValue(new Error("preflight failed")),
            sendUserOperation: vi.fn().mockResolvedValue("0xuser-operation"),
        };

        await expect(
            sendPolyesterUserOperation(client as never, parameters as never),
        ).resolves.toBe("0xuser-operation");

        expect(client.sendUserOperation).toHaveBeenCalledWith(parameters);
    });
});
