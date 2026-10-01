import { createClient, type Client } from "@connectrpc/connect";
import * as Proto from "../../gen/rewards/v1/rewards_pb.js";
import {
    toConnectCallOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import type { AuthApiTransports } from "../../shared/transports.js";
import { parse } from "../../shared/validation.js";
import {
    ListMyRewardAwardsInputSchema,
    ListMyRewardAwardsResultSchema,
    type ListMyRewardAwardsInput,
    type ListMyRewardAwardsResult,
} from "./rewards.schemas.js";

/**
 * Reads published reward campaign awards for the authenticated root account.
 * The server accepts session JWTs for this service; API keys are not accepted.
 */
export class RewardsService {
    #client: Client<typeof Proto.RewardCampaignService>;

    constructor(transports: AuthApiTransports) {
        this.#client = createClient(Proto.RewardCampaignService, transports.authApi);
    }

    /**
     * Returns published awards newest first. `limit` is 0 through 100 (0 or omitted uses 50); pass the previous `nextPageToken` as `pageToken` to continue. An empty `nextPageToken` means no more awards.
     */
    async listMyRewardAwards(
        input: ListMyRewardAwardsInput = {},
        options?: PolyesterRequestOptions,
    ): Promise<ListMyRewardAwardsResult> {
        const request = parse(ListMyRewardAwardsInputSchema, input);
        const response = await this.#client.listMyRewardAwards(
            request,
            toConnectCallOptions(options),
        );
        return parse(ListMyRewardAwardsResultSchema, response);
    }
}
