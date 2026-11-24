import { createClient, type Client } from "@connectrpc/connect";
import * as Proto from "../../gen/ai/v1/assistant_pb.js";
import type { SdkScales } from "../../shared/decimal-surface.js";
import { enumLabel } from "../../shared/proto-enum-codec.js";
import {
    toConnectCallOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import type { AuthApiTransports } from "../../shared/transports.js";
import { parse } from "../../shared/validation.js";
import { formatId } from "../../utils/base58-id.js";
import { removeUndefined } from "../../utils/remove-undefined.js";
import { formatRunEvent, type AssistantRunEvent } from "./assistant-events.schemas.js";
import { ApprovalStatusCodec, type AssistantApprovalStatus } from "./assistant.codecs.js";
import {
    AssistantRunIdInputSchema,
    CompleteAssistantKeysInputSchema,
    DecideAssistantApprovalInputSchema,
    DeleteAssistantMemoryInputSchema,
    formatAssistantKey,
    formatAssistantUsage,
    formatConversation,
    formatMemory,
    formatConversationAccount,
    formatMessage,
    formatModelKey,
    formatSubject,
    formatPrepareAssistantKeysResult,
    formatTelegramApprovalLimits,
    GetAssistantMessageImageInputSchema,
    ListAssistantConversationsInputSchema,
    ListAssistantMemoriesInputSchema,
    ListAssistantMessagesInputSchema,
    PrepareAssistantKeysInputSchema,
    SendAssistantMessageInputSchema,
    SetAssistantModelKeyInputSchema,
    SetTelegramApprovalLimitsInputSchema,
    WatchAssistantRunInputSchema,
    type AssistantKey,
    type AssistantModelKey,
    type AssistantUsage,
    type GetAssistantMessageImageInput,
    type AssistantRunIdInput,
    type CompleteAssistantKeysInput,
    ListAssistantKeysInputSchema,
    type ListAssistantKeysInput,
    type DecideAssistantApprovalInput,
    type DeleteAssistantMemoryInput,
    type ListAssistantConversationsInput,
    type ListAssistantConversationsResult,
    type ListAssistantMemoriesInput,
    type ListAssistantMemoriesResult,
    type ListAssistantMessagesInput,
    type ListAssistantMessagesResult,
    type PrepareAssistantKeysInput,
    type PrepareAssistantKeysResult,
    type SendAssistantMessageInput,
    type SetAssistantModelKeyInput,
    type SetTelegramApprovalLimitsInput,
    type TelegramApprovalLimits,
    type WatchAssistantRunInput,
} from "./assistant.schemas.js";

/**
 * The Polyester trading assistant. `sendMessage` starts a run that answers the message;
 * follow it with `watchRun`. A run continues on the server when nobody watches it. Actions that
 * change the account wait for `decideApproval`. Needs a session login; every conversation, run,
 * approval and memory belongs to the signed-in user. Errors carry
 * `detail: { service: "assistant", code }`.
 */
export class AssistantService {
    #client: Client<typeof Proto.AssistantService>;
    #scales: SdkScales;

    constructor(transports: AuthApiTransports, scales: SdkScales) {
        this.#client = createClient(Proto.AssistantService, transports.authApi);
        this.#scales = scales;
    }

    /**
     * Records the message and starts a run that answers it; returns once the run is recorded.
     * Idempotent per `idempotencyKey`: repeat the request unchanged to resolve an unknown
     * outcome. A conversation runs one run at a time (`RUN_ACTIVE`). With
     * `expectedLatestRunId`, a conversation that moved on fails with `CONVERSATION_ADVANCED`,
     * a final answer: do not retry it.
     */
    async sendMessage(
        input: SendAssistantMessageInput,
        options?: PolyesterRequestOptions,
    ): Promise<{ runId: string; conversationId: string }> {
        const request = parse(SendAssistantMessageInputSchema, input);
        const response = await this.#client.sendMessage(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return {
            runId: formatId(response.runId),
            conversationId: formatId(response.conversationId),
        };
    }

    /**
     * Streams a run's events in `seq` order: the recorded events after `afterSeq`, then new ones
     * as they are recorded. Ends after `run_completed` or `run_failed`; watching an ended run
     * replays it. The server may end the stream early: call again with the last `seq` received
     * as `afterSeq` to continue without gaps or repeats. Abort with `options.signal`.
     */
    async *watchRun(
        input: WatchAssistantRunInput,
        options?: PolyesterRequestOptions,
    ): AsyncGenerator<AssistantRunEvent, void, undefined> {
        const request = parse(WatchAssistantRunInputSchema, input);
        await this.#scales.ready();
        for await (const response of this.#client.watchRun(
            request,
            toConnectCallOptions(options),
        )) {
            if (response.event) yield formatRunEvent(response.event, this.#scales);
        }
    }

    /**
     * Asks an active run to stop; it then ends with `run_failed` category `canceled`.
     * Canceling an ended run succeeds and changes nothing.
     */
    async cancelRun(input: AssistantRunIdInput, options?: PolyesterRequestOptions): Promise<void> {
        const request = parse(AssistantRunIdInputSchema, input);
        await this.#client.cancelRun(request, toConnectCallOptions(options));
    }

    /**
     * Approves or rejects a pending approval from an `approval_requested` event. An approved
     * action runs exactly as its summary says, at most once. Repeating the same decision returns
     * the recorded status.
     */
    async decideApproval(
        input: DecideAssistantApprovalInput,
        options?: PolyesterRequestOptions,
    ): Promise<AssistantApprovalStatus | "unspecified"> {
        const request = parse(DecideAssistantApprovalInputSchema, input);
        const response = await this.#client.decideApproval(request, toConnectCallOptions(options));
        return enumLabel(ApprovalStatusCodec.protoToOutput, response.status);
    }

    /** Returns one image of the caller's messages, from `AssistantMessage.images`. */
    async getMessageImage(
        input: GetAssistantMessageImageInput,
        options?: PolyesterRequestOptions,
    ): Promise<{ data: Uint8Array; mimeType: string }> {
        const request = parse(GetAssistantMessageImageInputSchema, input);
        const { data, mimeType } = await this.#client.getMessageImage(
            request,
            toConnectCallOptions(options),
        );
        return { data, mimeType };
    }

    /** Lists the caller's conversations, most recently updated first. */
    async listConversations(
        input: ListAssistantConversationsInput = {},
        options?: PolyesterRequestOptions,
    ): Promise<ListAssistantConversationsResult> {
        const request = parse(ListAssistantConversationsInputSchema, input);
        const response = await this.#client.listConversations(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return {
            conversations: response.conversations.map(formatConversation),
            nextPageToken: response.nextPageToken,
        };
    }

    /** Lists one conversation's messages, newest first. */
    async listMessages(
        input: ListAssistantMessagesInput,
        options?: PolyesterRequestOptions,
    ): Promise<ListAssistantMessagesResult> {
        const request = parse(ListAssistantMessagesInputSchema, input);
        const response = await this.#client.listMessages(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return {
            messages: response.messages.map(formatMessage),
            nextPageToken: response.nextPageToken,
            lastAccount: formatConversationAccount(response.lastAccount),
            subject: formatSubject(response.subject),
        };
    }

    /**
     * Lists what the assistant remembers about the caller, newest first. A `profile` memory
     * applies to every answer; the others are used when relevant.
     */
    async listMemories(
        input: ListAssistantMemoriesInput = {},
        options?: PolyesterRequestOptions,
    ): Promise<ListAssistantMemoriesResult> {
        const request = parse(ListAssistantMemoriesInputSchema, input);
        const response = await this.#client.listMemories(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return {
            memories: response.memories.map(formatMemory),
            nextPageToken: response.nextPageToken,
        };
    }

    /** Makes the assistant forget one memory. Deleting a deleted memory succeeds. */
    async deleteMemory(
        input: DeleteAssistantMemoryInput,
        options?: PolyesterRequestOptions,
    ): Promise<void> {
        const request = parse(DeleteAssistantMemoryInputSchema, input);
        await this.#client.deleteMemory(request, toConnectCallOptions(options));
    }

    /**
     * Step 1 of giving the assistant keys: the assistant generates one Ed25519 key pair per
     * account and returns the public keys with their registration proofs. Register them with
     * `apiKeys.setAssistantKeys` (with a fresh `stepUpToken`) before `expiresAt`, then call
     * `completeKeys`. The step-up token goes to `setAssistantKeys` only, never to the assistant.
     */
    async prepareKeys(
        input: PrepareAssistantKeysInput,
        options?: PolyesterRequestOptions,
    ): Promise<PrepareAssistantKeysResult> {
        const request = parse(PrepareAssistantKeysInputSchema, input);
        const response = await this.#client.prepareAssistantKeys(
            { accounts: request.accounts.map((account) => removeUndefined(account)) },
            toConnectCallOptions(options),
        );
        return formatPrepareAssistantKeysResult(response);
    }

    /**
     * Finishes a key setup once `apiKeys.setAssistantKeys` registered its keys; returns the keys
     * the assistant now holds. Completing a completed setup returns the keys again.
     */
    async completeKeys(
        input: CompleteAssistantKeysInput,
        options?: PolyesterRequestOptions,
    ): Promise<AssistantKey[]> {
        const request = parse(CompleteAssistantKeysInputSchema, input);
        const response = await this.#client.completeAssistantKeys(
            request,
            toConnectCallOptions(options),
        );
        return response.keys.map(formatAssistantKey);
    }

    /**
     * Lists the keys the assistant holds, at most one per account. An account without one has
     * no account tools. Pass `view: "full"` for each key's account name as `label`. Revoke them
     * with `apiKeys.deleteAssistantKeys`.
     */
    async listKeys(
        input: ListAssistantKeysInput = {},
        options?: PolyesterRequestOptions,
    ): Promise<AssistantKey[]> {
        const request = parse(ListAssistantKeysInputSchema, input);
        const response = await this.#client.listAssistantKeys(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return response.keys.map(formatAssistantKey);
    }

    /**
     * Saves the caller's own OpenAI API key, replacing any earlier one, once OpenAI accepts it
     * (else `MODEL_KEY_REJECTED`, `MODEL_KEY_NO_QUOTA` or `MODEL_KEY_MODEL_UNAVAILABLE`, and
     * nothing is saved). Messages sent after it use the key instead of credits; a run whose key
     * OpenAI refuses fails with `model_key_refused`. Only a signed-in session sets it.
     */
    async setModelKey(
        input: SetAssistantModelKeyInput,
        options?: PolyesterRequestOptions,
    ): Promise<AssistantModelKey> {
        const request = parse(SetAssistantModelKeyInputSchema, input);
        const response = await this.#client.setModelKey(request, toConnectCallOptions(options));
        return formatModelKey(response.key);
    }

    /** Returns the caller's own OpenAI API key's status, or `null` when they have none. */
    async getModelKey(options?: PolyesterRequestOptions): Promise<AssistantModelKey | null> {
        const response = await this.#client.getModelKey({}, toConnectCallOptions(options));
        return response.key ? formatModelKey(response.key) : null;
    }

    /**
     * Deletes the caller's own OpenAI API key; later messages use credits again. Runs already
     * started on it never switch. Deleting when there is no key succeeds.
     */
    async deleteModelKey(options?: PolyesterRequestOptions): Promise<void> {
        await this.#client.deleteModelKey({}, toConnectCallOptions(options));
    }

    /**
     * Returns the caller's assistant credits today: the VIP tier's free daily credits, how many
     * are used and left, when they reset, what pays for the next messages, and the next tier's
     * free credits. With none left on `credits`, runs fail with `daily_limit_reached`.
     */
    async getUsage(options?: PolyesterRequestOptions): Promise<AssistantUsage> {
        return formatAssistantUsage(await this.#client.getUsage({}, toConnectCallOptions(options)));
    }

    /**
     * Returns the caller's limits on what they may approve from Telegram, in US dollars of
     * notional value, and the value approved from Telegram in the last 24 hours while a limit
     * was set. Limits apply to placing, swapping, modifying and resuming; canceling, pausing
     * and rejecting are never limited.
     */
    async getTelegramApprovalLimits(
        options?: PolyesterRequestOptions,
    ): Promise<TelegramApprovalLimits & { approvedLast24hUsd: string }> {
        const response = await this.#client.getTelegramApprovalLimits(
            {},
            toConnectCallOptions(options),
        );
        return {
            ...formatTelegramApprovalLimits(response.limits),
            approvedLast24hUsd: response.approvedLast24hUsd,
        };
    }

    /**
     * Replaces both Telegram approval limits: a limit left out is turned off. Only a signed-in
     * session sets them; they apply to the next approval from Telegram. Returns the limits as
     * recorded.
     */
    async setTelegramApprovalLimits(
        input: SetTelegramApprovalLimitsInput,
        options?: PolyesterRequestOptions,
    ): Promise<TelegramApprovalLimits> {
        const limits = parse(SetTelegramApprovalLimitsInputSchema, input);
        const response = await this.#client.setTelegramApprovalLimits(
            { limits: removeUndefined(limits) },
            toConnectCallOptions(options),
        );
        return formatTelegramApprovalLimits(response.limits);
    }
}
