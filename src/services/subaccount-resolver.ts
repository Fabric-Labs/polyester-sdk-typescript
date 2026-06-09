import type { AccountScope, AccountScopedInput } from "../shared/account-scope.js";

/**
 * Provides the default subaccount ID based on auth state.
 * When the active account is a subaccount (not main), this returns that ID.
 */
export interface SubaccountResolver {
    getDefaultSubaccountId(): string | null;
    getActiveAccountId?(): string | null;
    getMainAccountId?(): string | null;
}

/**
 * Resolves the account scope for a service call.
 *
 * Priority:
 * 1. Explicit `"main"` -> returns main-account scope
 * 2. Explicit `{ subaccountId }` -> returns that subaccount
 * 3. Explicit `"active"` or omitted -> checks resolver for active subaccount
 */
export function resolveAccountScope(
    explicit: AccountScope | undefined,
    resolver?: SubaccountResolver,
): AccountScope | undefined {
    if (explicit === "main") return "main";
    if (explicit !== undefined && explicit !== "active") return explicit;

    const defaultId = resolver?.getDefaultSubaccountId();
    return defaultId ? { subaccountId: defaultId } : undefined;
}

function assertNoLegacySubaccountId(input: object): void {
    if (Object.prototype.hasOwnProperty.call(input, "subaccountId")) {
        throw new Error(
            'Use `account: "main"` or `account: { subaccountId }` instead of `subaccountId`.',
        );
    }
}

/**
 * Resolves account-scoped input using the configured resolver when needed.
 */
export function resolveAccountScopedInput<TInput extends object>(
    input: TInput & AccountScopedInput,
    resolver?: SubaccountResolver,
): TInput & AccountScopedInput {
    assertNoLegacySubaccountId(input);
    return {
        ...input,
        account: resolveAccountScope(input.account, resolver),
    };
}
