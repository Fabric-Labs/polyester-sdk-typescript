import * as v from "valibot";
import { bytesToHex } from "@noble/hashes/utils.js";
import type * as Proto from "../../gen/ai/v1/assistant_pb.js";
import { enumLabel } from "../../shared/proto-enum-codec.js";
import { idInputSchema, optionalSubaccountIdInputSchema } from "../../shared/schemas.js";
import { formatId } from "../../utils/base58-id.js";
import { tsObjToMs } from "../../utils/time.js";
import {
    ASSISTANT_APPROVAL_DECISION_VALUES,
    ApprovalDecisionCodec,
    AssistantKeyStateCodec,
    MemoryKindCodec,
    MessageRoleCodec,
} from "./assistant.codecs.js";

const IdempotencyKeySchema = v.pipe(v.string(), v.trim(), v.minLength(1));

function pageInputEntries(maxLimit: number) {
    return {
        /** Page size; omit for the server default. */
        limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(maxLimit))),
        /** The previous page's `nextPageToken`. */
        pageToken: v.optional(v.pipe(v.string(), v.trim())),
    };
}

const DestinationInputSchema = v.strictObject({
    /** The client's id for the place, e.g. `"page-subaccounts"`: lowercase letters, digits and hyphens. */
    id: v.pipe(
        v.string(),
        v.regex(/^[a-z0-9-]{1,64}$/, "destination id must be 1-64 of a-z, 0-9, -"),
    ),
    /** Its name as the client shows it, 1 to 80 characters. */
    title: v.pipe(v.string(), v.minLength(1), v.maxLength(80)),
    /** What the user does there, at most 200 characters. */
    description: v.optional(v.pipe(v.string(), v.maxLength(200)), ""),
});

export const SendAssistantMessageInputSchema = v.pipe(
    v.strictObject({
        /** Conversation to continue; omit to start a new one. */
        conversationId: v.optional(idInputSchema("conversationId")),
        /** Message text, plain text or Markdown, 1 to 16000 characters. */
        text: v.pipe(v.string(), v.minLength(1), v.maxLength(16_000)),
        /** Client-chosen key, unique per caller. Repeat the request unchanged to resolve an unknown outcome. */
        idempotencyKey: IdempotencyKeySchema,
        /**
         * Trading account the run reads and acts on. Omit to answer without account data: the
         * run then has no account tools.
         */
        subaccountId: optionalSubaccountIdInputSchema(),
        /** Places in the client the run may suggest, at most 100, each id once. */
        destinations: v.optional(
            v.pipe(
                v.array(DestinationInputSchema),
                v.maxLength(100, "At most 100 destinations are allowed."),
                v.check(
                    (items) => new Set(items.map((d) => d.id)).size === items.length,
                    "Destination ids must be distinct.",
                ),
            ),
        ),
    }),
);

export type SendAssistantMessageInput = v.InferInput<typeof SendAssistantMessageInputSchema>;

export const AssistantRunIdInputSchema = v.strictObject({ runId: idInputSchema("runId") });

export type AssistantRunIdInput = v.InferInput<typeof AssistantRunIdInputSchema>;

export const WatchAssistantRunInputSchema = v.pipe(
    v.strictObject({
        runId: idInputSchema("runId"),
        /** Return events after this seq. 0 (default) replays the run; pass the last seq received to resume. */
        afterSeq: v.optional(
            v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(Number.MAX_SAFE_INTEGER)),
            0,
        ),
    }),
    v.transform(({ runId, afterSeq }) => ({ runId, afterSeq: BigInt(afterSeq) })),
);

export type WatchAssistantRunInput = v.InferInput<typeof WatchAssistantRunInputSchema>;

export const DecideAssistantApprovalInputSchema = v.pipe(
    v.strictObject({
        approvalId: idInputSchema("approvalId"),
        decision: v.picklist(ASSISTANT_APPROVAL_DECISION_VALUES),
    }),
    v.transform(({ approvalId, decision }) => ({
        approvalId,
        decision: ApprovalDecisionCodec.inputToProto[decision],
    })),
);

export type DecideAssistantApprovalInput = v.InferInput<typeof DecideAssistantApprovalInputSchema>;

export const ListAssistantConversationsInputSchema = v.strictObject(pageInputEntries(100));

export type ListAssistantConversationsInput = v.InferInput<
    typeof ListAssistantConversationsInputSchema
>;

export const ListAssistantMessagesInputSchema = v.strictObject({
    conversationId: idInputSchema("conversationId"),
    ...pageInputEntries(200),
});

export type ListAssistantMessagesInput = v.InferInput<typeof ListAssistantMessagesInputSchema>;

export const ListAssistantMemoriesInputSchema = v.strictObject(pageInputEntries(200));

export type ListAssistantMemoriesInput = v.InferInput<typeof ListAssistantMemoriesInputSchema>;

