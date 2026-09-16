import { createClient, type Client } from "@connectrpc/connect";
import * as Proto from "../../gen/claims/v1/claims_pb.js";
import {
    toConnectCallOptions,
    type PolyesterMutationOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import type { AuthApiTransports } from "../../shared/transports.js";
import { parse } from "../../shared/validation.js";
import {
    ClaimDailyRewardResultSchema,
    DailyClaimStatusSchema,
    type ClaimDailyRewardResult,
    type DailyClaimStatus,
} from "./claims.schemas.js";

/**
 * Reads and claims daily campaign rewards for the authenticated root account.
 * The server accepts session JWTs for this service; API keys are not accepted.
 */
export class ClaimsService {
    #client: Client<typeof Proto.ClaimsService>;

    constructor(transports: AuthApiTransports) {
        this.#client = createClient(Proto.ClaimsService, transports.authApi);
    }

    /** Returns the current UTC day's available or existing claim and its reset time. */
    async getDailyClaimStatus(options?: PolyesterRequestOptions): Promise<DailyClaimStatus> {
        const response = await this.#client.getDailyClaimStatus({}, toConnectCallOptions(options));
        return parse(DailyClaimStatusSchema, response);
    }

    /** Claims the current UTC day's reward. Retrying returns the same claim. */
    async claimDailyReward(options?: PolyesterMutationOptions): Promise<ClaimDailyRewardResult> {
        const response = await this.#client.claimDailyReward({}, toConnectCallOptions(options));
        return parse(ClaimDailyRewardResultSchema, response);
    }
}
