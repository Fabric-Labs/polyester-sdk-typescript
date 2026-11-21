import type { JsonObject } from "@bufbuild/protobuf";
import * as v from "valibot";
import type * as Proto from "../../gen/strategies/v1/strategies_pb.js";
import { enumLabel } from "../../shared/proto-enum-codec.js";
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
    BotLogKindCodec,
    BotStatusCodec,
    BotPauseReasonCodec,
    DeployStateCodec,
    FlowNodeKindCodec,
    RevisionSavedByCodec,
    STRATEGY_BOT_STOP_MODE_VALUES,
    ScenarioOutcomeCodec,
    StopModeCodec,
    StrategyOrderSideCodec,
} from "./strategies.codecs.js";

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

const TrimmedStringSchema = v.pipe(v.string(), v.trim());
const RequiredStringSchema = v.pipe(v.string(), v.trim(), v.minLength(1));
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
        idempotencyKey: RequiredStringSchema,
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

export const SaveDraftVersionInputSchema = v.strictObject({
    strategyId: StrategyIdSchema,
    /** The strategy's `revision` this draft was made from, as a decimal string; `"0"` for its first save. */
    expectedRevision: v.pipe(
        bigintStringInputSchema("expectedRevision"),
        v.maxValue(PROTOBUF_UINT64_MAX, "expectedRevision exceeds the uint64 range"),
    ),
    /** The save renames the strategy to it. */
    name: RequiredStringSchema,
    /** The manifest as a JSON object shaped like `getReference`'s `manifestSchema`. */
    manifest: JsonObjectSchema,
    /** The bot code, UTF-8. */
    code: v.string(),
    /** Omit for the current runtime version. */
    runtimeVersion: v.optional(TrimmedStringSchema, ""),
    /** Reusing a key with the same request returns the revision it saved. */
    idempotencyKey: v.optional(TrimmedStringSchema, ""),
});
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
    /** Window start, epoch ms, inclusive. Omit for the start of the longest window with data. */
    startTime: v.optional(TimestampMsInputSchema),
    /** Window end, epoch ms, exclusive. Omit for the end of that window. */
    endTime: v.optional(TimestampMsInputSchema),
    /** Settings form values, each setting once; settings left out take their default. */
    settings: v.optional(v.array(SettingValueInputSchema), []),
    /** Starting balances, one per asset. Omit for the budget setting in the quote asset. */
    initialBalances: v.optional(v.array(MoneyInputSchema), []),
    /** Reusing a key with the same request returns the backtest it started. */
    idempotencyKey: RequiredStringSchema,
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
        idempotencyKey: RequiredStringSchema,
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

const LimitInputSchema = v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(200)),
);

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
        idempotencyKey: RequiredStringSchema,
    }),
    v.transform(({ mode, ...input }) => ({ ...input, mode: StopModeCodec.inputToProto[mode] })),
);
export type StopBotInput = v.InferInput<typeof StopBotInputSchema>;

export const ListBotLogsInputSchema = v.strictObject({
    botId: idInputSchema("botId"),
    /** Earliest entry, epoch ms, inclusive. Omit for the start of the retained log. */
    startTime: v.optional(TimestampMsInputSchema),
    /** Page size: default 100, at most 200. */
    limit: LimitInputSchema,
    /** Previous `nextPageToken`; reuse only with the same `botId` and `startTime`. */
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
    };
}
export type StrategyVersion = ReturnType<typeof formatStrategyVersion>;

function origin(o: Proto.StrategyOrigin | undefined) {
    switch (o?.source.case) {
        case "templateId":
            return { kind: "template" as const, templateId: o.source.value };
        case "duplicate":
            return { kind: "duplicate" as const, sourceVersionId: o.source.value.sourceVersionId };
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
         * The newest bot deployed from it that hasn't stopped (`running` or `stopping`); null when
         * none, or when the caller may not read bots.
         */
        bot: s.bot
            ? {
                  botId: formatId(s.bot.botId),
                  status: enumLabel(BotStatusCodec.protoToOutput, s.bot.status),
              }
            : null,
    };
}
export type Strategy = ReturnType<typeof formatStrategy>;

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
    };
}
/** Percentages are exact decimal strings, e.g. `"-3.25"`. */
export type StrategyBacktestMetrics = NonNullable<ReturnType<typeof metrics>>;

