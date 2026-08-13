import { createClient, type Client, type Transport } from "@connectrpc/connect";
import * as Proto from "../../gen/ratelimit/v1/ratelimit_pb.js";
import { removeUndefined } from "../../utils/remove-undefined.js";
import { type SubaccountResolver, resolveAccountScopedInput } from "../subaccount-resolver.js";
import {
    toConnectCallOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import { parse } from "../../shared/validation.js";
import {
    GetTradingRateLimitsInputSchema,
    RateLimitConfigSchema,
    TradingRateLimitsSchema,
    type GetTradingRateLimitsInput,
    type RateLimitConfig,
    type TradingRateLimits,
} from "./rate-limits.schemas.js";

export interface RateLimitServiceTransports {
    publicApi: Transport;
    authApi: Transport;
}

/**
 * Reads public trading quota catalogs and authenticated effective trading limits.
 */
export class RateLimitService {
    #publicClient: Client<typeof Proto.RateLimitService>;
    #authClient: Client<typeof Proto.RateLimitService>;
    #resolver?: SubaccountResolver;

    constructor(transports: RateLimitServiceTransports, resolver?: SubaccountResolver) {
        this.#publicClient = createClient(Proto.RateLimitService, transports.publicApi);
        this.#authClient = createClient(Proto.RateLimitService, transports.authApi);
        this.#resolver = resolver;
    }

    /**
     * Returns the complete active placement and cancellation quota catalog for VIP0 through VIP10.
     */
    async getConfig(options?: PolyesterRequestOptions): Promise<RateLimitConfig> {
        const res = await this.#publicClient.getRateLimitConfig({}, toConnectCallOptions(options));
        return parse(RateLimitConfigSchema, res);
    }

    /**
     * Returns the effective placement and cancellation limits for the resolved account target, including API-key-scoped rules when the caller authenticated with an API key.
     */
    async getTradingLimits(
        input: GetTradingRateLimitsInput = {},
        options?: PolyesterRequestOptions,
    ): Promise<TradingRateLimits> {
        const resolvedInput = resolveAccountScopedInput(input, this.#resolver);
        const validatedInput = parse(GetTradingRateLimitsInputSchema, resolvedInput);
        const res = await this.#authClient.getTradingRateLimits(
            removeUndefined(validatedInput),
            toConnectCallOptions(options),
        );
        return parse(TradingRateLimitsSchema, res);
    }
}
