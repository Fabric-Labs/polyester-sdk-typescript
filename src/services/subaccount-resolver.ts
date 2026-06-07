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
 * Resolves the subaccount ID for a service call.
 *
 * Priority:
 * 1. Explicit `""` -> returns `undefined` (use main account)
 * 2. Explicit non-empty string -> returns that string
 * 3. `undefined` (not passed) -> checks resolver for active subaccount
 *
 * @param explicit - The explicitly passed subaccountId (or undefined if not passed)
 * @param resolver - Optional resolver that provides default based on auth state
 */
export function resolveSubaccountId(
    explicit: string | undefined,
    resolver?: SubaccountResolver,
): string | undefined {
    // explicit empty string = force main account
    if (explicit === "") return undefined;
    // explicit string = use it
    if (explicit !== undefined) return explicit;
    // not passed = check resolver
    const defaultId = resolver?.getDefaultSubaccountId();
    return defaultId ?? undefined;
}

export function resolveSubaccountScopedInput<TInput extends object>(
    input: TInput & { subaccountId?: string },
    resolver?: SubaccountResolver,
): TInput & { subaccountId?: string } {
    return {
        ...input,
        subaccountId: resolveSubaccountId(input.subaccountId, resolver),
    };
}
