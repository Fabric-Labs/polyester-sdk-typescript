import type { Transport } from "@connectrpc/connect";
import { describe, expect, it, vi } from "vitest";
import { AUTH_STEP_UP_HEADER_NAME } from "../../shared/request-options.js";
import { MfaService } from "./mfa.js";

function transportWithEnrollmentCapture(
    capture: (req: { headers: HeadersInit | undefined; message: Record<string, unknown> }) => void,
): Transport {
    return {
        unary: vi.fn(async (...args: unknown[]) => {
            capture({
                headers: args[3] as HeadersInit | undefined,
                message: args[4] as Record<string, unknown>,
            });
            return {
                message: {
                    enrollmentId: "enrollment-1",
                    secret: "secret",
                    otpauthUri: "otpauth://totp/polyester",
                },
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

describe("MfaService", () => {
    it("passes step-up token as call metadata, not request input", async () => {
        let captured:
            | { headers: HeadersInit | undefined; message: Record<string, unknown> }
            | undefined;
        const service = new MfaService(
            transportWithEnrollmentCapture((req) => {
                captured = req;
            }),
        );

        await expect(
            service.beginTotpEnrollment(
                { label: " authenticator " },
                { stepUpToken: " fresh-token " },
            ),
        ).resolves.toMatchObject({
            enrollmentId: "enrollment-1",
            secret: "secret",
            otpauthUri: "otpauth://totp/polyester",
        });

        expect(new Headers(captured?.headers).get(AUTH_STEP_UP_HEADER_NAME)).toBe("fresh-token");
        expect(captured?.message).toMatchObject({ label: "authenticator" });
        expect(captured?.message).not.toHaveProperty("stepUpToken");
    });
});
