import type { JsonObject } from "@bufbuild/protobuf";
import * as v from "valibot";
import type * as Proto from "../../gen/strategies/v1/strategies_pb.js";
import { enumLabel } from "../../shared/proto-enum-codec.js";
import {
    WalletAddressSchema,
    WalletChallengeMessageSchema,
    WalletSignatureSchema,
} from "../auth/wallet-challenge.schemas.js";
import {
    JsonObjectSchema,
    bigintStringInputSchema,
    idInputSchema,
    positiveBigintStringInputSchema,
} from "../../shared/schemas.js";
import { PROTOBUF_UINT64_MAX } from "../../shared/wire-bounds.js";
import { formatId } from "../../utils/base58-id.js";
import { tsObjToMs } from "../../utils/time.js";
import { msToTimestamp } from "../../utils/timestamp.js";
import {
    BacktestStatusCodec,
    BotFundsReturnStatusCodec,
    BotLogKindCodec,
    BotStatusCodec,
    BotPauseReasonCodec,
    DeployStateCodec,
    DeployWaitReasonCodec,
    EvidenceGradeCodec,
    FlowNodeKindCodec,
    ListingStateCodec,
    NotBacktestableReasonCodec,
    ReportReasonCodec,
    RevisionSavedByCodec,
    STRATEGY_BOT_STOP_MODE_VALUES,
    STRATEGY_REPORT_REASON_VALUES,
    STRATEGY_TAG_VALUES,
    ScenarioOutcomeCodec,
    StopModeCodec,
    StrategyOrderSideCodec,
    StrategyTagCodec,
} from "./strategies.codecs.js";

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

const TrimmedStringSchema = v.pipe(v.string(), v.trim());
const RequiredStringSchema = v.pipe(v.string(), v.trim(), v.minLength(1));
const IdempotencyKeySchema = v.pipe(
    v.string(),
    v.regex(
        /^[A-Za-z0-9._:-]{1,128}$/u,
        "idempotencyKey must be 1 to 128 letters, digits, '.', '_', ':' or '-'.",
    ),
);
/** Epoch milliseconds. */
const TimestampMsInputSchema = v.pipe(
    v.number(),
    v.integer(),
    v.minValue(0),
    v.maxValue(Number.MAX_SAFE_INTEGER),
    v.transform(msToTimestamp),
);
const PageTokenInputSchema = v.optional(TrimmedStringSchema, "");
const VersionIdInputSchema = RequiredStringSchema;
const StrategyIdSchema = idInputSchema("strategyId");
/** A uint64 revision as a decimal string, e.g. `"0"`. */
const revisionInputSchema = (fieldName: string) =>
    v.pipe(
        bigintStringInputSchema(fieldName),
        v.maxValue(PROTOBUF_UINT64_MAX, `${fieldName} exceeds the uint64 range`),
    );

/** An exact decimal amount of an asset, e.g. `{ asset: "USDT", amount: "50" }`. */
const MoneyInputSchema = v.strictObject({
    asset: RequiredStringSchema,
    amount: RequiredStringSchema,
});

/** A value for a field of the version's settings form, as a string, e.g. `"50"`. */
const SettingValueInputSchema = v.strictObject({
    name: RequiredStringSchema,
    value: v.string(),
});

export const GetStrategyReferenceInputSchema = v.strictObject({
    /** Omit for the current runtime version. */
    runtimeVersion: v.optional(TrimmedStringSchema, ""),
});
export type GetStrategyReferenceInput = v.InferInput<typeof GetStrategyReferenceInputSchema>;

export const CreateStrategyInputSchema = v.pipe(
    v.strictObject({
        name: RequiredStringSchema,
        /** Start from a bot template from `listTemplates`. Omit both sources for a blank strategy. */
        templateId: v.optional(RequiredStringSchema),
        /** Start as a copy of one of the caller's own versions. */
        versionId: v.optional(VersionIdInputSchema),
        /** Reusing a key with the same request returns the strategy it created. */
        idempotencyKey: IdempotencyKeySchema,
    }),
    v.check(
        (input) => input.templateId === undefined || input.versionId === undefined,
        "Pass templateId or versionId, not both",
    ),
    v.transform(({ templateId, versionId, ...input }) => ({
        ...input,
        source:
            templateId !== undefined
                ? { case: "templateId" as const, value: templateId }
                : versionId !== undefined
                  ? { case: "versionId" as const, value: versionId }
                  : { case: undefined },
    })),
);
export type CreateStrategyInput = v.InferInput<typeof CreateStrategyInputSchema>;

export const SaveDraftVersionInputSchema = v.pipe(
    v.strictObject({
        strategyId: StrategyIdSchema,
        /** The strategy's `revision` this draft was made from, as a decimal string; `"0"` for its first save. */
        expectedRevision: revisionInputSchema("expectedRevision"),
        /** The save renames the strategy to it. */
        name: RequiredStringSchema,
        /** The manifest as a JSON object shaped like `getReference`'s `manifestSchema`. */
        manifest: JsonObjectSchema,
        /** The bot code, UTF-8. */
        code: v.string(),
        /** Omit for the current runtime version. */
        runtimeVersion: v.optional(TrimmedStringSchema, ""),
        /** Reusing a key with the same request returns the revision it saved. */
        idempotencyKey: v.optional(IdempotencyKeySchema),
        /**
         * The notes' `notesRevision` this draft was written against, `"0"` for notes never saved;
         * omit to skip the check. Any other current notes revision throws `RevisionConflictError`
         * (`NOTES_REVISION_CONFLICT`), checked together with `expectedRevision`.
         */
        expectedNotesRevision: v.optional(revisionInputSchema("expectedNotesRevision")),
    }),
    v.transform(({ idempotencyKey, ...input }) => ({
        ...input,
        idempotencyKey: idempotencyKey ?? "",
    })),
);
export type SaveDraftVersionInput = v.InferInput<typeof SaveDraftVersionInputSchema>;

export const StrategyIdInputSchema = v.strictObject({ strategyId: StrategyIdSchema });
export type StrategyInput = v.InferInput<typeof StrategyIdInputSchema>;

export const RenameStrategyInputSchema = v.strictObject({
    strategyId: StrategyIdSchema,
    name: RequiredStringSchema,
});
export type RenameStrategyInput = v.InferInput<typeof RenameStrategyInputSchema>;

export const StrategyVersionInputSchema = v.strictObject({ versionId: VersionIdInputSchema });
export type StrategyVersionInput = v.InferInput<typeof StrategyVersionInputSchema>;

export const StartBacktestInputSchema = v.strictObject({
    versionId: VersionIdInputSchema,
    /**
     * Window start, epoch ms, inclusive, floored to a whole second. Omit for the most recent 365
     * days of data, or all of it when there is less; a bot whose candle, schedule and start calls
     * over 365 days would not fit a backtest's 30,000 calls gets the most whole days that fit, at
     * least one. Read the resolved window from `getBacktest`.
     */
    startTime: v.optional(TimestampMsInputSchema),
    /**
     * Window end, epoch ms, exclusive, floored to a whole second. Omit for the end of the longest
     * window with data.
     */
    endTime: v.optional(TimestampMsInputSchema),
    /** Settings form values, each setting once; settings left out take their default. */
    settings: v.optional(v.array(SettingValueInputSchema), []),
    /**
     * Starting balances, one per asset of the bot's markets, each more than 0. Omit for 1,000 of
     * the bot's quote asset, e.g. 1000 USDT, whatever its settings.
     */
    initialBalances: v.optional(v.array(MoneyInputSchema), []),
    /** Reusing a key with the same request returns the backtest it started. */
    idempotencyKey: IdempotencyKeySchema,
});
export type StartBacktestInput = v.InferInput<typeof StartBacktestInputSchema>;

