import { bytesToHex } from "@noble/hashes/utils.js";
import * as v from "valibot";
import { optionalSubAccountIdInputSchema } from "../../shared/schemas.js";
import { PROTECTED_ACTION_VALUES, ProtectedActionCodec } from "./guard-signer.codecs.js";

const OptionalSubAccountIdSchema = optionalSubAccountIdInputSchema();

const HexAddressSchema = v.pipe(v.string(), v.trim(), v.regex(/^0x[0-9a-fA-F]{40}$/));

const WhitelistAddressSchema = v.pipe(v.string(), v.trim(), v.minLength(1));

export const GuardSignerScopedInputSchema = v.pipe(
    v.object({
        subAccountId: OptionalSubAccountIdSchema,
    }),
    v.transform(({ subAccountId }) => ({
        subaccountId: subAccountId,
    })),
);

export type GuardSignerScopedInput = v.InferInput<typeof GuardSignerScopedInputSchema>;

export type GuardSignerMutationOptions = {
    stepUpToken?: string | null;
};

const ProtectedActionArgsInputSchema = v.variant("case", [
    v.object({
        case: v.literal("externalWhitelist"),
        polychainChainId: v.pipe(v.number(), v.integer(), v.gtValue(0)),
        addresses: v.pipe(v.array(WhitelistAddressSchema), v.minLength(1)),
    }),
    v.object({
        case: v.literal("internalWhitelist"),
        addresses: v.pipe(v.array(WhitelistAddressSchema), v.minLength(1)),
    }),
    v.object({
        case: v.literal("whitelistRequirement"),
        required: v.boolean(),
    }),
]);

function toProtectedActionArgs(args: v.InferOutput<typeof ProtectedActionArgsInputSchema>) {
    if (args.case === "externalWhitelist") {
        return {
            args: {
                case: "externalWhitelist" as const,
                value: {
                    polychainChainId: args.polychainChainId,
                    addresses: args.addresses,
                },
            },
        };
    }

    if (args.case === "internalWhitelist") {
        return {
            args: {
                case: "internalWhitelist" as const,
                value: {
                    addresses: args.addresses,
                },
            },
        };
    }

    return {
        args: {
            case: "whitelistRequirement" as const,
            value: {
                required: args.required,
            },
        },
    };
}

export const SignProtectedActionInputSchema = v.pipe(
    v.object({
        subAccountId: OptionalSubAccountIdSchema,
        action: v.picklist(PROTECTED_ACTION_VALUES),
        args: v.optional(ProtectedActionArgsInputSchema),
    }),
    v.transform(({ subAccountId, action, args }) => ({
        subaccountId: subAccountId,
        action: ProtectedActionCodec.inputToProto[action],
        args: args ? toProtectedActionArgs(args) : undefined,
    })),
);

export type SignProtectedActionInput = v.InferInput<typeof SignProtectedActionInputSchema>;

export const BatchSignProtectedActionInputSchema = v.pipe(
    v.object({
        subAccountId: OptionalSubAccountIdSchema,
        actions: v.pipe(
            v.array(
                v.object({
                    action: v.picklist(PROTECTED_ACTION_VALUES),
                    args: v.optional(ProtectedActionArgsInputSchema),
                }),
            ),
            v.minLength(1, "At least one protected action is required."),
        ),
    }),
    v.transform(({ subAccountId, actions }) => ({
        subaccountId: subAccountId,
        actions: actions.map(({ action, args }) => ({
            action: ProtectedActionCodec.inputToProto[action],
            args: args ? toProtectedActionArgs(args) : undefined,
        })),
    })),
);

export type BatchSignProtectedActionInput = v.InferInput<
    typeof BatchSignProtectedActionInputSchema
>;

export const GuardSignerStatusSchema = v.object({
    signerAddress: v.string(),
    onchainSignerAddress: v.string(),
    initialized: v.boolean(),
    nonce: v.string(),
    nonceSpace: v.bigint(),
});

export type GuardSignerStatus = v.InferOutput<typeof GuardSignerStatusSchema>;

export const GuardApprovalSchema = v.pipe(
    v.object({
        nonceSpace: v.bigint(),
        deadlineUnix: v.bigint(),
        signature: v.instance(Uint8Array),
    }),
    v.transform((approval) => ({
        nonceSpace: approval.nonceSpace.toString(),
        deadlineUnix: approval.deadlineUnix.toString(),
        signature: `0x${bytesToHex(approval.signature)}` as `0x${string}`,
        raw: approval,
    })),
);

export type GuardApproval = v.InferOutput<typeof GuardApprovalSchema>;

export const BatchGuardApprovalsSchema = v.object({
    approvals: v.array(GuardApprovalSchema),
});

export type BatchGuardApprovals = v.InferOutput<typeof BatchGuardApprovalsSchema>;

export const CreateGuardSignerWalletResultSchema = v.object({
    signerAddress: HexAddressSchema,
});

export type CreateGuardSignerWalletResult = v.InferOutput<
    typeof CreateGuardSignerWalletResultSchema
>;

export const RotateGuardSignerWalletResultSchema = v.pipe(
    v.object({
        newSignerAddress: HexAddressSchema,
        approval: v.optional(GuardApprovalSchema),
    }),
    v.transform((result) => ({
        newSignerAddress: result.newSignerAddress,
        approval: result.approval ?? null,
    })),
);

export type RotateGuardSignerWalletResult = v.InferOutput<
    typeof RotateGuardSignerWalletResultSchema
>;

export const ExportGuardSignerWalletResultSchema = v.object({
    privateKey: v.pipe(v.string(), v.trim(), v.regex(/^0x[0-9a-fA-F]{64}$/)),
});

export type ExportGuardSignerWalletResult = v.InferOutput<
    typeof ExportGuardSignerWalletResultSchema
>;
