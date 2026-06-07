import { createClient, type Client, type Transport } from "@connectrpc/connect";
import * as ProtoResolve from "../../gen/auth/v1/resolve_pb.js";
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

	async resolve(query: string, options?: ResolveAccountInput): Promise<ResolvedAccount[]> {
		const validatedOptions = ResolveAccountInputSchema.parse(options);
		const res = await this.#client.resolveAccount({
			query,
			...validatedOptions,
		});

		return ResolvedAccountArraySchema.parse(res.matches);
	}
}