export const BacktestIdInputSchema = v.strictObject({ backtestId: idInputSchema("backtestId") });
export type StrategyBacktestInput = v.InferInput<typeof BacktestIdInputSchema>;

export const ProposeDeployInputSchema = v.pipe(
    v.strictObject({
        strategyId: StrategyIdSchema,
        /** The strategy's revision to propose, as a decimal string, e.g. `saveDraftVersion`'s `revision`. */
        revision: v.pipe(
            positiveBigintStringInputSchema("revision"),
            v.maxValue(PROTOBUF_UINT64_MAX, "revision exceeds the uint64 range"),
        ),
        botName: RequiredStringSchema,
        /** Settings form values, each setting once; settings left out take their default. */
        settings: v.optional(v.array(SettingValueInputSchema), []),
        /** Amounts to move into the bot's new subaccount on deploy: 1 to 16 assets, each once. */
        funding: v.pipe(v.array(MoneyInputSchema), v.minLength(1)),
        /** Reusing a key with the same request returns the proposal it recorded. */
        idempotencyKey: IdempotencyKeySchema,
        /** Subaccount that funds the bot. Omit to fund it from the main account. */
        fundingSubaccountId: v.optional(idInputSchema("fundingSubaccountId")),
    }),
    v.transform(({ fundingSubaccountId, ...input }) => ({
        ...input,
        fundingSubaccountId: fundingSubaccountId ?? 0n,
    })),
);
export type ProposeDeployInput = v.InferInput<typeof ProposeDeployInputSchema>;

export const DeployProposalInputSchema = v.strictObject({
    proposalId: idInputSchema("proposalId"),
});
export type StrategyDeployProposalInput = v.InferInput<typeof DeployProposalInputSchema>;

/** Signed authorization for a bot's new subaccount, from `subaccounts.createChallenge`. */
export const StrategySubaccountAuthorizationSchema = v.strictObject({
    smartAccountAddress: WalletAddressSchema,
    message: WalletChallengeMessageSchema,
    signature: WalletSignatureSchema,
});
export type StrategySubaccountAuthorizationInput = v.InferInput<
    typeof StrategySubaccountAuthorizationSchema
>;

export const DeployBotInputSchema = v.strictObject({
    proposalId: idInputSchema("proposalId"),
    /**
     * Signed authorization for the bot's new subaccount, from `subaccounts.createChallenge`.
     * Needed only when the deploy creates a subaccount; omit when reusing a closed bot subaccount.
     */
    subaccountAuthorization: v.optional(StrategySubaccountAuthorizationSchema),
});
export type DeployBotInput = v.InferInput<typeof DeployBotInputSchema>;

const limitInputSchema = (max: number) =>
    v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(max)));
const LimitInputSchema = limitInputSchema(200);

export const ListBotsInputSchema = v.strictObject({
    /** Page size: default 50, at most 200. */
    limit: LimitInputSchema,
    /** Previous `nextPageToken`. */
    pageToken: PageTokenInputSchema,
});
export type ListBotsInput = v.InferInput<typeof ListBotsInputSchema>;

export const ListStrategiesInputSchema = ListBotsInputSchema;
export type ListStrategiesInput = ListBotsInput;

export const ListStrategyRevisionsInputSchema = v.strictObject({
    strategyId: StrategyIdSchema,
    /** Page size: default 50, at most 200. */
    limit: LimitInputSchema,
    /** Previous `nextPageToken`; reuse only with the same `strategyId`. */
    pageToken: PageTokenInputSchema,
});
export type ListStrategyRevisionsInput = v.InferInput<typeof ListStrategyRevisionsInputSchema>;

export const SaveStrategyNotesInputSchema = v.strictObject({
    strategyId: StrategyIdSchema,
    /** The notes' current `notesRevision` this text was made from, as a decimal string; `"0"` for the first save. */
    expectedNotesRevision: revisionInputSchema("expectedNotesRevision"),
    /** What the strategy is, in one line with no line break: at most 120 characters. */
    summary: v.string(),
    /** The notes, as Markdown: at most 8192 bytes of UTF-8. */
    body: v.string(),
    /**
     * Reusing a key with the same request returns the notes revision it saved, even after later
     * saves. Without one, a retry after a save that landed throws `RevisionConflictError`.
     */
    idempotencyKey: v.optional(IdempotencyKeySchema),
    /**
     * The strategy's `revision` this text was written against, `"0"` for a strategy never saved;
     * omit to skip the check. Any other current revision throws `RevisionConflictError`
     * (`DRAFT_REVISION_CONFLICT`), checked together with `expectedNotesRevision`.
     */
    expectedRevision: v.optional(revisionInputSchema("expectedRevision")),
});
export type SaveStrategyNotesInput = v.InferInput<typeof SaveStrategyNotesInputSchema>;

export const ListStrategyNotesRevisionsInputSchema = v.strictObject({
    strategyId: StrategyIdSchema,
    /** Page size: default 10, at most 20. */
    limit: limitInputSchema(20),
    /** Previous `nextPageToken`; reuse only with the same `strategyId`. */
    pageToken: PageTokenInputSchema,
});
export type ListStrategyNotesRevisionsInput = v.InferInput<
    typeof ListStrategyNotesRevisionsInputSchema
>;

export const ListBacktestsInputSchema = v.strictObject({
    strategyId: StrategyIdSchema,
    /** Page size: default 10, at most 50. */
    limit: limitInputSchema(50),
    /** Previous `nextPageToken`; reuse only with the same `strategyId`. */
    pageToken: PageTokenInputSchema,
});
export type ListBacktestsInput = v.InferInput<typeof ListBacktestsInputSchema>;

export const ListBacktestTradesInputSchema = v.strictObject({
    backtestId: idInputSchema("backtestId"),
    /** Page size: default 100, at most 1000. */
    limit: limitInputSchema(1000),
    /** Previous `nextPageToken`; reuse only with the same `backtestId`. */
    pageToken: PageTokenInputSchema,
});
export type ListBacktestTradesInput = v.InferInput<typeof ListBacktestTradesInputSchema>;

const StrategyTagsInputSchema = v.optional(
    v.pipe(
        v.array(v.picklist(STRATEGY_TAG_VALUES)),
        v.transform((tags) => tags.map((tag) => StrategyTagCodec.inputToProto[tag])),
    ),
    [],
);

