import * as v from "valibot";
import { bytesToHex } from "@noble/hashes/utils.js";
import type * as Proto from "../../gen/ai/v1/assistant_pb.js";
import { AccountSelection } from "../../gen/ai/v1/assistant_pb.js";
import { enumLabel } from "../../shared/proto-enum-codec.js";
import { idInputSchema, optionalSubaccountIdInputSchema } from "../../shared/schemas.js";
import { formatId } from "../../utils/base58-id.js";
import { tsObjToMs } from "../../utils/time.js";
import {
    ASSISTANT_ACCOUNT_SELECTION_VALUES,
    ASSISTANT_KEY_VIEW_VALUES,
    AccountSelectionCodec,
    AssistantKeyViewCodec,
    ASSISTANT_APPROVAL_DECISION_VALUES,
    ASSISTANT_DISPLAY_SETTING_VALUES,
    ApprovalDecisionCodec,
    AssistantKeyStateCodec,
    DisplaySettingCodec,
    FundingModeCodec,
    MemoryKindCodec,
    MessageRoleCodec,
    ModelKeyCheckCodec,
} from "./assistant.codecs.js";

// sent unchanged: trimming would fold " k " and "k" into the same key.
const IdempotencyKeySchema = v.pipe(v.string(), v.minLength(1));

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

/**
 * The page the user is on, named by its template and title, never by its address: never send the
 * URL, its query or fragment, or any id or symbol taken from the path.
 */
const CurrentPageInputSchema = v.strictObject({
    /** The page's `destinations` id, when it is one of them. */
    destinationId: v.optional(
        v.pipe(
            v.string(),
            v.regex(/^[a-z0-9-]{1,64}$/, "destinationId must be 1-64 of a-z, 0-9, -"),
        ),
    ),
    /** Route template with bracketed parameters, e.g. `"/account/settings/[section]"`. */
    route: v.pipe(
        v.string(),
        v.regex(
            /^\/[A-Za-z0-9/\-_.[\]]{0,199}$/,
            "route must start with / and use at most 200 of A-Z, a-z, 0-9, /, -, _, ., [, ]",
        ),
    ),
    /** The page's title as the client shows it, 1 to 80 characters; never the user's own data. */
    title: v.pipe(v.string(), v.minLength(1), v.maxLength(80)),
});

/**
 * What a conversation is about: one of the caller's strategies. There is at most one conversation
 * per subject, fixed when it starts.
 */
const AssistantSubjectInputSchema = v.pipe(
    v.strictObject({ strategyId: idInputSchema("strategyId") }),
    v.transform((subject) => ({ kind: { case: "strategy" as const, value: subject } })),
);

