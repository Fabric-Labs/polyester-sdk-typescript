import { z } from "zod";
import { idToBigInt } from "../../utils/base58-id.js";
import { tsNsToMs } from "../../utils/time.js";
import { InternalTransferDestinationCodec } from "./internal-transfers.codecs.js";

const OptionalSubAccountIdSchema = z
	.string()
	.trim()
	.optional()
	.transform((value) => (value ? idToBigInt(value, "subaccountId") : undefined));

const IdSchema = (fieldName: string) =>
	z
		.string()
		.trim()
		.min(1)
		.transform((value) => idToBigInt(value, fieldName));

const QuantityScaledSchema = z
	.union([
		z.bigint(),
		z
			.string()
			.trim()
			.regex(/^\d+$/)
			.transform((value) => BigInt(value)),
	])
	.refine((value) => value > 0n, {
		message: "quantityScaled must be greater than 0",
	});

export const InternalTransferDestinationInputSchema = z
	.discriminatedUnion("type", [
		z.object({
			type: z.literal("account"),
			accountId: IdSchema("accountId"),
		}),
		z.object({
			type: z.literal("subAccount"),
			subAccountId: IdSchema("subaccountId"),
		}),
		z.object({
			type: z.literal("smartAccountAddress"),
			address: z.string().trim().min(1),
		}),
	])
	.transform((destination) => {
		switch (destination.type) {
			case "account":
				return {
					case: InternalTransferDestinationCodec.inputToProtoCase.account,
					value: destination.accountId,
				} as const;
			case "subAccount":
				return {
					case: InternalTransferDestinationCodec.inputToProtoCase.subAccount,
					value: destination.subAccountId,
				} as const;
			case "smartAccountAddress":
				return {
					case: InternalTransferDestinationCodec.inputToProtoCase.smartAccountAddress,
					value: destination.address,
				} as const;
		}
	});

export type InternalTransferDestination = z.input<typeof InternalTransferDestinationInputSchema>;

export const CreateInternalTransferInputSchema = z
	.object({
		subAccountId: OptionalSubAccountIdSchema,
		destination: InternalTransferDestinationInputSchema,
		assetId: z.number().int().positive(),
		quantityScaled: QuantityScaledSchema,
		idempotencyKey: z.string().trim().min(1),
	})
	.transform(({ subAccountId, ...rest }) => ({
		...rest,
		subaccountId: subAccountId,
	}));

export type CreateInternalTransferInput = z.input<typeof CreateInternalTransferInputSchema>;
export type CreateInternalTransferRequest = z.output<typeof CreateInternalTransferInputSchema>;

const NonEmptyResponseStringSchema = z.string().trim().min(1);
const OptionalResponseStringSchema = z
	.string()
	.trim()
	.optional()
	.transform((value) => (value ? value : undefined));

export const ResolvedInternalTransferDestinationSchema = z
	.object({
		rootAccountPublicId: OptionalResponseStringSchema,
		subaccountPublicId: OptionalResponseStringSchema,
		smartAccountAddress: OptionalResponseStringSchema,
	})
	.transform(({ rootAccountPublicId, subaccountPublicId, smartAccountAddress }) => ({
		rootAccountId: rootAccountPublicId,
		subAccountId: subaccountPublicId,
		smartAccountAddress,
	}));

export type ResolvedInternalTransferDestination = z.output<
	typeof ResolvedInternalTransferDestinationSchema
>;

export const CreateInternalTransferResultSchema = z
	.object({
		requestId: NonEmptyResponseStringSchema,
		transferId: NonEmptyResponseStringSchema,
		acceptedAtUnixNs: z.bigint(),
		assetId: z.number().int().positive(),
		assetCode: NonEmptyResponseStringSchema,
		uAssetId: NonEmptyResponseStringSchema,
		quantityScaled: z.bigint(),
		destination: ResolvedInternalTransferDestinationSchema.optional(),
	})
	.transform(({ acceptedAtUnixNs, quantityScaled, ...result }) => ({
		...result,
		acceptedAtUnixMs: tsNsToMs(acceptedAtUnixNs),
		quantityScaled: quantityScaled.toString(),
	}));

export type CreateInternalTransferResult = z.output<typeof CreateInternalTransferResultSchema>;