export const PublishStrategyVersionInputSchema = v.strictObject({
    strategyId: StrategyIdSchema,
    /** One of the strategy's revisions' versions: valid, with every behaviour example passing. */
    versionId: VersionIdInputSchema,
    /** The listing's title. */
    title: RequiredStringSchema,
    /** The listing's description; sent as given. */
    description: v.optional(v.string(), ""),
    /** The strategy's types, each at most once. */
    tags: StrategyTagsInputSchema,
    /**
     * Reusing a key with the same request returns the listing as it stands now and never
     * publishes again.
     */
    idempotencyKey: IdempotencyKeySchema,
});
export type PublishStrategyVersionInput = v.InferInput<typeof PublishStrategyVersionInputSchema>;

export const ListingIdInputSchema = v.strictObject({ listingId: idInputSchema("listingId") });
export type StrategyListingInput = v.InferInput<typeof ListingIdInputSchema>;

export const ForkStrategyInputSchema = v.strictObject({
    listingId: idInputSchema("listingId"),
    /** Name of the new strategy. */
    name: RequiredStringSchema,
    /**
     * Reusing a key with the same request returns the strategy the first call created and never
     * forks again; a key `create` or `saveDraftVersion` used throws `AlreadyExistsError`.
     */
    idempotencyKey: IdempotencyKeySchema,
});
export type ForkStrategyInput = v.InferInput<typeof ForkStrategyInputSchema>;

export const ReportCommunityStrategyInputSchema = v.pipe(
    v.strictObject({
        listingId: idInputSchema("listingId"),
        /** The version the reader saw, as `getCommunity` returned it. */
        versionId: VersionIdInputSchema,
        reason: v.picklist(STRATEGY_REPORT_REASON_VALUES),
        /** What the reader adds, at most 500 characters; required with `other`. */
        note: v.optional(v.string(), ""),
    }),
    v.transform(({ reason, ...input }) => ({
        ...input,
        reason: ReportReasonCodec.inputToProto[reason],
    })),
);
export type ReportCommunityStrategyInput = v.InferInput<typeof ReportCommunityStrategyInputSchema>;

export const ListCommunityStrategiesInputSchema = v.strictObject({
    /** Only listings with any of these types; omit for every type. */
    tags: StrategyTagsInputSchema,
    /**
     * Only listings trading any of these markets, each by its symbol, e.g. `BTC-USDT`; omit for
     * every market. A name that isn't a symbol throws `ValidationError`.
     */
    markets: v.optional(v.array(v.string()), []),
    /** Page size: default 20, at most 100. */
    limit: limitInputSchema(100),
    /** Previous `nextPageToken`; reuse only with the same `tags` and `markets`. */
    pageToken: PageTokenInputSchema,
});
export type ListCommunityStrategiesInput = v.InferInput<typeof ListCommunityStrategiesInputSchema>;

export const BotIdInputSchema = v.strictObject({ botId: idInputSchema("botId") });
export type StrategyBotInput = v.InferInput<typeof BotIdInputSchema>;

export const ListBotVersionsInputSchema = v.strictObject({
    botId: idInputSchema("botId"),
    /** Page size: default 50, at most 200. */
    limit: LimitInputSchema,
    /** Previous `nextPageToken`; reuse only with the same `botId`. */
    pageToken: PageTokenInputSchema,
});
export type ListBotVersionsInput = v.InferInput<typeof ListBotVersionsInputSchema>;

export const StopBotInputSchema = v.pipe(
    v.strictObject({
        botId: idInputSchema("botId"),
        /** `keep_orders` leaves its open orders with its subaccount; `cancel_orders` cancels them. */
        mode: v.picklist(STRATEGY_BOT_STOP_MODE_VALUES),
        /** Reusing a key with the same request returns the stop it recorded. */
        idempotencyKey: IdempotencyKeySchema,
    }),
    v.transform(({ mode, ...input }) => ({ ...input, mode: StopModeCodec.inputToProto[mode] })),
);
export type StopBotInput = v.InferInput<typeof StopBotInputSchema>;

export const ReturnBotFundsInputSchema = v.strictObject({
    botId: idInputSchema("botId"),
    /**
     * Reusing a key for the same bot returns the same return as it stands now and never starts a
     * second; the same key for another bot throws `AlreadyExistsError`.
     */
    idempotencyKey: IdempotencyKeySchema,
});
export type ReturnBotFundsInput = v.InferInput<typeof ReturnBotFundsInputSchema>;

export const BotFundsReturnIdInputSchema = v.strictObject({ returnId: idInputSchema("returnId") });
export type StrategyBotFundsReturnInput = v.InferInput<typeof BotFundsReturnIdInputSchema>;

export const ListBotLogsInputSchema = v.strictObject({
    botId: idInputSchema("botId"),
    /**
     * Earliest entry, epoch ms, inclusive, by the time of the event behind it, which doesn't follow
     * the log's order. Omit to read from the oldest entry kept. To read later entries, pass
     * `followToken` as `pageToken`, never a later `startTime`.
     */
    startTime: v.optional(TimestampMsInputSchema),
    /** Page size: default 100, at most 200. */
    limit: LimitInputSchema,
    /**
     * Previous `nextPageToken` or `followToken`; reuse only with the same `botId` and `startTime`.
     * It keeps reading the deployment the first page read, even after the bot is deployed again.
     */
    pageToken: PageTokenInputSchema,
});
export type ListBotLogsInput = v.InferInput<typeof ListBotLogsInputSchema>;

// ---------------------------------------------------------------------------
// Outputs. Formatted straight from decoded protobuf messages: amounts stay exact decimal
// strings, times are epoch ms (null when unset), IDs are base58 public IDs.
// ---------------------------------------------------------------------------

const ms = (t: Proto.Backtest["createdAt"]) => tsObjToMs(t) ?? null;
const optionalId = (id: bigint) => (id === 0n ? null : formatId(id));

/** An exact decimal amount of an asset, e.g. `{ asset: "USDT", amount: "50" }`. */
export type StrategyMoney = { asset: string; amount: string };
const money = (m: Proto.Money | undefined): StrategyMoney | null =>
    m ? { asset: m.asset, amount: m.amount } : null;
const moneyList = (list: Proto.Money[]): StrategyMoney[] =>
    list.map((m) => ({ asset: m.asset, amount: m.amount }));

const window = (w: Proto.TimeWindow | undefined) =>
    w ? { startTime: ms(w.startTime), endTime: ms(w.endTime) } : null;

export function formatStrategyReference(r: Proto.GetStrategyReferenceResponse) {
    return {
        runtimeVersion: r.runtimeVersion,
        /** Null until the runtime catalog is available. */
        indicatorLibrary: r.indicatorLibrary
            ? { name: r.indicatorLibrary.name, version: r.indicatorLibrary.version }
            : null,
        /** The bot API reference, Markdown. */
        reference: r.reference,
        /** JSON Schema of the manifest; null until the runtime catalog is available. */
        manifestSchema: (r.manifestSchema ?? null) as JsonObject | null,
        indicators: r.indicators.map((i) => ({
            name: i.name,
            description: i.description,
            parameters: i.parameters.map((p) => ({
                name: p.name,
                description: p.description,
                minimum: p.minimum,
                maximum: p.maximum,
                defaultValue: p.defaultValue,
                integer: p.integer,
            })),
            outputs: i.outputs,
            warmupBars: i.warmupBars,
        })),
        /** Null until the runtime catalog is available. */
        limits: r.limits
            ? {
                  cpuMsPerCall: r.limits.cpuMsPerCall,
                  memoryBytesPerCall: Number(r.limits.memoryBytesPerCall),
                  stateBytes: Number(r.limits.stateBytes),
                  codeBytes: Number(r.limits.codeBytes),
                  manifestBytes: Number(r.limits.manifestBytes),
                  scenarioRunsPerMinute: r.limits.scenarioRunsPerMinute,
              }
            : null,
        /** Skill documents in order; the order is part of `skillPackVersion`. */
        skillPack: r.skillPack.map((d) => ({ name: d.name, markdown: d.markdown })),
        skillPackVersion: r.skillPackVersion,
    };
}
export type StrategyReference = ReturnType<typeof formatStrategyReference>;

