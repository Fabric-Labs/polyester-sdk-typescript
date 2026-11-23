import * as Proto from "../../gen/strategies/v1/strategies_pb.js";
import type { InputToProto, ProtoToOutput } from "../../utils/types.js";

export const STRATEGY_BACKTEST_STATUS_VALUES = [
    "queued",
    "running",
    "done",
    "failed",
    "not_backtestable",
] as const;
/** `done`, `failed` and `not_backtestable` are final. */
export type StrategyBacktestStatus = (typeof STRATEGY_BACKTEST_STATUS_VALUES)[number];

export const BacktestStatusCodec = {
    protoToOutput: {
        [Proto.Backtest_Status.STATUS_UNSPECIFIED]: "unspecified",
        [Proto.Backtest_Status.QUEUED]: "queued",
        [Proto.Backtest_Status.RUNNING]: "running",
        [Proto.Backtest_Status.DONE]: "done",
        [Proto.Backtest_Status.FAILED]: "failed",
        [Proto.Backtest_Status.NOT_BACKTESTABLE]: "not_backtestable",
    } satisfies ProtoToOutput<Proto.Backtest_Status, StrategyBacktestStatus>,
} as const;

export const STRATEGY_SCENARIO_OUTCOME_VALUES = ["not_run", "passed", "failed"] as const;
export type StrategyScenarioOutcome = (typeof STRATEGY_SCENARIO_OUTCOME_VALUES)[number];

export const ScenarioOutcomeCodec = {
    protoToOutput: {
        [Proto.ScenarioSummary_Outcome.OUTCOME_UNSPECIFIED]: "unspecified",
        [Proto.ScenarioSummary_Outcome.NOT_RUN]: "not_run",
        [Proto.ScenarioSummary_Outcome.PASSED]: "passed",
        [Proto.ScenarioSummary_Outcome.FAILED]: "failed",
    } satisfies ProtoToOutput<Proto.ScenarioSummary_Outcome, StrategyScenarioOutcome>,
} as const;

export const STRATEGY_DEPLOY_STATE_VALUES = [
    "proposed",
    "validating",
    "creating_subaccount",
    "setting_access",
    "funding",
    "deploying",
    "live",
    "failed",
    "expired",
] as const;
/** `live`, `failed` and `expired` are final. */
export type StrategyDeployState = (typeof STRATEGY_DEPLOY_STATE_VALUES)[number];

export const DeployStateCodec = {
    protoToOutput: {
        [Proto.DeployStatus_State.STATE_UNSPECIFIED]: "unspecified",
        [Proto.DeployStatus_State.PROPOSED]: "proposed",
        [Proto.DeployStatus_State.VALIDATING]: "validating",
        [Proto.DeployStatus_State.CREATING_SUBACCOUNT]: "creating_subaccount",
        [Proto.DeployStatus_State.SETTING_ACCESS]: "setting_access",
        [Proto.DeployStatus_State.FUNDING]: "funding",
        [Proto.DeployStatus_State.DEPLOYING]: "deploying",
        [Proto.DeployStatus_State.LIVE]: "live",
        [Proto.DeployStatus_State.FAILED]: "failed",
        [Proto.DeployStatus_State.EXPIRED]: "expired",
    } satisfies ProtoToOutput<Proto.DeployStatus_State, StrategyDeployState>,
} as const;

export const STRATEGY_BOT_STATUS_VALUES = [
    "deploying",
    "running",
    "stopping",
    "stopped",
    "paused",
] as const;
export type StrategyBotStatus = (typeof STRATEGY_BOT_STATUS_VALUES)[number];

export const BotStatusCodec = {
    protoToOutput: {
        [Proto.Bot_Status.STATUS_UNSPECIFIED]: "unspecified",
        [Proto.Bot_Status.DEPLOYING]: "deploying",
        [Proto.Bot_Status.RUNNING]: "running",
        [Proto.Bot_Status.STOPPING]: "stopping",
        [Proto.Bot_Status.STOPPED]: "stopped",
        [Proto.Bot_Status.PAUSED]: "paused",
    } satisfies ProtoToOutput<Proto.Bot_Status, StrategyBotStatus>,
} as const;

export const STRATEGY_BOT_PAUSE_REASON_VALUES = [
    "bot_decided",
    "failures_in_a_row",
    "environment_reset",
    "unrecorded_order",
] as const;
export type StrategyBotPauseReason = (typeof STRATEGY_BOT_PAUSE_REASON_VALUES)[number];

export const BotPauseReasonCodec = {
    protoToOutput: {
        [Proto.Bot_PauseReason.PAUSE_REASON_UNSPECIFIED]: "unspecified",
        [Proto.Bot_PauseReason.BOT_DECIDED]: "bot_decided",
        [Proto.Bot_PauseReason.FAILURES_IN_A_ROW]: "failures_in_a_row",
        [Proto.Bot_PauseReason.ENVIRONMENT_RESET]: "environment_reset",
        [Proto.Bot_PauseReason.UNRECORDED_ORDER]: "unrecorded_order",
    } satisfies ProtoToOutput<Proto.Bot_PauseReason, StrategyBotPauseReason>,
} as const;

export const STRATEGY_BOT_STOP_MODE_VALUES = ["keep_orders", "cancel_orders"] as const;
/** `keep_orders` hands the bot's open orders to its subaccount; `cancel_orders` cancels them. */
export type StrategyBotStopMode = (typeof STRATEGY_BOT_STOP_MODE_VALUES)[number];

