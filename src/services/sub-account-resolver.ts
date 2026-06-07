/**
 * Provides the default subaccount ID based on auth state.
 * When the active account is a subaccount (not main), this returns that ID.
 */
export interface SubAccountResolver {
	getDefaultSubAccountId(): string | null;
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
export function resolveSubAccountId(
	explicit: string | undefined,
	resolver?: SubAccountResolver
): string | undefined {
	// explicit empty string = force main account
	if (explicit === "") return undefined;
	// explicit string = use it
	if (explicit !== undefined) return explicit;
	// not passed = check resolver
	const defaultId = resolver?.getDefaultSubAccountId();
	return defaultId ?? undefined;
}

export function resolveSubAccountScopedInput<TInput extends object>(
	input: TInput & { subAccountId?: string },
	resolver?: SubAccountResolver
): TInput & { subAccountId?: string } {
	return {
		...input,
		subAccountId: resolveSubAccountId(input.subAccountId, resolver),
	};
}