export function formatStrategyTemplate(t: Proto.StrategyTemplate) {
    return {
        templateId: t.templateId,
        name: t.name,
        description: t.description,
        manifest: (t.manifest ?? {}) as JsonObject,
        code: t.code,
        runtimeVersion: t.runtimeVersion,
        /** The money card a version saved from the template unchanged shows. */
        moneyCard: moneyCard(t.moneyCard),
    };
}
export type StrategyTemplate = ReturnType<typeof formatStrategyTemplate>;

const issue = (i: Proto.ValidationIssue) => ({
    /** JSON path into the manifest; empty for a code issue. */
    manifestPath: i.manifestPath,
    /** 1-based code position; 0 for a manifest issue. */
    line: i.line,
    column: i.column,
    rule: i.rule,
    message: i.message,
    hint: i.hint,
});
export type StrategyValidationIssue = ReturnType<typeof issue>;

function moneyCard(c: Proto.MoneyCard | undefined) {
    if (!c) return null;
    return {
        budget: money(c.budget),
        maxOrder: money(c.maxOrder),
        maxOpenGtcOrders: c.maxOpenGtcOrders,
        dailyLossThreshold: money(c.dailyLossThreshold),
        markets: c.markets,
        events: c.events,
    };
}
/** The money rules a user approves when deploying a version. */
export type StrategyMoneyCard = NonNullable<ReturnType<typeof moneyCard>>;

const settingField = (f: Proto.SettingField) => ({
    name: f.name,
    description: f.description,
    kind: f.kind,
    asset: f.asset,
    defaultValue: f.defaultValue,
    minimum: f.minimum,
    maximum: f.maximum,
});
export type StrategySettingField = ReturnType<typeof settingField>;

/** `description`, `kind` and `asset` come from the settings form; empty in a proposal's summary. */
const settingValues = (list: Proto.SettingValue[]) =>
    list.map((s) => ({
        name: s.name,
        value: s.value,
        description: s.description,
        kind: s.kind,
        asset: s.asset,
    }));

function flow(f: Proto.StrategyFlow | undefined) {
    if (!f) return null;
    return {
        nodes: f.nodes.map((n) => ({
            /** Stable within a version only. */
            nodeId: n.nodeId,
            kind: enumLabel(FlowNodeKindCodec.protoToOutput, n.kind),
            label: n.label,
            /** 1-based, inclusive code lines; null when the node has no code. */
            span: n.span ? { startLine: n.span.startLine, endLine: n.span.endLine } : null,
            /** A trigger's manifest event, as the money card names it; else empty. */
            event: n.event,
            /** An action's kind, e.g. `BUY` or `LOG`; else empty. */
            action: n.action,
            settings: n.settings,
        })),
        /** `branch` is `"true"` or `"false"` out of a condition; else empty. */
        edges: f.edges.map((e) => ({
            fromNodeId: e.fromNodeId,
            toNodeId: e.toNodeId,
            branch: e.branch,
        })),
        /** What the graph leaves out when `complete` is false. */
        notes: f.notes,
        complete: f.complete,
    };
}
/** What wakes a bot, what it checks and what it may do, one lane per trigger. */
export type StrategyFlow = NonNullable<ReturnType<typeof flow>>;

function versionValidation(r: Proto.VersionValidation | undefined) {
    if (!r) return null;
    return {
        /** Same runtime version, manifest and code always give the same version. */
        versionId: r.versionId,
        runtimeVersion: r.runtimeVersion,
        /** False means fix `errors` and save again; it is not a thrown error. */
        valid: r.valid,
        errors: r.errors.map(issue),
        warnings: r.warnings.map(issue),
        moneyCard: moneyCard(r.moneyCard),
        settingsForm: r.settingsForm.map(settingField),
        /** Null unless `valid`, or for a version stored before flows existed. */
        flow: flow(r.flow),
    };
}
/** A version's check result. */
export type StrategyVersionValidation = NonNullable<ReturnType<typeof versionValidation>>;

export function formatStrategyVersion(r: Proto.GetStrategyVersionResponse) {
    return {
        versionId: r.versionId,
        name: r.name,
        runtimeVersion: r.runtimeVersion,
        manifest: (r.manifest ?? {}) as JsonObject,
        code: r.code,
        settingsForm: r.settingsForm.map(settingField),
        valid: r.valid,
        createdAt: ms(r.createdAt),
        /** Null unless `valid`, or for a version stored before flows existed. */
        flow: flow(r.flow),
        /**
         * The check result stored with the version, as saving it answered; reading never checks it
         * again. Null for a version stored without one.
         */
        validation: versionValidation(r.validation),
    };
}
export type StrategyVersion = ReturnType<typeof formatStrategyVersion>;

function origin(o: Proto.StrategyOrigin | undefined) {
    switch (o?.source.case) {
        case "templateId":
            return { kind: "template" as const, templateId: o.source.value };
        case "duplicate":
            return { kind: "duplicate" as const, sourceVersionId: o.source.value.sourceVersionId };
        case "fork": {
            const { listingId, title, authorUsername, sourceVersionId } = o.source.value;
            return {
                kind: "fork" as const,
                /**
                 * The listing forked, while it is public; null once it isn't, with `title` and
                 * `authorUsername` empty: show "forked from a community strategy" then.
                 */
                listingId: optionalId(listingId),
                title,
                authorUsername,
                /** The published version copied: the strategy's revision 1. */
                sourceVersionId,
            };
        }
        default:
            return null;
    }
}

export function formatStrategy(s: Proto.Strategy) {
    return {
        strategyId: formatId(s.strategyId),
        name: s.name,
        /** The current revision, a decimal string; `"0"` until the first save. */
        revision: s.revision.toString(),
        /** The current revision's version; empty until the first save. */
        headVersionId: s.headVersionId,
        valid: s.valid,
        /** What it started from; null for a blank strategy. */
        origin: origin(s.origin),
        createdAt: ms(s.createdAt),
        /** When it was last saved or renamed. */
        updatedAt: ms(s.updatedAt),
        /**
         * The newest bot deployed from it that hasn't stopped (`running`, `paused` or `stopping`);
         * null when none, or when the caller may not read bots.
         */
        bot: s.bot
            ? {
                  botId: formatId(s.bot.botId),
                  status: enumLabel(BotStatusCodec.protoToOutput, s.bot.status),
              }
            : null,
        /**
         * The current revision's markets, as its money card names them, e.g. `BTC-USDT`; empty
         * without a valid current revision, or when the caller may not read bots.
         */
        markets: s.markets,
        /** The notes' one-line summary; empty before their first save, or when the caller may not read bots. */
        summary: s.summary,
        /**
         * Its community listing, `public`, `hidden` or `held`; null when never published, or when
         * the caller may not read bots.
         */
        listing: s.listing ? formatStrategyListing(s.listing) : null,
    };
}
export type Strategy = ReturnType<typeof formatStrategy>;

