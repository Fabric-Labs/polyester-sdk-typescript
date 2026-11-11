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
    AutoWithdrawPreviewSchema,
    AutoWithdrawRuleSchema,
    AutoWithdrawScopedInputSchema,
    ListAutoWithdrawRunsInputSchema,
    ListAutoWithdrawRunsResultSchema,
    SetAutoWithdrawRuleEnabledInputSchema,
    SetAutoWithdrawRuleInputSchema,
    type AutoWithdrawPreview,
    type AutoWithdrawRule,
    type AutoWithdrawScopedInput,
    type ListAutoWithdrawRunsInput,
    type ListAutoWithdrawRunsResult,
    type SetAutoWithdrawRuleEnabledInput,
    type SetAutoWithdrawRuleInput,
} from "./auto-withdraw.schemas.js";

/**
 * A stale `expectedVersion` comes back as the withdraw `VERSION_CONFLICT` detail (older
 * servers send `CONFLICT`), or as a bare
 * `Aborted`, which the transport would otherwise surface as a retryable `TransientError`.
 * Either one becomes a `RevisionConflictError`: refetch the rule, don't retry blindly.
 */
function rethrowVersionConflict(err: unknown): never {
    const mapped = toPolyesterError(err);
    if (
        mapped instanceof PolyesterError &&
        !(mapped instanceof RevisionConflictError) &&
        ((mapped.detail?.service === "withdraw" &&
            (mapped.detail.code === "VERSION_CONFLICT" || mapped.detail.code === "CONFLICT")) ||
            (mapped.cause instanceof ConnectError &&
                mapped.cause.code === Code.Aborted &&
                mapped.cause.details.length === 0))
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
 * `SessionElevationRequiredError`; check `isFreshStepUpRequiredError` before retrying with a new
 * token.
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
     * Pauses (`enabled: false`) or resumes (`enabled: true`) the account's rule, keeping its
     * schedule and destinations, and returns the latest version: a new one, or the current one
     * unchanged when the rule is already in that state. Each change creates a version, so pass
     * the latest `version` as `expectedVersion`; a stale one throws `RevisionConflictError`.
     * Pausing needs no step-up. Resuming needs a fresh `stepUpToken`, checks every destination
     * again like `setRule`, and clears a pause the rule set itself; a refused destination
     * leaves the rule paused.
     */
    async setRuleEnabled(
        input: SetAutoWithdrawRuleEnabledInput,
        options?: PolyesterMutationOptions,
    ): Promise<AutoWithdrawRule> {
        const request = parse(SetAutoWithdrawRuleEnabledInputSchema, this.resolveInput(input));
        const response = await this.#client
            .setAutoWithdrawRuleEnabled(removeUndefined(request), toConnectCallOptions(options))
            .catch(rethrowVersionConflict);
        return parse(AutoWithdrawRuleSchema, response.rule);
    }

    /**
     * Previews what the account's next run would pay, using the same planning as the run and
     * the balances, prices and fees now. Readable by API keys with `read-auto-withdraw`. With a
     * USD minimum, a failed price read throws a retryable error.
     */
    async previewRun(
        input: AutoWithdrawScopedInput = {},
        options?: PolyesterRequestOptions,
    ): Promise<AutoWithdrawPreview> {
        const request = parse(AutoWithdrawScopedInputSchema, this.resolveInput(input));
        const response = await this.#client.previewAutoWithdrawRun(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return parse(AutoWithdrawPreviewSchema, response);
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
