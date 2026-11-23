import { createClient, type Client } from "@connectrpc/connect";
import * as Proto from "../../gen/ratelimit/v1/ratelimit_pb.js";
import type { AccountScopedInput } from "../../shared/account-scope.js";
import {
    toConnectCallOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import type { AuthAndPublicApiTransports } from "../../shared/transports.js";
import { parse } from "../../shared/validation.js";
import { removeUndefined } from "../../utils/remove-undefined.js";
import { type SubaccountResolver, resolveAccountScopedInput } from "../subaccount-resolver.js";
import {
    GetTradingRateLimitsInputSchema,
    RateLimitConfigSchema,
    TradingRateLimitsSchema,
    type RateLimitConfig,
    type TradingRateLimits,
} from "./rate-limits.schemas.js";

/**
 * Reads public trading quota catalogs and authenticated effective trading limits.
 */
export class RateLimitService {
    #publicClient: Client<typeof Proto.RateLimitService>;
    #authClient: Client<typeof Proto.RateLimitService>;
    #resolver?: SubaccountResolver;

    constructor(transports: AuthAndPublicApiTransports, resolver?: SubaccountResolver) {
        this.#publicClient = createClient(Proto.RateLimitService, transports.publicApi);
        this.#authClient = createClient(Proto.RateLimitService, transports.authApi);
        this.#resolver = resolver;
    }

    /**
     * Returns the complete active placement, cancellation and read quota catalog for VIP0+.
     */
    async getConfig(options?: PolyesterRequestOptions): Promise<RateLimitConfig> {
        const res = await this.#publicClient.getRateLimitConfig({}, toConnectCallOptions(options));
        return parse(RateLimitConfigSchema, res);
    }

    /**
     * Returns the placement, cancellation and read limits enforced for the resolved account.
     * Account `rules` apply per account: every API key and session that trades or reads for it
     * shares them, so more API keys add no capacity. `apiKeyRules`, present for an API-key
     * caller, include the calling key's enforced per-key read rule (a read or preview is refused
     * when either the account or API-key read limit is exhausted); its placement and
     * cancellation rules are informational only.
     */
    async getTradingLimits(
        input: AccountScopedInput = {},
        options?: PolyesterRequestOptions,
    ): Promise<TradingRateLimits> {
        const resolvedInput = resolveAccountScopedInput(input, this.#resolver);
        const res = await this.#authClient.getTradingRateLimits(
            removeUndefined(parse(GetTradingRateLimitsInputSchema, resolvedInput)),
            toConnectCallOptions(options),
        );
        return parse(TradingRateLimitsSchema, res);
    }
}