export function formatStrategyListing(l: Proto.StrategyListing) {
    return {
        listingId: formatId(l.listingId),
        /** `hidden` once its author unpublished it; the next publish makes it `public` again. */
        state: enumLabel(ListingStateCodec.protoToOutput, l.state),
        /** The version it shows: the one last published. */
        versionId: l.versionId,
        /** When that version was published. */
        publishedAt: ms(l.publishedAt),
        /** Why moderation holds it, for its author only; empty unless `held`. */
        holdReason: l.holdReason,
    };
}
/** A strategy's community listing, as its author's strategy shows it. */
export type StrategyListing = ReturnType<typeof formatStrategyListing>;

const requireStrategy = (s: Proto.Strategy | undefined, rpc: string) => {
    if (!s) throw new Error(`${rpc} response is missing its strategy`);
    return formatStrategy(s);
};

export function formatCreateStrategyResult(r: Proto.CreateStrategyResponse) {
    return {
        strategy: requireStrategy(r.strategy, "CreateStrategy"),
        /** Revision 1's check result; null for a blank strategy. */
        version: versionValidation(r.version),
    };
}
export type CreateStrategyResult = ReturnType<typeof formatCreateStrategyResult>;

export function formatSaveDraftVersionResult(r: Proto.SaveDraftVersionResponse) {
    const version = versionValidation(r.version);
    if (!version) throw new Error("SaveDraftVersion response is missing its version");
    return {
        /** The revision saved, a decimal string; the current one when the content is unchanged. */
        revision: r.revision.toString(),
        version,
    };
}
export type SaveDraftVersionResult = ReturnType<typeof formatSaveDraftVersionResult>;

export function formatStrategyDetails(r: Proto.GetStrategyResponse) {
    return {
        strategy: requireStrategy(r.strategy, "GetStrategy"),
        /** The current revision's version; null until the first save. */
        head: r.head ? formatStrategyVersion(r.head) : null,
        /** The notes, as `getNotes` reads them. */
        notes: r.notes ? formatStrategyNotes(r.notes) : null,
    };
}
export type StrategyDetails = ReturnType<typeof formatStrategyDetails>;

export function formatRenameStrategyResult(r: Proto.RenameStrategyResponse) {
    return requireStrategy(r.strategy, "RenameStrategy");
}

export function formatStrategyRevision(r: Proto.StrategyRevision) {
    return {
        /** A decimal string, from `"1"`. */
        revision: r.revision.toString(),
        versionId: r.versionId,
        valid: r.valid,
        savedAt: ms(r.savedAt),
        savedBy: enumLabel(RevisionSavedByCodec.protoToOutput, r.savedBy),
    };
}
export type StrategyRevision = ReturnType<typeof formatStrategyRevision>;

export function formatStrategyNotes(n: Proto.StrategyNotes) {
    return {
        strategyId: formatId(n.strategyId),
        /**
         * One per save that changed them, a decimal string from `"1"`; `"0"` when never saved. It
         * counts apart from the strategy's `revision`.
         */
        notesRevision: n.notesRevision.toString(),
        /** What the strategy is, in one line. */
        summary: n.summary,
        /** Markdown. */
        body: n.body,
        /** Null when never saved. */
        savedAt: ms(n.savedAt),
        /** How the caller that saved this revision signed in; `unspecified` when never saved. */
        savedBy: enumLabel(RevisionSavedByCodec.protoToOutput, n.savedBy),
    };
}
/** The caller's notes about a strategy; never shown in a community listing, and a copy starts with none. */
export type StrategyNotes = ReturnType<typeof formatStrategyNotes>;

export function formatRunScenariosResult(r: Proto.RunScenariosResponse) {
    return {
        versionId: r.versionId,
        passed: r.passed,
        failed: r.failed,
        results: r.results.map((s) => ({
            name: s.name,
            passed: s.passed,
            expected: s.expected as JsonObject[],
            actual: s.actual as JsonObject[],
            logs: s.logs,
            error: s.error,
        })),
    };
}
export type RunStrategyScenariosResult = ReturnType<typeof formatRunScenariosResult>;

function metrics(m: Proto.BacktestMetrics | undefined) {
    if (!m) return null;
    return {
        returnPercent: m.returnPercent,
        maxDrawdownPercent: m.maxDrawdownPercent,
        trades: m.trades,
        winRatePercent: m.winRatePercent,
        fees: money(m.fees),
        exposurePercent: m.exposurePercent,
        /**
         * Annualized Sharpe ratio of the daily returns, zero risk-free rate, e.g. `"1.4"`; null with
         * fewer than two daily returns, or when they never vary.
         */
        sharpeRatio: m.sharpeRatio ?? null,
        /** Profit and loss the period's sells realized after their fees, in the quote asset. */
        realizedPnl: m.realizedPnl,
        /** When the largest fall started (its peak) and ended (its trough). */
        maxDrawdownStart: ms(m.maxDrawdownStart),
        maxDrawdownEnd: ms(m.maxDrawdownEnd),
        /** Exact equity at the period's start and end, in the quote asset; the equity curve is sampled. */
        startEquity: m.startEquity,
        endEquity: m.endEquity,
    };
}
/** Percentages and amounts are exact decimal strings, e.g. `"-3.25"`; amounts are in the quote asset. */
export type StrategyBacktestMetrics = NonNullable<ReturnType<typeof metrics>>;

const baseline = (b: Proto.Baseline) => ({ name: b.name, metrics: metrics(b.metrics) });

export const formatBacktestTrade = (t: Proto.BacktestTrade) => ({
    /** Position among the backtest's trades in fill order, a decimal string from `"0"`. */
    tradeIndex: t.tradeIndex.toString(),
    time: ms(t.time),
    market: t.market,
    side: enumLabel(StrategyOrderSideCodec.protoToOutput, t.side),
    price: t.price,
    quantity: t.quantity,
    fee: money(t.fee),
    reason: t.reason,
    /** Profit and loss it realized after its fee, in the quote asset; empty on a buy. */
    realizedPnl: t.realizedPnl,
    /** True when its market data was missing, so it filled at the first price after the gap. */
    afterGap: t.afterGap,
});
export type StrategyBacktestTrade = ReturnType<typeof formatBacktestTrade>;

