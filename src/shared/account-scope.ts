import * as v from "./validation.js";
import { idToBigInt } from "../utils/base58-id.js";

export const AccountScopeSchema = v.union([
    v.picklist(["active", "main"]),
    v.strictObject({
        subaccountId: v.pipe(v.string(), v.trim(), v.minLength(1)),
    }),
]);

export type AccountScope = v.InferInput<typeof AccountScopeSchema>;

export type AccountScopedInput = {
    account?: AccountScope;
};

export const OptionalAccountScopeSchema = v.optional(AccountScopeSchema);

export const AccountScopeInputEntries = {
    account: OptionalAccountScopeSchema,
};

export function accountScopeToSubaccountId(account: AccountScope | undefined): bigint | undefined {
    if (account === undefined || account === "active" || account === "main") return undefined;
    return idToBigInt(account.subaccountId, "subaccountId");
}

export function accountScopeToSubaccountIdOrZero(account: AccountScope | undefined): bigint {
    return accountScopeToSubaccountId(account) ?? 0n;
}
