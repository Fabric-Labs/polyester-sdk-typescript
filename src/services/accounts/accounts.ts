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

export class AccountsService {
    #client: Client<typeof ProtoResolve.ResolveService>;

    constructor(transport: Transport) {
        this.#client = createClient(ProtoResolve.ResolveService, transport);
    }

    async resolve(
        query: string,
        options?: ResolveAccountInput,
        requestOptions?: PolyesterRequestOptions,
    ): Promise<ResolvedAccount[]> {
        const validatedOptions = v.parse(ResolveAccountInputSchema, options);
        const res = await this.#client.resolveAccount(
            {
                query,
                ...validatedOptions,
            },
            toConnectCallOptions(requestOptions),
        );

        return v.parse(ResolvedAccountArraySchema, res.matches);
    }
}
