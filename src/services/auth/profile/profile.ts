import { createClient, type Client, type Transport } from "@connectrpc/connect";
import * as Proto from "../../../gen/auth/v1/profile_pb.js";
import * as v from "valibot";
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
import type { RealtimeClient } from "../../../realtime/index.js";

interface SubscribeIdentityInput extends BaseSubscribeInput<AccountIdentity> {}

export class ProfileService {
    #client: Client<typeof Proto.ProfileService>;
    #realtime: RealtimeClient;

    constructor(transport: Transport, realtime: RealtimeClient) {
        this.#client = createClient(Proto.ProfileService, transport);
        this.#realtime = realtime;
    }

    async get(): Promise<Profile> {
        const res = await this.#client.getProfile({});
        if (!res) throw new Error("Profile not found");
        return v.parse(ProfileSchema, res);
    }

    async update(input: v.InferInput<typeof UpdateProfileInputSchema>): Promise<Profile> {
        const validatedInput = v.parse(UpdateProfileInputSchema, input);
        const res = await this.#client.updateProfile(removeUndefined(validatedInput));
        return v.parse(ProfileSchema, res);
    }

    async getUsernameHistory(): Promise<UsernameHistoryEntry[]> {
        const res = await this.#client.getUsernameHistory({});
        return v.parse(v.array(UsernameHistoryEntrySchema), res.history);
    }

    subscribeIdentity(input: SubscribeIdentityInput): () => void {
        const channel = "public:identity:updates:proto";
        return this.#realtime.connectProtoChannel({
            channel,
            schema: Proto.AccountIdentitySchema,
            onPublication: (data) => {
                const identity = v.parse(AccountIdentitySchema, data);
                input.onEvent(identity);
            },
            onConnected: () => input.onOpen?.(),
            onDisconnected: () => input.onClose?.(),
            onError: (ctx) => input.onError?.(ctx),
        });
    }
}