function report(r: Proto.BacktestReport | undefined) {
    if (!r) return null;
    return {
        /** What was simulated and how, naming every assumption. */
        fidelity: r.fidelity,
        /** How much the result can be trusted. */
        evidenceGrade: enumLabel(EvidenceGradeCodec.protoToOutput, r.evidenceGrade),
        /** The period the bot was tuned on; the whole window when it is too short to hold months back. */
        period: window(r.period),
        /** The most recent months, held back from tuning; null when the window is too short. */
        heldBackPeriod: window(r.heldBackPeriod),
        /** Under the base cost scenario; `scenarios` gives the range. */
        metrics: metrics(r.metrics),
        /** Null without a held-back period. */
        heldBackMetrics: metrics(r.heldBackMetrics),
        /** Buy-and-hold and cash over `period`. */
        baselines: r.baselines.map(baseline),
        /** The baselines over `heldBackPeriod`; empty without one. */
        heldBackBaselines: r.heldBackBaselines.map(baseline),
        /** The result under the low, base and high cost scenarios: the range to read. */
        scenarios: r.scenarios.map((sc) => ({
            name: sc.name,
            /** Slippage per side, in basis points. */
            slippageBps: sc.slippageBps,
            metrics: metrics(sc.metrics),
            heldBackMetrics: metrics(sc.heldBackMetrics),
        })),
        /**
         * The whole window's equity curve with buy-and-hold's, oldest first: at most 1,000 sampled
         * points that keep the peaks and troughs of every largest fall reported.
         */
        equity: r.equity.map((p) => ({
            time: ms(p.time),
            equity: p.equity,
            buyAndHoldEquity: p.buyAndHoldEquity,
        })),
        /** Where `heldBackPeriod` starts on the curve; null without one. */
        heldBackStart: ms(r.heldBackStart),
        /** The whole window's largest fall, in percent, with its peak and trough. */
        windowMaxDrawdownPercent: r.windowMaxDrawdownPercent,
        windowMaxDrawdownStart: ms(r.windowMaxDrawdownStart),
        windowMaxDrawdownEnd: ms(r.windowMaxDrawdownEnd),
        /** True when earlier backtests already showed part of `heldBackPeriod`, so it is no longer excluded from tuning. */
        heldBackSeen: r.heldBackSeen,
        /** The first 20 trades of the whole window, oldest first; `listBacktestTrades` lists all of them. */
        trades: r.trades.map(formatBacktestTrade),
        dataGaps: r.dataGaps.map((g) => ({
            market: g.market,
            timeframe: g.timeframe,
            window: window(g.window),
            /** True when the bot was exposed across the gap, so the result is less certain. */
            affected: g.affected,
        })),
        warnings: r.warnings,
    };
}

export function formatStartBacktestResult(r: Proto.StartBacktestResponse) {
    return {
        backtestId: formatId(r.backtestId),
        status: enumLabel(BacktestStatusCodec.protoToOutput, r.status),
        estimatedSeconds: r.estimatedSeconds,
    };
}
export type StartStrategyBacktestResult = ReturnType<typeof formatStartBacktestResult>;

export function formatBacktest(b: Proto.Backtest) {
    return {
        backtestId: formatId(b.backtestId),
        versionId: b.versionId,
        /** `done`, `failed` and `not_backtestable` are final. */
        status: enumLabel(BacktestStatusCodec.protoToOutput, b.status),
        window: window(b.window),
        createdAt: ms(b.createdAt),
        finishedAt: ms(b.finishedAt),
        /** Set once `status` is `done`. */
        report: report(b.report),
        /** Why it failed; empty unless `status` is `failed`. */
        failure: b.failure,
        /** Backtests the caller ran of this bot's versions; many make a good result more likely luck. */
        attempts: b.attempts,
        /**
         * Why the bot cannot be backtested; `unspecified` unless `status` is `not_backtestable`. It
         * can still be proposed and deployed without a backtest.
         */
        notBacktestableReason: enumLabel(
            NotBacktestableReasonCodec.protoToOutput,
            b.notBacktestableReason,
        ),
    };
}
export type StrategyBacktest = ReturnType<typeof formatBacktest>;

function backtestSummary(b: Proto.BacktestSummary | undefined) {
    if (!b) return null;
    return {
        backtestId: formatId(b.backtestId),
        status: enumLabel(BacktestStatusCodec.protoToOutput, b.status),
        metrics: metrics(b.metrics),
        heldBackMetrics: metrics(b.heldBackMetrics),
        attempts: b.attempts,
    };
}

export function formatStrategyBacktestListItem(b: Proto.StrategyBacktest) {
    return {
        /** The backtest's headline; `getBacktest` reads the whole report. */
        summary: backtestSummary(b.summary),
        versionId: b.versionId,
        /** The newest revision of the strategy that saved `versionId`, a decimal string. */
        revision: b.revision.toString(),
        window: window(b.window),
        createdAt: ms(b.createdAt),
        /** Null until it finishes or fails. */
        finishedAt: ms(b.finishedAt),
    };
}
/** One backtest of a strategy's versions, as `listBacktests` shows it. */
export type StrategyBacktestListItem = ReturnType<typeof formatStrategyBacktestListItem>;

export function formatExplainStrategyResult(r: Proto.ExplainStrategyResponse) {
    return {
        versionId: r.versionId,
        moneyCard: moneyCard(r.moneyCard),
        settings: r.settings.map(settingField),
        scenarios: r.scenarios.map((s) => ({
            name: s.name,
            outcome: enumLabel(ScenarioOutcomeCodec.protoToOutput, s.outcome),
        })),
        backtest: backtestSummary(r.backtest),
        /** Why `backtest` is null, e.g. the bot cannot be backtested. */
        backtestAbsentReason: r.backtestAbsentReason,
        warnings: r.warnings,
        limitations: r.limitations,
    };
}
export type ExplainStrategyResult = ReturnType<typeof formatExplainStrategyResult>;

function deployProposalSummary(s: Proto.DeployProposalSummary | undefined) {
    if (!s) return null;
    return {
        versionId: s.versionId,
        /** The strategy it came from; null once that strategy is deleted. */
        strategyId: optionalId(s.strategyId),
        /** The strategy's revision, a decimal string; null once that strategy is deleted. */
        revision: s.revision === 0n ? null : s.revision.toString(),
        botName: s.botName,
        moneyCard: moneyCard(s.moneyCard),
        settings: settingValues(s.settings),
        /** Null when the main account funds the bot. */
        fundingSubaccountId: optionalId(s.fundingSubaccountId),
        funding: moneyList(s.funding),
        scenariosPassed: s.scenariosPassed,
        /** The version's latest backtest; null when the bot cannot be backtested. */
        backtest: backtestSummary(s.backtest),
        /** Why the bot was not backtested; `unspecified` when `backtest` is set. */
        notBacktestableReason: enumLabel(
            NotBacktestableReasonCodec.protoToOutput,
            s.notBacktestableReason,
        ),
    };
}

export function formatProposeDeployResult(r: Proto.ProposeDeployResponse) {
    return {
        proposalId: formatId(r.proposalId),
        /** Website page where the user deploys the bot; open it, never parse it. */
        deployUrl: r.deployUrl,
        summary: deployProposalSummary(r.summary),
        expiresAt: ms(r.expiresAt),
    };
}
export type ProposeStrategyDeployResult = ReturnType<typeof formatProposeDeployResult>;

