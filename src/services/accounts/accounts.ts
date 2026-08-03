import { createClient, type Client, type Transport } from "@connectrpc/connect";
import * as ProtoResolve from "../../gen/auth/v1/resolve_pb.js";
import * as v from "valibot";
import {
    toConnectCallOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import {
    ResolveAccountInputSchema,
    ResolvedAccountArraySchema,
    type ResolveAccountInput,
    type ResolvedAccount,
} from "./accounts.schemas.js";

/**
 * Resolves user-entered account identifiers into transfer/shareable root or subaccount destinations.
 */
export class AccountsService {
    #client: Client<typeof ProtoResolve.ResolveService>;

    constructor(transport: Transport) {
        this.#client = createClient(ProtoResolve.ResolveService, transport);
    }

    /**
     * Resolves a username, opaque account/subaccount ID, or smart-account address into matching destination accounts; set includeSubaccounts for internal-transfer flows that may target subaccounts.
     */
    async resolve(
        input: ResolveAccountInput,
        options?: PolyesterRequestOptions,
    ): Promise<ResolvedAccount[]> {
        const validatedInput = v.parse(ResolveAccountInputSchema, input);
        const res = await this.#client.resolveAccount(
            validatedInput,
            toConnectCallOptions(options),
        );

        return v.parse(ResolvedAccountArraySchema, res.matches);
    }
}
