import * as v from "valibot";
import { optionalSubaccountIdInputSchema } from "../../shared/schemas.js";

const OptionalSubaccountIdSchema = optionalSubaccountIdInputSchema();

export const CreateDepositAddressInputSchema = v.object({
    subaccountId: OptionalSubaccountIdSchema,
    chainId: v.pipe(v.number(), v.integer(), v.gtValue(0)),
});

export type CreateDepositAddressInput = v.InferInput<typeof CreateDepositAddressInputSchema>;
export type CreateDepositAddressRequest = v.InferOutput<typeof CreateDepositAddressInputSchema>;

export const ListDepositAddressesInputSchema = v.object({
    subaccountId: OptionalSubaccountIdSchema,
    chainId: v.optional(v.pipe(v.number(), v.integer(), v.gtValue(0))),
});

export type ListDepositAddressesInput = v.InferInput<typeof ListDepositAddressesInputSchema>;
export type ListDepositAddressesRequest = v.InferOutput<typeof ListDepositAddressesInputSchema>;

export const DepositAddressSchema = v.object({
    chainId: v.pipe(v.number(), v.integer(), v.gtValue(0)),
    depositAddress: v.pipe(v.string(), v.trim(), v.minLength(1)),
});

export type DepositAddress = v.InferOutput<typeof DepositAddressSchema>;

export const DepositAddressesSchema = v.array(DepositAddressSchema);
