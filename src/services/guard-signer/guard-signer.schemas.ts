import { bytesToHex } from "@noble/hashes/utils.js";
import { z } from "zod";
import { idToBigInt } from "../../utils/base58-id.js";
import { PROTECTED_ACTION_VALUES, ProtectedActionCodec } from "./guard-signer.codecs.js";

const OptionalSubAccountIdSchema = z
	.string()
	.trim()
	.optional()
	.transform((value) => (value ? idToBigInt(value, "subaccountId") : undefined));

const HexAddressSchema = z
	.string()
	.trim()
	.regex(/^0x[0-9a-fA-F]{40}$/);

const WhitelistAddressSchema = z.string().trim().min(1);

export const GuardSignerScopedInputSchema = z
	.object({
		subAccountId: OptionalSubAccountIdSchema,
	})
	.transform(({ subAccountId }) => ({
		subaccountId: subAccountId,
	}));

export type GuardSignerScopedInput = z.input<typeof GuardSignerScopedInputSchema>;

export type GuardSignerMutationOptions = {
	stepUpToken?: string | null;
};

const ProtectedActionArgsInputSchema = z.discriminatedUnion("case", [
	z.object({
		case: z.literal("externalWhitelist"),
		polychainChainId: z.number().int().positive(),
		addresses: z.array(WhitelistAddressSchema).min(1),
	}),
	z.object({
		case: z.literal("internalWhitelist"),
		addresses: z.array(WhitelistAddressSchema).min(1),
	}),
	z.object({
		case: z.literal("whitelistRequirement"),
		required: z.boolean(),
	}),
]);

function toProtectedActionArgs(args: z.output<typeof ProtectedActionArgsInputSchema>) {
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

export const SignProtectedActionInputSchema = z
	.object({
		subAccountId: OptionalSubAccountIdSchema,
		action: z.enum(PROTECTED_ACTION_VALUES),
		args: ProtectedActionArgsInputSchema.optional(),
	})
	.transform(({ subAccountId, action, args }) => ({
		subaccountId: subAccountId,
		action: ProtectedActionCodec.inputToProto[action],
		args: args ? toProtectedActionArgs(args) : undefined,
	}));

export type SignProtectedActionInput = z.input<typeof SignProtectedActionInputSchema>;

export const BatchSignProtectedActionInputSchema = z
	.object({
		subAccountId: OptionalSubAccountIdSchema,
		actions: z
			.array(
				z.object({
					action: z.enum(PROTECTED_ACTION_VALUES),
					args: ProtectedActionArgsInputSchema.optional(),
				})
			)
			.min(1, "At least one protected action is required."),
	})
	.transform(({ subAccountId, actions }) => ({
		subaccountId: subAccountId,
		actions: actions.map(({ action, args }) => ({
			action: ProtectedActionCodec.inputToProto[action],
			args: args ? toProtectedActionArgs(args) : undefined,
		})),
	}));

export type BatchSignProtectedActionInput = z.input<typeof BatchSignProtectedActionInputSchema>;

export const GuardSignerStatusSchema = z.object({
	signerAddress: z.string(),
	onchainSignerAddress: z.string(),
	initialized: z.boolean(),
	nonce: z.string(),
	nonceSpace: z.bigint(),
});

export type GuardSignerStatus = z.output<typeof GuardSignerStatusSchema>;

export const GuardApprovalSchema = z
	.object({
		nonceSpace: z.bigint(),
		deadlineUnix: z.bigint(),
		signature: z.instanceof(Uint8Array),
	})
	.transform((approval) => ({
		nonceSpace: approval.nonceSpace.toString(),
		deadlineUnix: approval.deadlineUnix.toString(),
		signature: `0x${bytesToHex(approval.signature)}` as `0x${string}`,
		raw: approval,
	}));

export type GuardApproval = z.output<typeof GuardApprovalSchema>;

export const BatchGuardApprovalsSchema = z.object({
	approvals: z.array(GuardApprovalSchema),
});

export type BatchGuardApprovals = z.output<typeof BatchGuardApprovalsSchema>;

export const CreateGuardSignerWalletResultSchema = z.object({
	signerAddress: HexAddressSchema,
});

export type CreateGuardSignerWalletResult = z.output<typeof CreateGuardSignerWalletResultSchema>;

export const RotateGuardSignerWalletResultSchema = z
	.object({
		newSignerAddress: HexAddressSchema,
		approval: GuardApprovalSchema.optional(),
	})
	.transform((result) => ({
		newSignerAddress: result.newSignerAddress,
		approval: result.approval ?? null,
	}));

export type RotateGuardSignerWalletResult = z.output<typeof RotateGuardSignerWalletResultSchema>;

export const ExportGuardSignerWalletResultSchema = z.object({
	privateKey: z
		.string()
		.trim()
		.regex(/^0x[0-9a-fA-F]{64}$/),
});

export type ExportGuardSignerWalletResult = z.output<typeof ExportGuardSignerWalletResultSchema>;
