import { describe, expect, it } from "vitest";
import * as v from "valibot";
import * as Proto from "../../gen/chain/guard/v1/guard_signer_pb.js";
import {
    BatchSignProtectedActionInputSchema,
    GuardApprovalSchema,
    RotateGuardSignerWalletResultSchema,
    SignProtectedActionInputSchema,
} from "./guard-signer.schemas.js";

describe("SignProtectedActionInputSchema", () => {
    it("maps protected actions and external whitelist args to proto shape", () => {
        const input = v.parse(SignProtectedActionInputSchema, {
            account: { subaccountId: " 9 " },
            action: "fundingAddExternalWhitelist",
            args: {
                case: "externalWhitelist",
                polychainChainId: 8453,
                addresses: [" 0xabc "],
            },
        });

        expect(input).toEqual({
            subaccountId: 9n,
            action: Proto.ProtectedAction.FUNDING_ADD_EXTERNAL_WHITELIST,
            args: {
                args: {
                    case: "externalWhitelist",
                    value: {
                        polychainChainId: 8453,
                        addresses: ["0xabc"],
                    },
                },
            },
        });
    });

    it("maps whitelist requirement args and rejects proto enum inputs", () => {
        const input = v.parse(SignProtectedActionInputSchema, {
            action: "fundingSetInternalWhitelistRequired",
            args: {
                case: "whitelistRequirement",
                required: false,
            },
        });

        expect(input).toEqual({
            subaccountId: undefined,
            action: Proto.ProtectedAction.FUNDING_SET_INTERNAL_WHITELIST_REQUIRED,
            args: {
                args: {
                    case: "whitelistRequirement",
                    value: { required: false },
                },
            },
        });
        expect(() =>
            v.parse(SignProtectedActionInputSchema, {
                action: Proto.ProtectedAction.FUNDING_ADD_EXTERNAL_WHITELIST,
            }),
        ).toThrow();
    });
});

describe("BatchSignProtectedActionInputSchema", () => {
    it("maps each action and rejects empty batches", () => {
        const input = v.parse(BatchSignProtectedActionInputSchema, {
            account: { subaccountId: "4" },
            actions: [
                {
                    action: "fundingAddInternalWhitelist",
                    args: {
                        case: "internalWhitelist",
                        addresses: ["acct-1"],
                    },
                },
                { action: "fundingRemoveExternalWhitelist" },
            ],
        });

        expect(input).toEqual({
            subaccountId: 4n,
            actions: [
                {
                    action: Proto.ProtectedAction.FUNDING_ADD_INTERNAL_WHITELIST,
                    args: {
                        args: {
                            case: "internalWhitelist",
                            value: { addresses: ["acct-1"] },
                        },
                    },
                },
                {
                    action: Proto.ProtectedAction.FUNDING_REMOVE_EXTERNAL_WHITELIST,
                    args: undefined,
                },
            ],
        });
        expect(() => v.parse(BatchSignProtectedActionInputSchema, { actions: [] })).toThrow(
            "At least one protected action is required.",
        );
    });
});

describe("GuardApprovalSchema", () => {
    it("stringifies bigint fields and hex-encodes signatures", () => {
        const rawApproval = {
            nonceSpace: 2n,
            deadlineUnix: 1_700_000_000n,
            signature: new Uint8Array([0xab, 0xcd]),
        };

        const approval = v.parse(GuardApprovalSchema, rawApproval);

        expect(approval).toEqual({
            nonceSpace: "2",
            deadlineUnix: "1700000000",
            signature: "0xabcd",
            raw: rawApproval,
        });
    });
});

describe("RotateGuardSignerWalletResultSchema", () => {
    it("defaults omitted approvals to null and validates signer addresses", () => {
        const result = v.parse(RotateGuardSignerWalletResultSchema, {
            newSignerAddress: " 0x0000000000000000000000000000000000000001 ",
        });

        expect(result).toEqual({
            newSignerAddress: "0x0000000000000000000000000000000000000001",
            approval: null,
        });
        expect(() =>
            v.parse(RotateGuardSignerWalletResultSchema, { newSignerAddress: "0xabc" }),
        ).toThrow();
    });
});
