import { createClient, type Client, type Transport } from "@connectrpc/connect";
import * as Proto from "../../../gen/auth/v1/profile_pb.js";
import { z } from "zod";
import { removeUndefined } from "../../../utils/remove-undefined.js";
import {
	AccountIdentitySchema,
	ProfileSchema,
	UpdateProfileInputSchema,
	UsernameHistoryEntrySchema,
	type AccountIdentity,
	type Profile,
	type UsernameHistoryEntry,
} from "./profile.schemas.js";
import type { BaseSubscribeInput } from "../../../shared/types.js";
import { connectProtoChannel } from "../../../realtime/index.js";

interface SubscribeIdentityInput extends BaseSubscribeInput<AccountIdentity> {}

export class ProfileService {
	#client: Client<typeof Proto.ProfileService>;

	constructor(transport: Transport) {
		this.#client = createClient(Proto.ProfileService, transport);
	}

	async get(): Promise<Profile> {
		const res = await this.#client.getProfile({});
		if (!res) throw new Error("Profile not found");
		return ProfileSchema.parse(res);
	}

	async update(input: z.input<typeof UpdateProfileInputSchema>): Promise<Profile> {
		const validatedInput = UpdateProfileInputSchema.parse(input);
		const res = await this.#client.updateProfile(removeUndefined(validatedInput));
		return ProfileSchema.parse(res);
	}

	async getUsernameHistory(): Promise<UsernameHistoryEntry[]> {
		const res = await this.#client.getUsernameHistory({});
		return z.array(UsernameHistoryEntrySchema).parse(res.history);
	}

	subscribeIdentity(input: SubscribeIdentityInput): () => void {
		const channel = "public:identity:updates:proto";
		return connectProtoChannel({
			channel,
			schema: Proto.AccountIdentitySchema,
			onPublication: (data) => {
				const identity = AccountIdentitySchema.parse(data);
				input.onEvent(identity);
			},
			onConnected: () => input.onOpen?.(),
			onDisconnected: () => input.onClose?.(),
			onError: (ctx) => input.onError?.(ctx),
		});
	}
}
