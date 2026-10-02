import { createClient, type Client } from "@connectrpc/connect";
import * as Proto from "../../gen/rewards/v1/rewards_pb.js";
import {
    toConnectCallOptions,
    type PolyesterMutationOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import type { AuthApiTransports } from "../../shared/transports.js";
import { parse } from "../../shared/validation.js";
import {
    ListRewardAwardsInputSchema,
    ListRewardAwardsResultSchema,
    type ListRewardAwardsInput,
    type ListRewardAwardsResult,
    SetRewardDestinationInputSchema,
    SetRewardDestinationResultSchema,
    type SetRewardDestinationInput,
    type SetRewardDestinationResult,
} from "./rewards.schemas.js";

/**
 * Reads published reward campaign awards for the authenticated root account and records payout destinations.
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
    async listAwards(
        input: ListRewardAwardsInput = {},
        options?: PolyesterRequestOptions,
    ): Promise<ListRewardAwardsResult> {
        const request = parse(ListRewardAwardsInputSchema, input);
        const response = await this.#client.listMyRewardAwards(
            request,
            toConnectCallOptions(options),
        );
        return parse(ListRewardAwardsResultSchema, response);
    }

    /**
     * Records a write-once payout destination for an award, interpreted in the award's `network`. Pass the award's `fulfillmentRevision` as `expectedRevision` and reuse the same `requestId` when retrying. Requires a fresh step-up proof via `options.stepUpToken`. This does not execute a transfer or mark the award delivered.
     */
    async setDestination(
        input: SetRewardDestinationInput,
        options?: PolyesterMutationOptions,
    ): Promise<SetRewardDestinationResult> {
        const request = parse(SetRewardDestinationInputSchema, input);
        const response = await this.#client.setMyRewardDestination(
            request,
            toConnectCallOptions(options),
        );
        return parse(SetRewardDestinationResultSchema, response);
    }
}