export function formatDeployStatus(d: Proto.DeployStatus) {
    return {
        proposalId: formatId(d.proposalId),
        /** `live`, `failed` and `expired` are final. */
        state: enumLabel(DeployStateCodec.protoToOutput, d.state),
        /** The current step as the user sees it, e.g. `"Funding the account…"`. */
        step: d.step,
        /** Null until the bot exists. */
        botId: optionalId(d.botId),
        /** Null until the bot's subaccount exists. */
        subaccountId: optionalId(d.subaccountId),
        /** Why the deploy stopped; empty unless `state` is `failed`. */
        failure: d.failure,
        /** The step a `failed` deploy failed in; `unspecified` otherwise. */
        failedAt: enumLabel(DeployStateCodec.protoToOutput, d.failedAt),
        expiresAt: ms(d.expiresAt),
        updatedAt: ms(d.updatedAt),
        /**
         * What a running deploy waits for from the user; null when it waits for nothing. Do what
         * it says, then call `deployBot` again.
         */
        wait: d.wait
            ? {
                  reason: enumLabel(DeployWaitReasonCodec.protoToOutput, d.wait.reason),
                  /**
                   * With `whitelist_required`: the bot subaccount's smart account address to add to
                   * the funding account's internal whitelist; empty otherwise.
                   */
                  address: d.wait.address,
              }
            : null,
    };
}
export type StrategyDeployStatus = ReturnType<typeof formatDeployStatus>;
/** What a running deploy waits for from the user. */
export type StrategyDeployWait = NonNullable<StrategyDeployStatus["wait"]>;

export function formatDeployProposal(r: Proto.GetDeployProposalResponse) {
    if (!r.status) throw new Error("GetDeployProposal response is missing its status");
    return {
        proposalId: formatId(r.proposalId),
        summary: deployProposalSummary(r.summary),
        status: formatDeployStatus(r.status),
        createdAt: ms(r.createdAt),
        /** The funding subaccount's current label; empty when the main account funds the bot. */
        fundingSubaccountLabel: r.fundingSubaccountLabel,
    };
}
export type StrategyDeployProposal = ReturnType<typeof formatDeployProposal>;

/**
 * The strategy and revision a bot or run was deployed from, as its deploy proposal recorded them;
 * null when it has no linked strategy, e.g. once the strategy is deleted.
 */
const strategyRef = (strategyId: bigint, revision: bigint) =>
    strategyId === 0n ? null : { strategyId: formatId(strategyId), revision: revision.toString() };
export type StrategyBotStrategyRef = NonNullable<ReturnType<typeof strategyRef>>;

export function formatBot(b: Proto.Bot) {
    return {
        botId: formatId(b.botId),
        name: b.name,
        /** The bot's own subaccount. */
        subaccountId: formatId(b.subaccountId),
        status: enumLabel(BotStatusCodec.protoToOutput, b.status),
        /**
         * Why a `paused` bot paused, in words: its own message when it decided to pause, else a
         * sentence for `pauseReason`. Empty unless `paused`.
         */
        statusReason: b.statusReason,
        /** Why a `paused` bot paused; `unspecified` otherwise. */
        pauseReason: enumLabel(BotPauseReasonCodec.protoToOutput, b.pauseReason),
        versionId: b.versionId,
        /** The strategy and revision it runs; null without a linked strategy. */
        strategy: strategyRef(b.strategyId, b.revision),
        /**
         * The time of the event behind its newest decision, over all its deployments; null before
         * its first. Lags the bot by up to about a minute.
         */
        lastDecisionAt: ms(b.lastDecisionAt),
        createdAt: ms(b.createdAt),
        quoteAsset: b.quoteAsset,
        /** The markets it trades, e.g. `BTC-USDT`. */
        markets: b.markets,
        /** Where its initial funding came from; null until recorded. */
        funding: b.funding
            ? {
                  /** Null when the main account funded it. */
                  subaccountId: optionalId(b.funding.subaccountId),
                  /** The funding subaccount's current label. */
                  subaccountLabel: b.funding.subaccountLabel,
                  initialFunding: moneyList(b.funding.initialFunding),
              }
            : null,
        /** Share of the time since first deployed that it was running (paused counts), `"0"` to `"1"`. */
        uptimeRatio: b.uptimeRatio,
        /** When it last started; null unless `running`. */
        runningSince: ms(b.runningSince),
        /**
         * What it did in each of the last 24 UTC hours, oldest first, ending with the current hour;
         * an idle hour has zero counts. Counts lag the bot by up to about a minute.
         */
        activity: b.activity.map((h) => ({
            /** The hour's start, a whole UTC hour. */
            start: ms(h.start),
            /** Events the bot was called for, whether or not the call succeeded. */
            decisions: h.decisions,
            fills: h.fills,
            /** Events skipped because they were too old when it could run; never decisions. */
            expired: h.expired,
        })),
    };
}
export type StrategyBot = ReturnType<typeof formatBot>;

export function formatStopBotResult(r: Proto.StopBotResponse) {
    if (!r.bot) throw new Error("StopBot response is missing its bot");
    return {
        /** `stopping` until the stop completes, then `stopped`; poll `getBot` to follow it. */
        bot: formatBot(r.bot),
        mode: enumLabel(StopModeCodec.protoToOutput, r.mode),
    };
}
export type StopStrategyBotResult = ReturnType<typeof formatStopBotResult>;

export function formatBotVersion(b: Proto.BotVersion) {
    return {
        versionId: b.versionId,
        name: b.name,
        runtimeVersion: b.runtimeVersion,
        startedAt: ms(b.startedAt),
        /** When its stop was recorded; null for the current run. */
        stoppedAt: ms(b.stoppedAt),
        /** The strategy and revision the run ran; null without a linked strategy. */
        strategy: strategyRef(b.strategyId, b.revision),
    };
}
export type StrategyBotVersion = ReturnType<typeof formatBotVersion>;

export function formatBotDetails(r: Proto.GetBotResponse) {
    if (!r.bot) throw new Error("GetBot response is missing its bot");
    return {
        bot: formatBot(r.bot),
        moneyCard: moneyCard(r.moneyCard),
        settings: settingValues(r.settings),
        /** Its last decisions, newest first, from its current run: at most 20. */
        decisions: r.decisions.map((d) => ({
            /** When the event that woke the bot reached it. */
            decidedAt: ms(d.decidedAt),
            /** The handler the event woke, e.g. `on_timer`. */
            event: d.event,
            /** The orders it asked for, in the behaviour examples' shape; empty when it did nothing. */
            orders: d.orders as JsonObject[],
            /** Its log lines from the call, oldest first: at most 20, shortened ones ending with `…`. */
            logs: d.logs,
        })),
        /** Its last errors, newest first, from its current run: at most 20. */
        errors: r.errors.map((e) => ({ time: ms(e.time), event: e.event, message: e.message })),
    };
}
export type StrategyBotDetails = ReturnType<typeof formatBotDetails>;

export function formatBotLogEntry(e: Proto.BotLogEntry) {
    return {
        /** Increasing within the log of the bot's current deployment; a new deployment starts low again. */
        sequence: e.sequence.toString(),
        time: ms(e.time),
        kind: enumLabel(BotLogKindCodec.protoToOutput, e.kind),
        message: e.message,
    };
}
export type StrategyBotLogEntry = ReturnType<typeof formatBotLogEntry>;

