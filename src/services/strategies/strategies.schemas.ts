import type { JsonObject } from "@bufbuild/protobuf";
import * as v from "valibot";
import type * as Proto from "../../gen/strategies/v1/strategies_pb.js";
import { enumLabel } from "../../shared/proto-enum-codec.js";
import { JsonObjectSchema, idInputSchema } from "../../shared/schemas.js";
import { formatId } from "../../utils/base58-id.js";
import { tsObjToMs } from "../../utils/time.js";
import { msToTimestamp } from "../../utils/timestamp.js";
import {
    BacktestStatusCodec,
    BotLogKindCodec,
    BotStatusCodec,
    DeployStateCodec,
    ScenarioOutcomeCodec,
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

export const ValidateStrategyInputSchema = v.strictObject({
    name: RequiredStringSchema,
    /** The manifest as a JSON object shaped like `getReference`'s `manifestSchema`. */
    manifest: JsonObjectSchema,
    /** The bot code, UTF-8. */
    code: v.string(),
    /** Omit for the current runtime version. */
    runtimeVersion: v.optional(TrimmedStringSchema, ""),
});
export type ValidateStrategyInput = v.InferInput<typeof ValidateStrategyInputSchema>;

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
        versionId: VersionIdInputSchema,
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

export const BotIdInputSchema = v.strictObject({ botId: idInputSchema("botId") });
export type StrategyBotInput = v.InferInput<typeof BotIdInputSchema>;

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
                  uniqueIndicatorSettings: r.limits.uniqueIndicatorSettings,
                  backtestsPerDay: r.limits.backtestsPerDay,
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

const settingValues = (list: Proto.SettingValue[]) =>
    list.map((s) => ({ name: s.name, value: s.value }));

export function formatValidateStrategyResult(r: Proto.ValidateStrategyResponse) {
    return {
        /** Same runtime version, manifest and code always give the same version. */
        versionId: r.versionId,
        runtimeVersion: r.runtimeVersion,
        /** False means fix `errors` and validate again; it is not a thrown error. */
        valid: r.valid,
        errors: r.errors.map(issue),
        warnings: r.warnings.map(issue),
        moneyCard: moneyCard(r.moneyCard),
        settingsForm: r.settingsForm.map(settingField),
    };
}
export type ValidateStrategyResult = ReturnType<typeof formatValidateStrategyResult>;

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

export function formatProposeDeployResult(r: Proto.ProposeDeployResponse) {
    const s = r.summary;
    return {
        proposalId: formatId(r.proposalId),
        /** Website page where the user deploys the bot with MFA and a wallet signature. */
        deployUrl: r.deployUrl,
        summary: s
            ? {
                  versionId: s.versionId,
                  botName: s.botName,
                  moneyCard: moneyCard(s.moneyCard),
                  settings: settingValues(s.settings),
                  /** Null when the main account funds the bot. */
                  fundingSubaccountId: optionalId(s.fundingSubaccountId),
                  funding: moneyList(s.funding),
                  scenariosPassed: s.scenariosPassed,
                  backtest: backtestSummary(s.backtest),
              }
            : null,
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
        expiresAt: ms(d.expiresAt),
        updatedAt: ms(d.updatedAt),
    };
}
export type StrategyDeployStatus = ReturnType<typeof formatDeployStatus>;

export function formatBot(b: Proto.Bot) {
    return {
        botId: formatId(b.botId),
        name: b.name,
        /** The bot's own subaccount. */
        subaccountId: formatId(b.subaccountId),
        status: enumLabel(BotStatusCodec.protoToOutput, b.status),
        /** Empty when `running`. */
        statusReason: b.statusReason,
        versionId: b.versionId,
        /** Since deployment, an exact decimal in `quoteAsset`; negative for a loss. */
        profitAndLoss: b.profitAndLoss,
        lastDecisionAt: ms(b.lastDecisionAt),
        createdAt: ms(b.createdAt),
        quoteAsset: b.quoteAsset,
    };
}
export type StrategyBot = ReturnType<typeof formatBot>;

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

/** An empty `nextPageToken` means no more. */
export type ListStrategyBotsResult = { bots: StrategyBot[]; nextPageToken: string };
/** Oldest first; an empty `nextPageToken` means no more. */
export type ListStrategyBotLogsResult = { entries: StrategyBotLogEntry[]; nextPageToken: string };
