import { z } from "zod";
import { idToBigInt } from "../../utils/base58-id";

const OptionalSubAccountIdSchema = z
	.string()
	.optional()
	.transform((v) => (v ? idToBigInt(v, "subaccountId") : undefined));

export const CreateDepositAddressInputSchema = z
	.object({
		subAccountId: OptionalSubAccountIdSchema,
		chainId: z.number().int().positive(),
	})
	.transform(({ subAccountId, ...rest }) => ({
		...rest,
		subaccountId: subAccountId,
	}));

export type CreateDepositAddressInput = z.input<typeof CreateDepositAddressInputSchema>;
export type CreateDepositAddressRequest = z.output<typeof CreateDepositAddressInputSchema>;

export const ListDepositAddressesInputSchema = z
	.object({
		subAccountId: OptionalSubAccountIdSchema,
		chainId: z.number().int().positive().optional(),
	})
	.transform(({ subAccountId, ...rest }) => ({
		...rest,
		subaccountId: subAccountId,
	}));

export type ListDepositAddressesInput = z.input<typeof ListDepositAddressesInputSchema>;
export type ListDepositAddressesRequest = z.output<typeof ListDepositAddressesInputSchema>;

export const DepositAddressSchema = z.object({
	chainId: z.number().int().positive(),
	depositAddress: z.string().trim().min(1),
});

export type DepositAddress = z.output<typeof DepositAddressSchema>;

export const DepositAddressesSchema = z.array(DepositAddressSchema);
