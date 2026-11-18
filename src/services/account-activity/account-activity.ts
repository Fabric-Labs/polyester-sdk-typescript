import { createClient, type Client } from "@connectrpc/connect";
import * as Proto from "../../gen/auth/v1/activity_pb.js";
import {
    toConnectCallOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import type { AuthApiTransports } from "../../shared/transports.js";
import { parse } from "../../shared/validation.js";
import { removeUndefined } from "../../utils/remove-undefined.js";
import {
    ListAccountActivityInputSchema,
    ListAccountActivityResultSchema,
    type ListAccountActivityInput,
    type ListAccountActivityResult,
} from "./account-activity.schemas.js";

/**
 * Reads the security and activity events of the caller's main account and its sub-accounts in
 * one feed: sign-ins, API key, MFA, policy, member, invite and saved-destination changes.
 */
export class AccountActivityService {
    #client: Client<typeof Proto.AccountActivityService>;

    constructor(transports: AuthApiTransports) {
        this.#client = createClient(Proto.AccountActivityService, transports.authApi);
    }

    /**
     * Lists events newest first. Only the main account's own session or an API key with
     * `read-account-activity` may call it; a key scoped to a sub-account reads only that
     * sub-account's events and may not set `includeMainAccount`. A sub-account the caller may
     * not read throws `ResourceNotFoundError`.
     */
    async list(
        input: ListAccountActivityInput = {},
        options?: PolyesterRequestOptions,
    ): Promise<ListAccountActivityResult> {
        const request = parse(ListAccountActivityInputSchema, input);
        const response = await this.#client.listAccountActivity(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return parse(ListAccountActivityResultSchema, response);
    }
}