function report(r: Proto.BacktestReport | undefined) {
    if (!r) return null;
    return {
        fidelity: r.fidelity,
        evidenceGrade: r.evidenceGrade,
        period: window(r.period),
        heldBackPeriod: window(r.heldBackPeriod),
        metrics: metrics(r.metrics),
        heldBackMetrics: metrics(r.heldBackMetrics),
        baselines: r.baselines.map((b) => ({ name: b.name, metrics: metrics(b.metrics) })),
        attempts: r.attempts,
        trades: r.trades.map((t) => ({
            time: ms(t.time),
            market: t.market,
            side: enumLabel(StrategyOrderSideCodec.protoToOutput, t.side),
            price: t.price,
            quantity: t.quantity,
            fee: money(t.fee),
            reason: t.reason,
        })),
        dataGaps: r.dataGaps.map((g) => ({
            market: g.market,
            timeframe: g.timeframe,
            window: window(g.window),
        })),
        warnings: r.warnings,
        reportUrl: r.reportUrl,
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
        /** `done` and `failed` are final. */
        status: enumLabel(BacktestStatusCodec.protoToOutput, b.status),
        window: window(b.window),
        createdAt: ms(b.createdAt),
        finishedAt: ms(b.finishedAt),
        /** Set once `status` is `done`. */
        report: report(b.report),
        /** Why it failed; empty unless `status` is `failed`. */
        failure: b.failure,
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
        reportUrl: b.reportUrl,
    };
}

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
        backtest: backtestSummary(s.backtest),
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
    };
}
export type StrategyDeployStatus = ReturnType<typeof formatDeployStatus>;

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

export function formatBot(b: Proto.Bot) {
    return {
        botId: formatId(b.botId),
        name: b.name,
        /** The bot's own subaccount. */
        subaccountId: formatId(b.subaccountId),
        status: enumLabel(BotStatusCodec.protoToOutput, b.status),
        /** Empty when `running`. */
        statusReason: b.statusReason,
        /** Why a `paused` bot paused; `unspecified` otherwise. */
        pauseReason: enumLabel(BotPauseReasonCodec.protoToOutput, b.pauseReason),
        versionId: b.versionId,
        /** Since deployment, an exact decimal in `quoteAsset`; negative for a loss. */
        profitAndLoss: b.profitAndLoss,
        lastDecisionAt: ms(b.lastDecisionAt),
        createdAt: ms(b.createdAt),
        quoteAsset: b.quoteAsset,
        /** The markets it trades, e.g. `BTC/USDT`. */
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
    };
}
export type StrategyBotVersion = ReturnType<typeof formatBotVersion>;

export function formatBotDetails(r: Proto.GetBotResponse) {
    if (!r.bot) throw new Error("GetBot response is missing its bot");
    return {
        bot: formatBot(r.bot),
        moneyCard: moneyCard(r.moneyCard),
        settings: settingValues(r.settings),
        balances: r.balances.map((b) => ({ asset: b.asset, free: b.free, locked: b.locked })),
        openOrders: r.openOrders.map((o) => ({
            orderId: formatId(o.orderId),
            market: o.market,
            side: enumLabel(StrategyOrderSideCodec.protoToOutput, o.side),
            type: o.type,
            price: o.price,
            quantity: o.quantity,
            filledQuantity: o.filledQuantity,
            createdAt: ms(o.createdAt),
        })),
        decisions: r.decisions.map((d) => ({
            decidedAt: ms(d.decidedAt),
            event: d.event,
            orders: d.orders as JsonObject[],
            logs: d.logs,
            snapshot: (d.snapshot ?? null) as JsonObject | null,
        })),
        errors: r.errors.map((e) => ({ time: ms(e.time), event: e.event, message: e.message })),
    };
}
export type StrategyBotDetails = ReturnType<typeof formatBotDetails>;

export function formatBotLogEntry(e: Proto.BotLogEntry) {
    return {
        sequence: e.sequence.toString(),
        time: ms(e.time),
        kind: enumLabel(BotLogKindCodec.protoToOutput, e.kind),
        message: e.message,
    };
}
export type StrategyBotLogEntry = ReturnType<typeof formatBotLogEntry>;

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
/** Oldest first; an empty `nextPageToken` means no more. */
export type ListStrategyBotLogsResult = { entries: StrategyBotLogEntry[]; nextPageToken: string };
