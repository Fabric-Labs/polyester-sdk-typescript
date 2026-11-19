import { create } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import { describe, expect, it } from "vitest";
import { AuthErrorCode, AuthErrorDetailSchema } from "../../gen/auth/v1/auth_pb.js";
import { createErrorMappingTransport } from "../../shared/connect-error-mapping.js";
import { PreconditionFailedError, ValidationError } from "../../shared/errors.js";
import { AUTH_STEP_UP_HEADER_NAME } from "../../shared/request-options.js";
import { rejectingUnaryTransport, unaryTransport } from "../../testing/service-harness.js";
import { formatId } from "../../utils/base58-id.js";
import { ConnectedAppsService } from "./connected-apps.js";

const APP_ID = 1234567890123n;
const ts = (seconds: number) => ({ seconds: BigInt(seconds), nanos: 0 });
const client = { clientId: "claude", name: "Claude" };

function serviceWith(response: Record<string, unknown> = {}) {
    const transport = unaryTransport(response);
    return { transport, service: new ConnectedAppsService({ authApi: transport.transport }) };
}

describe("ConnectedAppsService", () => {
    it("reads a pending request for the consent page", async () => {
        const { transport, service } = serviceWith({
            authorization: {
                client,
                scopes: ["account:read"],
                resource: "https://mcp.polyester.test/",
                redirectHost: "claude.ai",
                expiresAt: ts(1_700_000_600),
            },
        });
        const authorization = await service.getAuthorization({ requestId: " req-1 " });

        expect(transport.lastCall()?.method.name).toBe("GetAppAuthorization");
        expect(transport.lastCall()?.message).toEqual({ requestId: "req-1" });
        expect(authorization).toEqual({
            client,
            scopes: ["account:read"],
            resource: "https://mcp.polyester.test/",
            redirectHost: "claude.ai",
            expiresAt: 1_700_000_600_000,
        });
    });

    it("approves with the step-up proof in the header and returns the redirect", async () => {
        const { transport, service } = serviceWith({ redirectUrl: "https://claude.ai/cb?code=c" });
        const result = await service.approveAuthorization(
            { requestId: "req-1" },
            { stepUpToken: " fresh " },
        );

        expect(transport.lastCall()?.method.name).toBe("ApproveAppAuthorization");
        expect(transport.lastCall()?.message).toEqual({ requestId: "req-1" });
        expect(new Headers(transport.lastCall()?.headers).get(AUTH_STEP_UP_HEADER_NAME)).toBe(
            "fresh",
        );
        expect(result).toEqual({ redirectUrl: "https://claude.ai/cb?code=c" });
    });

    it("denies and returns the redirect", async () => {
        const { transport, service } = serviceWith({ redirectUrl: "https://claude.ai/cb?e=d" });
        await expect(service.denyAuthorization({ requestId: "req-1" })).resolves.toEqual({
            redirectUrl: "https://claude.ai/cb?e=d",
        });
        expect(transport.lastCall()?.method.name).toBe("DenyAppAuthorization");
    });

    it("lists connected apps with base58 IDs and null for unset times", async () => {
        const { service } = serviceWith({
            apps: [
                {
                    connectedAppId: APP_ID,
                    client,
                    scopes: ["account:read"],
                    resource: "https://mcp.polyester.test/",
                    connectedAt: ts(1_700_000_000),
                    expiresAt: ts(1_702_592_000),
                },
            ],
        });
        await expect(service.list()).resolves.toEqual([
            {
                connectedAppId: formatId(APP_ID),
                client,
                scopes: ["account:read"],
                resource: "https://mcp.polyester.test/",
                connectedAt: 1_700_000_000_000,
                lastUsedAt: null,
                expiresAt: 1_702_592_000_000,
            },
        ]);
    });

    it("revokes by base58 ID and rejects a malformed one before sending", async () => {
        const { transport, service } = serviceWith();
        await expect(
            service.revoke({ connectedAppId: ` ${formatId(APP_ID)} ` }),
        ).resolves.toBeUndefined();
        expect(transport.lastCall()?.message).toEqual({ connectedAppId: APP_ID });

        await expect(service.revoke({ connectedAppId: "0OIl" })).rejects.toBeInstanceOf(
            ValidationError,
        );
        await expect(service.getAuthorization({ requestId: "  " })).rejects.toBeInstanceOf(
            ValidationError,
        );
        expect(transport.calls).toHaveLength(1);
    });

    it("maps the connected app limit to PreconditionFailedError", async () => {
        const error = new ConnectError("limit", Code.FailedPrecondition, undefined, [
            {
                desc: AuthErrorDetailSchema,
                value: create(AuthErrorDetailSchema, {
                    code: AuthErrorCode.AUTH_CONNECTED_APP_LIMIT_REACHED,
                }),
            },
        ]);
        const service = new ConnectedAppsService({
            authApi: createErrorMappingTransport(rejectingUnaryTransport(error)),
        });
        const rejected = service.approveAuthorization({ requestId: "req-1" });
        await expect(rejected).rejects.toBeInstanceOf(PreconditionFailedError);
        await expect(rejected).rejects.toMatchObject({
            detail: { service: "auth", code: "AUTH_CONNECTED_APP_LIMIT_REACHED" },
        });
    });
});
