import { Code, ConnectError, createClient, type Client } from "@connectrpc/connect";
import * as Proto from "../../gen/chain/withdraw/v1/auto_withdraw_pb.js";
import type { AccountScopedInput } from "../../shared/account-scope.js";
import { toPolyesterError } from "../../shared/connect-error-mapping.js";
import { PolyesterError, RevisionConflictError } from "../../shared/errors.js";
import {
    toConnectCallOptions,
    type PolyesterMutationOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import type { AuthApiTransports } from "../../shared/transports.js";
import { parse } from "../../shared/validation.js";
import { removeUndefined } from "../../utils/remove-undefined.js";
import { type SubaccountResolver, resolveAccountScopedInput } from "../subaccount-resolver.js";
import {
    AutoWithdrawRuleSchema,
    AutoWithdrawScopedInputSchema,
    DisableAutoWithdrawRuleInputSchema,
    ListAutoWithdrawRunsInputSchema,
    ListAutoWithdrawRunsResultSchema,
    SetAutoWithdrawRuleInputSchema,
    type AutoWithdrawRule,
    type AutoWithdrawScopedInput,
    type DisableAutoWithdrawRuleInput,
    type ListAutoWithdrawRunsInput,
    type ListAutoWithdrawRunsResult,
    type SetAutoWithdrawRuleInput,
} from "./auto-withdraw.schemas.js";

/**
 * A stale `expectedVersion` comes back as the withdraw `CONFLICT` detail, or as a bare
 * `Aborted`, which the transport would otherwise surface as a retryable `TransientError`.
 * Either one becomes a `RevisionConflictError`: refetch the rule, don't retry blindly.
 */
function rethrowVersionConflict(err: unknown): never {
    const mapped = toPolyesterError(err);
    if (
        mapped instanceof PolyesterError &&
        !(mapped instanceof RevisionConflictError) &&
        ((mapped.detail?.service === "withdraw" && mapped.detail.code === "CONFLICT") ||
            (mapped.cause instanceof ConnectError && mapped.cause.code === Code.Aborted))
    ) {
        throw new RevisionConflictError(
            mapped.message || "Auto-withdraw rule changed since it was last read.",
            { cause: mapped.cause, detail: mapped.detail, status: mapped.status },
        );
    }
    throw mapped;
}

/**
 * Manages the scheduled auto-withdraw rule of the root account or a subaccount: each asset's
 * balance is paid in kind on an hourly, daily, weekly, biweekly or monthly UTC slot to
 * destinations on the account's external withdraw whitelist. API keys can read rules and runs;
 * changing a rule needs a session login with withdraw rights and a fresh single-use step-up
 * token (`stepUpToken`). A missing step-up throws `StepUpRequiredError` or
 * `SessionElevationRequiredError`, so `withStepUp` can retry.
 */
export class AutoWithdrawService {
    #client: Client<typeof Proto.AutoWithdrawService>;
    #resolver?: SubaccountResolver;

    constructor(transports: AuthApiTransports, resolver?: SubaccountResolver) {
        this.#client = createClient(Proto.AutoWithdrawService, transports.authApi);
        this.#resolver = resolver;
    }

    /** Returns the account's latest rule version, or null when the account never had a rule. */
    async getRule(
        input: AutoWithdrawScopedInput = {},
        options?: PolyesterRequestOptions,
    ): Promise<AutoWithdrawRule | null> {
        const request = parse(AutoWithdrawScopedInputSchema, this.resolveInput(input));
        const response = await this.#client.getAutoWithdrawRule(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return response.rule ? parse(AutoWithdrawRuleSchema, response.rule) : null;
    }

    /**
     * Creates the account's rule, or replaces its latest version, and returns the new version.
     * `expectedVersion` is 0 when the account has no rule yet, otherwise its latest version; a
     * stale version throws `RevisionConflictError`. Requires a fresh `stepUpToken`.
     */
    async setRule(
        input: SetAutoWithdrawRuleInput,
        options?: PolyesterMutationOptions,
    ): Promise<AutoWithdrawRule> {
        const request = parse(SetAutoWithdrawRuleInputSchema, this.resolveInput(input));
        const response = await this.#client
            .setAutoWithdrawRule(removeUndefined(request), toConnectCallOptions(options))
            .catch(rethrowVersionConflict);
        return parse(AutoWithdrawRuleSchema, response.rule);
    }

    /**
     * Disables the account's rule and returns the disabled version, which has no destinations.
     * A stale `expectedVersion` throws `RevisionConflictError`. Requires a fresh `stepUpToken`.
     */
    async disableRule(
        input: DisableAutoWithdrawRuleInput,
        options?: PolyesterMutationOptions,
    ): Promise<AutoWithdrawRule> {
        const request = parse(DisableAutoWithdrawRuleInputSchema, this.resolveInput(input));
        const response = await this.#client
            .disableAutoWithdrawRule(removeUndefined(request), toConnectCallOptions(options))
            .catch(rethrowVersionConflict);
        return parse(AutoWithdrawRuleSchema, response.rule);
    }

    /**
     * Lists the account's runs with their payouts, newest first. Pass the previous
     * `nextPageToken` as `pageToken` to continue; an empty `nextPageToken` means no more runs.
     */
    async listRuns(
        input: ListAutoWithdrawRunsInput = {},
        options?: PolyesterRequestOptions,
    ): Promise<ListAutoWithdrawRunsResult> {
        const request = parse(ListAutoWithdrawRunsInputSchema, this.resolveInput(input));
        const response = await this.#client.listAutoWithdrawRuns(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return parse(ListAutoWithdrawRunsResultSchema, response);
    }

    private resolveInput<TInput extends AccountScopedInput>(input: TInput): TInput {
        return resolveAccountScopedInput(input, this.#resolver);
    }
}