export function formatBotFundsReturn(r: Proto.BotFundsReturn) {
    return {
        returnId: formatId(r.returnId),
        botId: formatId(r.botId),
        /** Poll `getBotFundsReturn` while `processing`. */
        status: enumLabel(BotFundsReturnStatusCodec.protoToOutput, r.status),
        /** Confirmed amounts moved to the main account so far, one per asset; grows while `processing`. */
        assets: moneyList(r.assets),
        requestedAt: ms(r.requestedAt),
        /** When it completed or ended with nothing moved; null while `processing`. */
        finishedAt: ms(r.finishedAt),
        /**
         * What the bot's open orders still hold on its subaccount, one per asset; the return takes
         * it as the orders fill or end. Empty once it finished.
         */
        held: moneyList(r.held),
    };
}
/** A return of a stopped bot's available balances to its owner's main account. */
export type StrategyBotFundsReturn = ReturnType<typeof formatBotFundsReturn>;

export function formatForkStrategyResult(r: Proto.ForkStrategyResponse) {
    return {
        /** The new strategy: the published version is its revision 1, and its `origin` names the listing. */
        strategy: requireStrategy(r.strategy, "ForkStrategy"),
        /** Revision 1's check result, as the listing published it. */
        version: versionValidation(r.version),
    };
}
export type ForkStrategyResult = ReturnType<typeof formatForkStrategyResult>;

function communityBacktest(b: Proto.CommunityBacktest | undefined) {
    if (!b) return null;
    return {
        /** `queued` or `running` until it finishes; `done`, `failed` and `not_backtestable` are final. */
        status: enumLabel(BacktestStatusCodec.protoToOutput, b.status),
        /** Why the bot can't be backtested; `unspecified` unless `status` is `not_backtestable`. */
        notBacktestableReason: enumLabel(
            NotBacktestableReasonCodec.protoToOutput,
            b.notBacktestableReason,
        ),
        /** The simulated window; null when the bot can't be backtested and it never started. */
        window: window(b.window),
        /** The base cost scenario's results over the report's period; null unless `done`. */
        metrics: metrics(b.metrics),
        /** The whole report, once `done`; `getCommunity` sets it, lists never do. */
        report: report(b.report),
        /** Why it failed; empty unless `status` is `failed`. */
        failure: b.failure,
    };
}
/**
 * The platform's backtest of a listing's published version, started at each publish: the default
 * window, default settings, 1,000 of the quote asset and the standard fees, so listings compare
 * alike. It shows nothing of the author's own backtests.
 */
export type CommunityStrategyBacktest = NonNullable<ReturnType<typeof communityBacktest>>;

const strategyTags = (tags: Proto.StrategyTag[]) =>
    tags.map((tag) => enumLabel(StrategyTagCodec.protoToOutput, tag));

export function formatCommunityStrategySummary(s: Proto.CommunityStrategySummary) {
    return {
        listingId: formatId(s.listingId),
        title: s.title,
        tags: strategyTags(s.tags),
        /** The markets the published version trades, e.g. `BTC-USDT`. */
        markets: s.markets,
        /** The author's current username. */
        authorUsername: s.authorUsername,
        /** Accounts that forked it, each once; its author's own copies never count. */
        forks: s.forks,
        /** The platform backtest of the published version, without its report. */
        backtest: communityBacktest(s.backtest),
        /** When the shown version was published. */
        publishedAt: ms(s.publishedAt),
    };
}
/** One public community listing, as `listCommunity` shows it. */
export type CommunityStrategySummary = ReturnType<typeof formatCommunityStrategySummary>;

export function formatCommunityStrategy(s: Proto.CommunityStrategy) {
    return {
        listingId: formatId(s.listingId),
        title: s.title,
        description: s.description,
        tags: strategyTags(s.tags),
        /** The markets the published version trades, e.g. `BTC-USDT`. */
        markets: s.markets,
        /** The author's current username. */
        authorUsername: s.authorUsername,
        /** When the shown version was published. */
        publishedAt: ms(s.publishedAt),
        versionId: s.versionId,
        /** The runtime version it was checked against. */
        runtimeVersion: s.runtimeVersion,
        manifest: (s.manifest ?? {}) as JsonObject,
        code: s.code,
        /** The settings a user may change, at the version's defaults; never the author's values. */
        settingsForm: s.settingsForm.map(settingField),
        moneyCard: moneyCard(s.moneyCard),
        /** Null for a version stored before flows existed. */
        flow: flow(s.flow),
        /** The platform backtest of the published version, with its report once `done`. */
        backtest: communityBacktest(s.backtest),
        /** Accounts that forked it, each once; its author's own copies never count. */
        forks: s.forks,
        /**
         * The listing it was forked from; null when it wasn't forked. `listingId` is null once the
         * source isn't public, with `title` and `authorUsername` empty: show "forked from a
         * community strategy" then.
         */
        forkedFrom: s.forkedFrom
            ? {
                  listingId: optionalId(s.forkedFrom.listingId),
                  title: s.forkedFrom.title,
                  authorUsername: s.forkedFrom.authorUsername,
              }
            : null,
    };
}
/** One public community listing with its published version; nothing of its author's account. */
export type CommunityStrategy = ReturnType<typeof formatCommunityStrategy>;

/**
 * Most recently published first, then by listing ID, descending; an empty `nextPageToken` means
 * no more.
 */
export type ListCommunityStrategiesResult = {
    strategies: CommunityStrategySummary[];
    nextPageToken: string;
};
/**
 * `statusCounts` counts all the caller's bots per status, on every page, listing only statuses
 * that have a bot; it is not a pagination total. An empty `nextPageToken` means no more.
 */
export type ListStrategyBotsResult = {
    bots: StrategyBot[];
    nextPageToken: string;
    statusCounts: { status: StrategyBot["status"]; count: number }[];
};
/** Newest run first, one entry per run; an empty `nextPageToken` means no more. */
export type ListStrategyBotVersionsResult = {
    versions: StrategyBotVersion[];
    nextPageToken: string;
};
/** Most recently saved or renamed first; an empty `nextPageToken` means no more. */
export type ListStrategiesResult = { strategies: Strategy[]; nextPageToken: string };
/** Newest first; an empty `nextPageToken` means no more. */
export type ListStrategyRevisionsResult = {
    revisions: StrategyRevision[];
    nextPageToken: string;
};
/** Newest first; an empty `nextPageToken` means no more. */
export type ListStrategyNotesRevisionsResult = {
    revisions: StrategyNotes[];
    nextPageToken: string;
};
/** Newest first, each kept 30 days after it finished; an empty `nextPageToken` means no more. */
export type ListStrategyBacktestsResult = {
    backtests: StrategyBacktestListItem[];
    nextPageToken: string;
};
/** In `tradeIndex` order; an empty `nextPageToken` means no more. */
export type ListStrategyBacktestTradesResult = {
    trades: StrategyBacktestTrade[];
    nextPageToken: string;
};
/**
 * Oldest first, in increasing `sequence`; an empty `nextPageToken` means no more for now.
 * `followToken`, set on the last page, reads what the same deployment writes later: pass it as
 * `pageToken`, now or later. `deployedAgain` means a new run started a new log, read by listing
 * again without `pageToken`; this log can still grow, and `followToken` keeps reading it.
 */
export type ListStrategyBotLogsResult = {
    entries: StrategyBotLogEntry[];
    nextPageToken: string;
    followToken: string;
    deployedAgain: boolean;
};