export const DeleteAssistantMemoryInputSchema = v.strictObject({
    memoryId: idInputSchema("memoryId"),
});

export type DeleteAssistantMemoryInput = v.InferInput<typeof DeleteAssistantMemoryInputSchema>;

export const PrepareAssistantKeysInputSchema = v.pipe(
    v.strictObject({
        /** 1 to 64 accounts, each once. An entry without `subaccountId` is the main account. */
        accounts: v.pipe(
            v.array(v.strictObject({ subaccountId: optionalSubaccountIdInputSchema() })),
            v.minLength(1, "At least one account is required."),
            v.maxLength(64, "At most 64 accounts are allowed."),
        ),
    }),
    v.check(
        ({ accounts }) =>
            new Set(accounts.map((a) => a.subaccountId ?? 0n)).size === accounts.length,
        "Each account may be named only once.",
    ),
);

export type PrepareAssistantKeysInput = v.InferInput<typeof PrepareAssistantKeysInputSchema>;

export const CompleteAssistantKeysInputSchema = v.strictObject({
    setupId: idInputSchema("setupId"),
});

export type CompleteAssistantKeysInput = v.InferInput<typeof CompleteAssistantKeysInputSchema>;

/* ---------- outputs ---------- */

function optionalId(id: bigint | undefined): string | undefined {
    return id ? formatId(id) : undefined;
}

export function formatConversation(c: Proto.Conversation) {
    return {
        conversationId: formatId(c.conversationId),
        /** Empty until a title is available. */
        title: c.title,
        createdAt: tsObjToMs(c.createdAt),
        updatedAt: tsObjToMs(c.updatedAt),
    };
}

export type AssistantConversation = ReturnType<typeof formatConversation>;

export function formatMessage(m: Proto.Message) {
    return {
        messageId: formatId(m.messageId),
        role: enumLabel(MessageRoleCodec.protoToOutput, m.role),
        /** Markdown. For an assistant message, its run's final text. */
        text: m.text,
        createdAt: tsObjToMs(m.createdAt),
        /** Replay this run with `watchRun` from `afterSeq: 0` to show its tool activity and views. */
        runId: formatId(m.runId),
    };
}

export type AssistantMessage = ReturnType<typeof formatMessage>;

export function formatMemory(m: Proto.Memory) {
    return {
        memoryId: formatId(m.memoryId),
        text: m.text,
        createdAt: tsObjToMs(m.createdAt),
        /** Omitted when the conversation it was learned in is unknown. */
        conversationId: optionalId(m.conversationId),
        kind: enumLabel(MemoryKindCodec.protoToOutput, m.kind),
    };
}

export type AssistantMemory = ReturnType<typeof formatMemory>;

export function formatAssistantKey(k: Proto.AssistantKey) {
    return {
        /** Omitted for the main account. */
        subaccountId: optionalId(k.subaccountId),
        keyId: k.keyId,
        publicKeyEd25519: k.publicKeyEd25519,
        publicKeyHex: bytesToHex(k.publicKeyEd25519),
        state: enumLabel(AssistantKeyStateCodec.protoToOutput, k.state),
    };
}

export type AssistantKey = ReturnType<typeof formatAssistantKey>;

export function formatPreparedAssistantKey(k: Proto.PreparedAssistantKey) {
    return {
        /** Omitted for the main account. */
        subaccountId: optionalId(k.subaccountId),
        publicKeyEd25519: k.publicKeyEd25519,
        publicKeyHex: bytesToHex(k.publicKeyEd25519),
        /** Pass unchanged to `apiKeys.setAssistantKeys`. */
        registrationProof: k.registrationProof,
        /** Epoch ms; pass unchanged to `apiKeys.setAssistantKeys`. */
        registrationDeadline: tsObjToMs(k.registrationDeadline),
    };
}

export type PreparedAssistantKey = ReturnType<typeof formatPreparedAssistantKey>;

export function formatPrepareAssistantKeysResult(r: Proto.PrepareAssistantKeysResponse) {
    return {
        setupId: formatId(r.setupId),
        /** One key per requested account, in request order. */
        keys: r.keys.map(formatPreparedAssistantKey),
        /** Epoch ms after which the keys can no longer be registered. */
        expiresAt: tsObjToMs(r.expiresAt),
    };
}

export type PrepareAssistantKeysResult = ReturnType<typeof formatPrepareAssistantKeysResult>;

/** `nextPageToken` is empty when no more results exist. */
export type ListAssistantConversationsResult = {
    conversations: AssistantConversation[];
    nextPageToken: string;
};
export type ListAssistantMessagesResult = { messages: AssistantMessage[]; nextPageToken: string };
export type ListAssistantMemoriesResult = { memories: AssistantMemory[]; nextPageToken: string };
