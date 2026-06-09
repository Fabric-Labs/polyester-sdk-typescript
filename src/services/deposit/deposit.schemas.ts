import * as v from "valibot";
import {
    AccountScopeInputEntries,
    accountScopeToSubaccountId,
} from "../../shared/account-scope.js";

const ChainIdSchema = v.pipe(v.number(), v.integer(), v.gtValue(0));

export const CreateDepositAddressInputSchema = v.pipe(
    v.object({
        ...AccountScopeInputEntries,
        chainId: ChainIdSchema,
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
    v.object({
        ...AccountScopeInputEntries,
        chainId: v.optional(ChainIdSchema),
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
    chainId: v.pipe(v.number(), v.integer(), v.gtValue(0)),
    depositAddress: v.pipe(v.string(), v.trim(), v.minLength(1)),
});

export type DepositAddress = v.InferOutput<typeof DepositAddressSchema>;

export const DepositAddressesSchema = v.array(DepositAddressSchema);