export const SendAssistantMessageInputSchema = v.pipe(
    v.strictObject({
        /** Conversation to continue; omit to start a new one. */
        conversationId: v.optional(idInputSchema("conversationId")),
        /**
         * Continues the conversation about this subject, or starts it; omit `conversationId`. With
         * `conversationId`, any other subject fails with `CONVERSATION_SUBJECT_MISMATCH`.
         */
        subject: v.optional(AssistantSubjectInputSchema),
        /**
         * Message text, plain text or Markdown, at most 16000 characters. Required unless
         * `images` are attached; with images, it is the question about them.
         */
        text: v.optional(v.pipe(v.string(), v.maxLength(16_000))),
        /**
         * Images the message shows the assistant, such as a screenshot, in the order the user
         * attached them: PNG, JPEG or WebP, at most 4, each at most 10 MiB. Covered by
         * `idempotencyKey`.
         */
        images: v.optional(
            v.array(
                v.strictObject({
                    data: v.instance(Uint8Array),
                    /** `"image/png"`, `"image/jpeg"` or `"image/webp"`, matching `data`. */
                    mimeType: v.string(),
                }),
            ),
        ),
        /**
         * Send only while this run is still the conversation's latest, e.g. the run of the
         * answer a follow-up button sits under; otherwise nothing is recorded and the call fails
         * with `CONVERSATION_ADVANCED`. Needs `conversationId`. Covered by `idempotencyKey`.
         */
        expectedLatestRunId: v.optional(idInputSchema("expectedLatestRunId")),
        /** Client-chosen key, unique per caller. Repeat the request unchanged to resolve an unknown outcome. */
        idempotencyKey: IdempotencyKeySchema,
        /**
         * Trading account the run reads and acts on. Omit for the main account: the run then
         * reads it (balances, trading accounts, API keys, price alerts, fees and permissions)
         * but places, changes and cancels nothing, and asks the user to pick a trading account.
         */
        subaccountId: optionalSubaccountIdInputSchema(),
        /**
         * `"none"` for a run that reads no account, such as when the user has given the
         * assistant access to no account; `subaccountId` must then be omitted. Omit to read the
         * `subaccountId` account or the main account. Covered by `idempotencyKey`.
         */
        accountSelection: v.pipe(
            v.optional(v.picklist(ASSISTANT_ACCOUNT_SELECTION_VALUES)),
            v.transform((value) => (value ? AccountSelectionCodec.inputToProto[value] : undefined)),
        ),
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
        /**
         * The page the user is on as they send the message; omit for a client without pages.
         * Covered by `idempotencyKey`: a retry must send the page the first attempt sent.
         */
        page: v.optional(CurrentPageInputSchema),
        /**
         * Display settings the client offers now and will change when a run's
         * `display_setting_action` asks, each once. Omit for none.
         */
        displaySettings: v.optional(
            v.pipe(
                v.array(v.picklist(ASSISTANT_DISPLAY_SETTING_VALUES)),
                v.check(
                    (items) => new Set(items).size === items.length,
                    "Display settings must be distinct.",
                ),
                v.transform((items) => items.map((item) => DisplaySettingCodec.inputToProto[item])),
            ),
        ),
    }),
    v.check(
        (input) => input.accountSelection === undefined || input.subaccountId === undefined,
        'Omit subaccountId when accountSelection is "none".',
    ),
    v.check(
        (input) => Boolean(input.text || input.images?.length),
        "A message needs text, images or both.",
    ),
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

export const ListAssistantConversationsInputSchema = v.strictObject({
    ...pageInputEntries(100),
    /** Lists only the conversation about this subject: zero or one. */
    subject: v.optional(AssistantSubjectInputSchema),
});

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

export const GetAssistantMessageImageInputSchema = v.strictObject({
    imageId: idInputSchema("imageId"),
});

export type GetAssistantMessageImageInput = v.InferInput<
    typeof GetAssistantMessageImageInputSchema
>;

export const SetAssistantModelKeyInputSchema = v.strictObject({
    /** An OpenAI secret API key (`sk-...`). Never logged or returned. */
    apiKey: v.pipe(v.string(), v.minLength(1)),
});

export type SetAssistantModelKeyInput = v.InferInput<typeof SetAssistantModelKeyInputSchema>;

export const CompleteAssistantKeysInputSchema = v.strictObject({
    setupId: idInputSchema("setupId"),
});

export type CompleteAssistantKeysInput = v.InferInput<typeof CompleteAssistantKeysInputSchema>;

/* ---------- outputs ---------- */

function optionalId(id: bigint | undefined): string | undefined {
    return id ? formatId(id) : undefined;
}

/**
 * The account a conversation's latest message selected, in `sendMessage`'s terms: pass both
 * fields back unchanged to keep it. `accountSelection: "none"` read no account; otherwise an
 * absent `subaccountId` is the main account.
 */
export function formatConversationAccount(a: Proto.ConversationAccount | undefined) {
    if (!a) return undefined;
    return {
        accountSelection:
            a.accountSelection === AccountSelection.NONE ? ("none" as const) : undefined,
        subaccountId: optionalId(a.subaccountId),
    };
}

export type AssistantConversationAccount = NonNullable<
    ReturnType<typeof formatConversationAccount>
>;

/** What a conversation is about; absent for a general conversation. */
export function formatSubject(s: Proto.Subject | undefined) {
    return s?.kind.case === "strategy"
        ? { strategyId: formatId(s.kind.value.strategyId) }
        : undefined;
}

export type AssistantSubject = NonNullable<ReturnType<typeof formatSubject>>;

export function formatConversation(c: Proto.Conversation) {
    return {
        conversationId: formatId(c.conversationId),
        /** Empty until a title is available. */
        title: c.title,
        /** What the conversation is about; absent for a general conversation. */
        subject: formatSubject(c.subject),
        /**
         * The account its latest message selected as of this list; `listMessages` returns it
         * as it stands when the conversation is opened.
         */
        lastAccount: formatConversationAccount(c.lastAccount),
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
        /** A user message's images, in the order sent; read each with `getMessageImage`. */
        images: m.images.map(formatMessageImage),
    };
}

export function formatMessageImage(i: Proto.MessageImage) {
    return {
        imageId: formatId(i.imageId),
        /** `"image/png"`, `"image/jpeg"` or `"image/webp"`. */
        mimeType: i.mimeType,
        /** Pixels; an image over 2000 pixels on a side is stored scaled down to fit. */
        width: i.width,
        height: i.height,
        sizeBytes: i.sizeBytes,
    };
}

export type AssistantMessageImage = ReturnType<typeof formatMessageImage>;

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
        /**
         * The subaccount's name; only from `listKeys({ view: "full" })`. Empty for the main
         * account, an unnamed subaccount, or a name that could not be read.
         */
        label: k.label,
    };
}

