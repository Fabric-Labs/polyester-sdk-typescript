import * as Proto from "../../gen/chain/guard/v1/guard_signer_pb.js";
import { AUTH_STEP_UP_HEADER_NAME } from "../../shared/request-options.js";
import {
    rejectingUnaryTransport,
    subaccountResolverStub,
    unaryTransport,
} from "../../testing/service-harness.js";
import { Code, ConnectError } from "@connectrpc/connect";
import { describe, expect, it } from "vitest";
import { GuardSignerService } from "./guard-signer.js";

function approval(signature = [1, 2, 3]) {
    return {
        nonceSpace: 9n,
        deadlineUnix: 1234n,
        signature: new Uint8Array(signature),
    };
}

describe("GuardSignerService", () => {
    it("normalizes wallet lifecycle requests, resolver defaults, and step-up metadata", async () => {
        const responses = [
            { signerAddress: "0x1111111111111111111111111111111111111111" },
            {
                newSignerAddress: "0x2222222222222222222222222222222222222222",
                approval: approval(),
            },
            {
                privateKey: "0x1111111111111111111111111111111111111111111111111111111111111111",
            },
        ];
        const transport = unaryTransport((_call, index) => responses[index] ?? {});
        const service = new GuardSignerService(transport.transport, subaccountResolverStub("42"));
        const cases = [
            {
                run: () => service.createWallet({}, { stepUpToken: " fresh-token " }),
                result: { signerAddress: "0x1111111111111111111111111111111111111111" },
            },
            {
                run: () => service.rotateWallet({}, { stepUpToken: " fresh-token " }),
                result: {
                    newSignerAddress: "0x2222222222222222222222222222222222222222",
                    approval: { signature: "0x010203", nonceSpace: "9", deadlineUnix: "1234" },
                },
            },
            {
                run: () => service.exportWallet({}, { stepUpToken: " fresh-token " }),
                result: {
                    privateKey:
                        "0x1111111111111111111111111111111111111111111111111111111111111111",
                },
            },
        ];

        for (const testCase of cases) {
            await expect(testCase.run()).resolves.toMatchObject(testCase.result);
            const call = transport.lastCall();
            expect(call?.message).toEqual({ subaccountId: 42n });
            expect(new Headers(call?.headers).get(AUTH_STEP_UP_HEADER_NAME)).toBe("fresh-token");
        }
    });

    it("resolves status to parsed output, null omitted status, and null not-found errors", async () => {
        const responses = [
            {
                status: {
                    signerAddress: "0x1111111111111111111111111111111111111111",
                    onchainSignerAddress: "0x1111111111111111111111111111111111111111",
                    initialized: true,
                    nonce: "12",
                    nonceSpace: 9n,
                },
            },
            {},
        ];
        const transport = unaryTransport((_call, index) => responses[index] ?? {});
        const service = new GuardSignerService(transport.transport, subaccountResolverStub("42"));
        const signal = new AbortController().signal;

        await expect(service.getStatus({}, { signal })).resolves.toEqual({
            signerAddress: "0x1111111111111111111111111111111111111111",
            onchainSignerAddress: "0x1111111111111111111111111111111111111111",
            initialized: true,
            nonce: "12",
            nonceSpace: 9n,
        });
        await expect(service.getStatus({ subaccountId: "" })).resolves.toBeNull();

        expect(transport.calls[0]?.message).toEqual({ subaccountId: 42n });
        expect(transport.calls[0]?.signal).toBe(signal);
        expect(transport.calls[1]?.message).toEqual({});

        const notFound = new GuardSignerService(
            rejectingUnaryTransport(new ConnectError("missing", Code.NotFound)),
        );
        await expect(notFound.getStatus()).resolves.toBeNull();
    });

    it("normalizes single and batch protected action signing requests", async () => {
        const responses = [{ approval: approval() }, { approvals: [approval([1]), approval([2])] }];
        const transport = unaryTransport((_call, index) => responses[index] ?? {});
        const service = new GuardSignerService(transport.transport, subaccountResolverStub("42"));

        await expect(
            service.signProtectedAction(
                {
                    action: "fundingAddExternalWhitelist",
                    args: {
                        case: "externalWhitelist",
                        polychainChainId: 8453,
                        addresses: ["0x01"],
                    },
                },
                { stepUpToken: " fresh-token " },
            ),
        ).resolves.toMatchObject({
            signature: "0x010203",
            raw: approval(),
        });
        expect(transport.lastCall()?.message).toEqual({
            subaccountId: 42n,
            action: Proto.ProtectedAction.FUNDING_ADD_EXTERNAL_WHITELIST,
            args: {
                args: {
                    case: "externalWhitelist",
                    value: { polychainChainId: 8453, addresses: ["0x01"] },
                },
            },
        });

        await expect(
            service.batchSignProtectedActions(
                {
                    subaccountId: "",
                    actions: [
                        {
                            action: "fundingSetInternalWhitelistRequired",
                            args: { case: "whitelistRequirement", required: false },
                        },
                        {
                            action: "fundingAddInternalWhitelist",
                            args: {
                                case: "internalWhitelist",
                                addresses: ["0x1111111111111111111111111111111111111111"],
                            },
                        },
                    ],
                },
                { stepUpToken: " fresh-token " },
            ),
        ).resolves.toMatchObject({
            approvals: [{ signature: "0x01" }, { signature: "0x02" }],
        });
        expect(transport.lastCall()?.message).toEqual({
            actions: [
                {
                    action: Proto.ProtectedAction.FUNDING_SET_INTERNAL_WHITELIST_REQUIRED,
                    args: { args: { case: "whitelistRequirement", value: { required: false } } },
                },
                {
                    action: Proto.ProtectedAction.FUNDING_ADD_INTERNAL_WHITELIST,
                    args: {
                        args: {
                            case: "internalWhitelist",
                            value: {
                                addresses: ["0x1111111111111111111111111111111111111111"],
                            },
                        },
                    },
                },
            ],
        });
        expect(new Headers(transport.lastCall()?.headers).get(AUTH_STEP_UP_HEADER_NAME)).toBe(
            "fresh-token",
        );
    });

    it("returns null for missing single approvals and throws on mismatched batch approvals", async () => {
        const responses = [{}, { approvals: [approval()] }];
        const transport = unaryTransport((_call, index) => responses[index] ?? {});
        const service = new GuardSignerService(transport.transport);

        await expect(
            service.signProtectedAction({ action: "fundingSetExternalWhitelistRequired" }),
        ).resolves.toBeNull();
        await expect(
            service.batchSignProtectedActions({
                actions: [
                    { action: "fundingSetExternalWhitelistRequired" },
                    { action: "fundingSetInternalWhitelistRequired" },
                ],
            }),
        ).rejects.toThrow("mismatched number of GuardSigner approvals");
    });
});
