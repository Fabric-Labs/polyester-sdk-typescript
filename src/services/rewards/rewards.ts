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
    AcknowledgeRewardAwardInputSchema,
    AcknowledgeRewardAwardResultSchema,
    type AcknowledgeRewardAwardInput,
    type AcknowledgeRewardAwardResult,
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
 * Reads published reward campaign awards for the authenticated root account, records payout
 * destinations, and acknowledges seen awards. Every call accepts a session JWT. `listAwards` also
 * accepts an API key scoped to the main account whose policy grants `read-rewards`.
 */
export class RewardsService {
    #client: Client<typeof Proto.RewardCampaignService>;

    constructor(transports: AuthApiTransports) {
        this.#client = createClient(Proto.RewardCampaignService, transports.authApi);
    }

    /**
     * Returns published awards newest first. `limit` is 0 through 100 (0 or omitted uses 50); pass the previous `nextPageToken` as `pageToken` to continue. An empty `nextPageToken` means no more awards. When `awardsMayChange` is false, polling cannot surface new awards or changes until a new campaign is created.
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

    /**
     * Records that the recipient revealed an award (`revealed: true`) or saw a paid award's
     * delivery (`deliverySeen: true`), so other sessions and devices do not show the dialog again.
     * Set at least one. Marks are independent, permanent and idempotent: the first timestamp is
     * kept, `false` leaves a mark unchanged, and a failed call can be retried as is. `deliverySeen`
     * on an award that is not paid fails the whole call with `PreconditionFailedError`. Returns the
     * current award with its marks; fulfillment state and revision are unchanged. Session JWT only.
     */
    async acknowledgeAward(
        input: AcknowledgeRewardAwardInput,
        options?: PolyesterRequestOptions,
    ): Promise<AcknowledgeRewardAwardResult> {
        const request = parse(AcknowledgeRewardAwardInputSchema, input);
        const response = await this.#client.acknowledgeMyRewardAward(
            request,
            toConnectCallOptions(options),
        );
        return parse(AcknowledgeRewardAwardResultSchema, response);
    }
}