export const ListAssistantKeysInputSchema = v.pipe(
    v.strictObject({
        /** `"full"` adds each key's account name as `label`. */
        view: v.optional(v.picklist(ASSISTANT_KEY_VIEW_VALUES)),
    }),
    v.transform(({ view }) => ({
        view: view ? AssistantKeyViewCodec.inputToProto[view] : undefined,
    })),
);

export type ListAssistantKeysInput = v.InferInput<typeof ListAssistantKeysInputSchema>;

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

/** The caller's own OpenAI API key as the assistant shows it; the key itself is never returned. */
export function formatModelKey(k: Proto.ModelKey | undefined) {
    return {
        /** The key's last four characters, e.g. `"x7Qa"`. */
        suffix: k?.suffix ?? "",
        addedAt: tsObjToMs(k?.addedAt),
        /** The last check with OpenAI: on save, when OpenAI refused it in a run, and on recovery. */
        lastCheck: enumLabel(ModelKeyCheckCodec.protoToOutput, k?.lastCheck ?? 0),
        checkedAt: tsObjToMs(k?.checkedAt),
    };
}

export type AssistantModelKey = ReturnType<typeof formatModelKey>;

/** Credits are the main account's, shared by every subaccount. */
export function formatAssistantUsage(r: Proto.GetUsageResponse) {
    return {
        /** With `"own_key"`, messages use no credits. */
        fundingMode: FundingModeCodec.protoToOutput[r.fundingMode] ?? "credits",
        /** Omitted when the tier could not be read; VIP 0's free credits then apply. */
        vipTier: r.vipTier,
        /** Today's free credits. */
        freeCredits: Number(r.freeCredits),
        /** Rounded down; may exceed `freeCredits`, as an answer started with credits left finishes. */
        freeCreditsUsed: Number(r.freeCreditsUsed),
        freeCreditsLeft: Number(r.freeCreditsLeft),
        /** Epoch ms of the next 00:00 UTC; unused credits do not carry over. */
        resetsAt: tsObjToMs(r.resetsAt),
        /** The next VIP tier's daily free credits; omitted at the top tier or an unknown tier. */
        nextTier: r.nextTier && {
            vipTier: r.nextTier.vipTier,
            dailyFreeCredits: Number(r.nextTier.dailyFreeCredits),
        },
    };
}

export type AssistantUsage = ReturnType<typeof formatAssistantUsage>;

/** `nextPageToken` is empty when no more results exist. */
export type ListAssistantConversationsResult = {
    conversations: AssistantConversation[];
    nextPageToken: string;
};
/**
 * `lastAccount` is the account the latest message selected, current on every page. `subject` is
 * what the conversation is about, fixed when it started; absent for a general conversation.
 */
export type ListAssistantMessagesResult = {
    messages: AssistantMessage[];
    nextPageToken: string;
    lastAccount: AssistantConversationAccount | undefined;
    subject: AssistantSubject | undefined;
};
export type ListAssistantMemoriesResult = { memories: AssistantMemory[]; nextPageToken: string };

/** US dollars as a decimal string with at most 2 decimal places, e.g. `"5000"` or `"250.50"`. */
const UsdLimitInputSchema = v.pipe(
    v.string(),
    v.trim(),
    v.regex(/^\d+(\.\d{1,2})?$/, "limit must be US dollars with at most 2 decimal places"),
);

export const SetTelegramApprovalLimitsInputSchema = v.strictObject({
    /** Largest notional value of one approval from Telegram. `"0"` allows none; omit for no limit. */
    perApprovalUsd: v.optional(UsdLimitInputSchema),
    /** Largest total notional value approved from Telegram in any rolling 24 hours; omit for no limit. */
    dailyUsd: v.optional(UsdLimitInputSchema),
});

export type SetTelegramApprovalLimitsInput = v.InferInput<
    typeof SetTelegramApprovalLimitsInputSchema
>;

/** Limits on what the caller may approve from Telegram, in US dollars; `null` is no limit. */
export type TelegramApprovalLimits = {
    perApprovalUsd: string | null;
    dailyUsd: string | null;
};

export function formatTelegramApprovalLimits(
    limits: Proto.TelegramApprovalLimits | undefined,
): TelegramApprovalLimits {
    return {
        perApprovalUsd: limits?.perApprovalUsd ?? null,
        dailyUsd: limits?.dailyUsd ?? null,
    };
}
