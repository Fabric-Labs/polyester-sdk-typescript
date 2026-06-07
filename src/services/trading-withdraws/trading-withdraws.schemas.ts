import { z } from "zod";
import { idToBigInt } from "../../utils/base58-id.js";
import { decimalToScaledInt } from "../../utils/numbers.js";

const OptionalSubAccountIdSchema = z
	.string()
	.trim()
	.optional()
	.transform((value) => (value ? idToBigInt(value, "subaccountId") : undefined));

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

const AmountInputSchema = z
	.object({
		amount: z.string().trim().min(1),
		quantityScale: z.number().int().min(0).max(36),
	})
	.transform(({ amount, quantityScale }) => decimalToScaledInt(amount, quantityScale, "amount"))
	.refine((value) => value > 0n, {
		message: "amount must be greater than 0",
	});

const QuantityInputSchema = z.union([
	z.object({ quantityScaled: QuantityScaledSchema }),
	AmountInputSchema.transform((quantityScaled) => ({ quantityScaled })),
]);

export const CreateTradingWithdrawToFundingInputSchema = z
	.object({
		subAccountId: OptionalSubAccountIdSchema,
		assetId: z.number().int().positive(),
		idempotencyKey: z.string().trim().min(1),
		destinationAddress: z
			.string()
			.trim()
			.optional()
			.transform((value) => (value ? value : "")),
		signerWallet: z
			.string()
			.trim()
			.optional()
			.transform((value) => (value ? value : "")),
		payloadSignature: z.instanceof(Uint8Array).optional(),
	})
	.and(QuantityInputSchema)
	.transform(({ subAccountId, ...input }) => ({
		...input,
		subaccountId: subAccountId,
	}));

export type CreateTradingWithdrawToFundingInput = z.input<
	typeof CreateTradingWithdrawToFundingInputSchema
>;

export type CreateTradingWithdrawToFundingRequest = z.output<
	typeof CreateTradingWithdrawToFundingInputSchema
>;

export const CreateTradingWithdrawResultSchema = z.object({
	intentId: z.string().trim().min(1),
});

export type CreateTradingWithdrawResult = z.output<typeof CreateTradingWithdrawResultSchema>;

export const CreateWalletTradingWithdrawResultSchema = CreateTradingWithdrawResultSchema;
export type CreateWalletTradingWithdrawResult = z.output<
	typeof CreateWalletTradingWithdrawResultSchema
>;
