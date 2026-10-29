import { createClient, type Client } from "@connectrpc/connect";
import * as Proto from "../../gen/checkpoints/v1/checkpoints_pb.js";
import {
    toConnectCallOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import type { AuthApiTransports } from "../../shared/transports.js";
import { parse } from "../../shared/validation.js";
import {
    ListCheckpointsInputSchema,
    ListCheckpointsResultSchema,
    type Checkpoint,
    type ListCheckpointsInput,
} from "./checkpoints.schemas.js";

/**
 * Reads the signed-in account's frozen testnet season recaps. The server accepts session JWTs
 * for this service; API keys are refused with `PERMISSION_DENIED`.
 */
export class CheckpointsService {
    #client: Client<typeof Proto.CheckpointService>;

    constructor(transports: AuthApiTransports) {
        this.#client = createClient(Proto.CheckpointService, transports.authApi);
    }

    /**
     * Lists every checkpoint of the signed-in root account, newest first, at most one per duration.
     * A checkpoint covers the root account and all of its subaccounts, so `subaccountId` resolves
     * to its root account, which must be the caller's own. An account without checkpoints gets an
     * empty list.
     */
    async list(
        input: ListCheckpointsInput = {},
        options?: PolyesterRequestOptions,
    ): Promise<Checkpoint[]> {
        const { subaccountId } = parse(ListCheckpointsInputSchema, input);
        const response = await this.#client.listMyCheckpoints(
            { subaccountId },
            toConnectCallOptions(options),
        );
        return parse(ListCheckpointsResultSchema, response).checkpoints;
    }
}
