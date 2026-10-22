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
    ClaimDailyRewardInputSchema,
    ClaimDailyRewardResultSchema,
    DailyClaimStatusSchema,
    type ClaimDailyRewardInput,
    type ClaimDailyRewardResult,
    type DailyClaimStatus,
} from "./claims.schemas.js";

/**
 * Reads and claims daily campaign rewards for the authenticated root account or a subaccount it owns.
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

    /**
     * Claims the current UTC day's reward, paid to the root account or to `subaccountId` when it
     * names a subaccount the root account owns. The destination is fixed by the first claim of the
     * day; retrying returns the same claim and destination.
     */
    async claimDailyReward(
        input: ClaimDailyRewardInput = {},
        options?: PolyesterMutationOptions,
    ): Promise<ClaimDailyRewardResult> {
        const { subaccountId } = parse(ClaimDailyRewardInputSchema, input);
        const response = await this.#client.claimDailyReward(
            { subaccountId },
            toConnectCallOptions(options),
        );
        return parse(ClaimDailyRewardResultSchema, response);
    }
}