export const StopModeCodec = {
    inputToProto: {
        keep_orders: Proto.StopMode.KEEP_ORDERS,
        cancel_orders: Proto.StopMode.CANCEL_ORDERS,
    } satisfies InputToProto<StrategyBotStopMode, Proto.StopMode>,
    protoToOutput: {
        [Proto.StopMode.STOP_UNSPECIFIED]: "unspecified",
        [Proto.StopMode.KEEP_ORDERS]: "keep_orders",
        [Proto.StopMode.CANCEL_ORDERS]: "cancel_orders",
    } satisfies ProtoToOutput<Proto.StopMode, StrategyBotStopMode>,
} as const;

export const STRATEGY_FLOW_NODE_KIND_VALUES = ["trigger", "condition", "action"] as const;
export type StrategyFlowNodeKind = (typeof STRATEGY_FLOW_NODE_KIND_VALUES)[number];

export const FlowNodeKindCodec = {
    protoToOutput: {
        [Proto.FlowNode_Kind.KIND_UNSPECIFIED]: "unspecified",
        [Proto.FlowNode_Kind.TRIGGER]: "trigger",
        [Proto.FlowNode_Kind.CONDITION]: "condition",
        [Proto.FlowNode_Kind.ACTION]: "action",
    } satisfies ProtoToOutput<Proto.FlowNode_Kind, StrategyFlowNodeKind>,
} as const;

export const STRATEGY_REVISION_SAVED_BY_VALUES = ["session", "api_key", "connected_app"] as const;
/** How the caller that saved a draft signed in. */
export type StrategyRevisionSavedBy = (typeof STRATEGY_REVISION_SAVED_BY_VALUES)[number];

export const RevisionSavedByCodec = {
    protoToOutput: {
        [Proto.StrategyRevision_SavedBy.SAVED_BY_UNSPECIFIED]: "unspecified",
        [Proto.StrategyRevision_SavedBy.SESSION]: "session",
        [Proto.StrategyRevision_SavedBy.API_KEY]: "api_key",
        [Proto.StrategyRevision_SavedBy.CONNECTED_APP]: "connected_app",
    } satisfies ProtoToOutput<Proto.StrategyRevision_SavedBy, StrategyRevisionSavedBy>,
} as const;

export const STRATEGY_BOT_LOG_KIND_VALUES = ["log", "decision", "error"] as const;
export type StrategyBotLogKind = (typeof STRATEGY_BOT_LOG_KIND_VALUES)[number];

export const BotLogKindCodec = {
    protoToOutput: {
        [Proto.BotLogEntry_Kind.KIND_UNSPECIFIED]: "unspecified",
        [Proto.BotLogEntry_Kind.LOG]: "log",
        [Proto.BotLogEntry_Kind.DECISION]: "decision",
        [Proto.BotLogEntry_Kind.ERROR]: "error",
    } satisfies ProtoToOutput<Proto.BotLogEntry_Kind, StrategyBotLogKind>,
} as const;

export const STRATEGY_EVIDENCE_GRADE_VALUES = ["not_enough", "low", "medium", "high"] as const;
/** How much a backtest's result can be trusted, from `not_enough` to `high`. */
export type StrategyEvidenceGrade = (typeof STRATEGY_EVIDENCE_GRADE_VALUES)[number];

export const EvidenceGradeCodec = {
    protoToOutput: {
        [Proto.EvidenceGrade.EVIDENCE_GRADE_UNSPECIFIED]: "unspecified",
        [Proto.EvidenceGrade.NOT_ENOUGH]: "not_enough",
        [Proto.EvidenceGrade.LOW]: "low",
        [Proto.EvidenceGrade.MEDIUM]: "medium",
        [Proto.EvidenceGrade.HIGH]: "high",
    } satisfies ProtoToOutput<Proto.EvidenceGrade, StrategyEvidenceGrade>,
} as const;

export const STRATEGY_NOT_BACKTESTABLE_REASON_VALUES = [
    "reacts_to_trades_or_quotes",
    "reads_social_signals",
    "mixed_quote_assets",
    "no_reference_candles",
    "places_limit_orders",
    "reads_volume",
] as const;
/** Why a bot cannot be backtested on candles; it can still be proposed and deployed without one. */
export type StrategyNotBacktestableReason =
    (typeof STRATEGY_NOT_BACKTESTABLE_REASON_VALUES)[number];

export const NotBacktestableReasonCodec = {
    protoToOutput: {
        [Proto.NotBacktestableReason.NOT_BACKTESTABLE_REASON_UNSPECIFIED]: "unspecified",
        [Proto.NotBacktestableReason.REACTS_TO_TRADES_OR_QUOTES]: "reacts_to_trades_or_quotes",
        [Proto.NotBacktestableReason.READS_SOCIAL_SIGNALS]: "reads_social_signals",
        [Proto.NotBacktestableReason.MIXED_QUOTE_ASSETS]: "mixed_quote_assets",
        [Proto.NotBacktestableReason.NO_REFERENCE_CANDLES]: "no_reference_candles",
        [Proto.NotBacktestableReason.PLACES_LIMIT_ORDERS]: "places_limit_orders",
        [Proto.NotBacktestableReason.READS_VOLUME]: "reads_volume",
    } satisfies ProtoToOutput<Proto.NotBacktestableReason, StrategyNotBacktestableReason>,
} as const;

export const StrategyOrderSideCodec = {
    protoToOutput: {
        [Proto.OrderSide.SIDE_UNSPECIFIED]: "unspecified",
        [Proto.OrderSide.BUY]: "buy",
        [Proto.OrderSide.SELL]: "sell",
    } satisfies ProtoToOutput<Proto.OrderSide, "buy" | "sell">,
} as const;
