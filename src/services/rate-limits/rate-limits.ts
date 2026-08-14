import { createClient, type Client } from "@connectrpc/connect";
import * as Proto from "../../gen/ratelimit/v1/ratelimit_pb.js";
import type { AccountScopedInput } from "../../shared/account-scope.js";
import {
    toConnectCallOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import type { Transports } from "../../shared/transports.js";
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

    constructor(transports: Transports, resolver?: SubaccountResolver) {
        this.#publicClient = createClient(Proto.RateLimitService, transports.publicApi);
        this.#authClient = createClient(Proto.RateLimitService, transports.authApi);
        this.#resolver = resolver;
    }

    /**
     * Returns the complete active placement and cancellation quota catalog for VIP0+.
     */
    async getConfig(options?: PolyesterRequestOptions): Promise<RateLimitConfig> {
        const res = await this.#publicClient.getRateLimitConfig({}, toConnectCallOptions(options));
        return parse(RateLimitConfigSchema, res);
    }

    /**
     * Returns the effective placement and cancellation limits for the resolved account target, including API-key-scoped rules when the caller authenticated with an API key.
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
