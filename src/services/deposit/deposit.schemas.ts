import * as v from "valibot";
import { PositiveUint32InputSchema } from "../shared.js";
import {
    AccountScopeInputEntries,
    accountScopeToSubaccountId,
} from "../../shared/account-scope.js";

export const CreateDepositAddressInputSchema = v.pipe(
    v.strictObject({
        ...AccountScopeInputEntries,
        chainId: PositiveUint32InputSchema,
    }),
    v.transform(({ account, ...input }) => ({
        ...input,
        subaccountId: accountScopeToSubaccountId(account),
    })),
);

export function createCreateDepositAddressInputSchema() {
    return CreateDepositAddressInputSchema;
}

export type CreateDepositAddressInput = v.InferInput<
    ReturnType<typeof createCreateDepositAddressInputSchema>
>;
export type CreateDepositAddressRequest = v.InferOutput<
    ReturnType<typeof createCreateDepositAddressInputSchema>
>;

export const ListDepositAddressesInputSchema = v.pipe(
    v.strictObject({
        ...AccountScopeInputEntries,
        chainId: v.optional(PositiveUint32InputSchema),
    }),
    v.transform(({ account, ...input }) => ({
        ...input,
        subaccountId: accountScopeToSubaccountId(account),
    })),
);

export function createListDepositAddressesInputSchema() {
    return ListDepositAddressesInputSchema;
}

export type ListDepositAddressesInput = v.InferInput<
    ReturnType<typeof createListDepositAddressesInputSchema>
>;
export type ListDepositAddressesRequest = v.InferOutput<
    ReturnType<typeof createListDepositAddressesInputSchema>
>;

export const DepositAddressSchema = v.object({
    chainId: PositiveUint32InputSchema,
    depositAddress: v.pipe(v.string(), v.trim(), v.minLength(1)),
});

export type DepositAddress = v.InferOutput<typeof DepositAddressSchema>;

export const DepositAddressesSchema = v.array(DepositAddressSchema);
