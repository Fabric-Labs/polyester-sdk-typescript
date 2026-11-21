import * as Proto from "../../gen/strategies/v1/strategies_pb.js";
import type { InputToProto, ProtoToOutput } from "../../utils/types.js";

export const STRATEGY_BACKTEST_STATUS_VALUES = ["queued", "running", "done", "failed"] as const;
export type StrategyBacktestStatus = (typeof STRATEGY_BACKTEST_STATUS_VALUES)[number];

export const BacktestStatusCodec = {
    protoToOutput: {
        [Proto.Backtest_Status.STATUS_UNSPECIFIED]: "unspecified",
        [Proto.Backtest_Status.QUEUED]: "queued",
        [Proto.Backtest_Status.RUNNING]: "running",
        [Proto.Backtest_Status.DONE]: "done",
        [Proto.Backtest_Status.FAILED]: "failed",
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
] as const;
export type StrategyBotPauseReason = (typeof STRATEGY_BOT_PAUSE_REASON_VALUES)[number];

export const BotPauseReasonCodec = {
    protoToOutput: {
        [Proto.Bot_PauseReason.PAUSE_REASON_UNSPECIFIED]: "unspecified",
        [Proto.Bot_PauseReason.BOT_DECIDED]: "bot_decided",
        [Proto.Bot_PauseReason.FAILURES_IN_A_ROW]: "failures_in_a_row",
        [Proto.Bot_PauseReason.ENVIRONMENT_RESET]: "environment_reset",
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

export const StrategyOrderSideCodec = {
    protoToOutput: {
        [Proto.OrderSide.SIDE_UNSPECIFIED]: "unspecified",
        [Proto.OrderSide.BUY]: "buy",
        [Proto.OrderSide.SELL]: "sell",
    } satisfies ProtoToOutput<Proto.OrderSide, "buy" | "sell">,
} as const;
