import { createClient, type Client } from "@connectrpc/connect";
import * as Proto from "../../../gen/auth/v1/profile_pb.js";
import type { AuthApiTransports } from "../../../shared/transports.js";
import * as v from "valibot";
import { parse } from "../../../shared/validation.js";
import { removeUndefined } from "../../../utils/remove-undefined.js";
import {
    toConnectCallOptions,
    type PolyesterMutationOptions,
    type PolyesterRequestOptions,
} from "../../../shared/request-options.js";
import {
    AccountIdentitySchema,
    ClaimGeneratedUsernameInputSchema,
    GeneratedUsernameOfferSchema,
    ProfileSchema,
    UpdateProfileInputSchema,
    UsernameHistoryEntrySchema,
    type AccountIdentity,
    type GeneratedUsernameOffer,
    type Profile,
    type UsernameHistoryEntry,
} from "./profile.schemas.js";
import type { BaseSubscribeInput } from "../../../shared/types.js";
import type { PolyesterRealtime } from "../../../realtime/index.js";

interface SubscribeIdentityInput extends BaseSubscribeInput<AccountIdentity> {}

/**
 * Manages the authenticated account's public profile and realtime identity updates.
 */
export class ProfileService {
    #client: Client<typeof Proto.ProfileService>;
    #realtime: PolyesterRealtime;

    constructor(transports: AuthApiTransports, realtime: PolyesterRealtime) {
        this.#client = createClient(Proto.ProfileService, transports.authApi);
        this.#realtime = realtime;
    }

    /**
     * Fetches the caller's public profile, including username eligibility/cooldown, verified social handles, avatar, VIP tier, and account creation timestamp.
     */
    async get(options?: PolyesterRequestOptions): Promise<Profile> {
        const res = await this.#client.getProfile({}, toConnectCallOptions(options));
        if (!res) throw new Error("Profile not found");
        return parse(ProfileSchema, res);
    }

    /**
     * Updates only the provided mutable profile fields; omitted fields are unchanged, while present empty strings clear optional text fields such as bio, website, Twitter, and avatar URL.
     */
    async update(
        input: v.InferInput<typeof UpdateProfileInputSchema>,
        options?: PolyesterMutationOptions,
    ): Promise<Profile> {
        const validatedInput = parse(UpdateProfileInputSchema, input);
        const res = await this.#client.updateProfile(
            removeUndefined(validatedInput),
            toConnectCallOptions(options),
        );
        return parse(ProfileSchema, res);
    }

    /**
     * Returns the caller's recent username changes, newest first, capped at 20 entries.
     */
    async getUsernameHistory(options?: PolyesterRequestOptions): Promise<UsernameHistoryEntry[]> {
        const res = await this.#client.getUsernameHistory({}, toConnectCallOptions(options));
        return parse(v.array(UsernameHistoryEntrySchema), res.history);
    }

    /**
     * Returns five generated username options and the short-lived offer token required to claim one of them.
     */
    async generateUsernameOptions(
        options?: PolyesterRequestOptions,
    ): Promise<GeneratedUsernameOffer> {
        const res = await this.#client.generateUsernameOptions({}, toConnectCallOptions(options));
        return parse(GeneratedUsernameOfferSchema, res);
    }

    /**
     * Claims one username from a generated offer by its zero-based option index.
     */
    async claimGeneratedUsername(
        input: v.InferInput<typeof ClaimGeneratedUsernameInputSchema>,
        options?: PolyesterMutationOptions,
    ): Promise<Profile> {
        const validatedInput = parse(ClaimGeneratedUsernameInputSchema, input);
        const res = await this.#client.claimGeneratedUsername(
            validatedInput,
            toConnectCallOptions(options),
        );
        return parse(ProfileSchema, res);
    }

    /**
     * Subscribes to public identity updates and emits normalized account identity records with base58 account IDs, username, avatar URL, and root smart-account address.
     */
    subscribeIdentity(input: SubscribeIdentityInput): () => void {
        const channel = "public:identity:updates:proto";
        return this.#realtime.connectProtoChannel({
            channel,
            schema: Proto.AccountIdentitySchema,
            onPublication: (data) => {
                const identity = parse(AccountIdentitySchema, data);
                input.onEvent(identity);
            },
            onConnected: () => input.onOpen?.(),
            onDisconnected: () => input.onClose?.(),
            onError: input.onError,
        });
    }
}
