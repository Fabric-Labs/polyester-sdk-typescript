import {
    FlowDomain,
    FlowKind,
    FlowState,
    LifecycleSource,
    RequestFeeStatus,
} from "../../gen/chain/lifecycle/v1/types_pb.js";
import {
    FlowStep,
    FlowStepActivityKind,
    FlowTimelineStatus,
    ListScope,
    TxLookupKind,
} from "../../gen/chain/lifecycle/v1/lifecycle_read_pb.js";

export const LIFECYCLE_FLOW_KIND_VALUES = ["deposit", "withdraw", "transfer"] as const;
export type LifecycleFlowKindValue = (typeof LIFECYCLE_FLOW_KIND_VALUES)[number];
export type LifecycleFlowKindOutputValue = "unspecified" | LifecycleFlowKindValue;

export const LIFECYCLE_FLOW_STATE_VALUES = [
    "pending_source",
    "pending_polyester_chain",
    "pending_ledger",
    "completed",
    "failed",
    "dropped",
    "refunded",
] as const;
export type LifecycleFlowStateValue = (typeof LIFECYCLE_FLOW_STATE_VALUES)[number];
export type LifecycleFlowStateOutputValue = "unspecified" | LifecycleFlowStateValue;

export const LIFECYCLE_LIST_SCOPE_VALUES = ["all", "open", "terminal"] as const;
export type LifecycleListScopeValue = (typeof LIFECYCLE_LIST_SCOPE_VALUES)[number];
export type LifecycleListScopeOutputValue = "unspecified" | LifecycleListScopeValue;

export const LIFECYCLE_TX_LOOKUP_KIND_VALUES = ["source", "any"] as const;
export type LifecycleTxLookupKindValue = (typeof LIFECYCLE_TX_LOOKUP_KIND_VALUES)[number];
export type LifecycleTxLookupKindOutputValue = "unspecified" | LifecycleTxLookupKindValue;

export const LIFECYCLE_FLOW_STEP_VALUES = [
    "unspecified",
    "source",
    "transfer",
    "request",
    "validation",
    "execution",
    "asset_burned",
    "dropped",
    "failed",
    "refunded",
    "fulfilling",
    "settlement",
] as const;
export type LifecycleFlowStepValue = (typeof LIFECYCLE_FLOW_STEP_VALUES)[number];

export const LIFECYCLE_SOURCE_VALUES = [
    "unspecified",
    "relayer",
    "polyester_chain",
    "executor",
    "ledger",
] as const;
export type LifecycleSourceValue = (typeof LIFECYCLE_SOURCE_VALUES)[number];

export const LIFECYCLE_FLOW_STEP_ACTIVITY_KIND_VALUES = [
    "unspecified",
    "minted",
    "funding",
    "trading",
] as const;
export type LifecycleFlowStepActivityKindValue =
    (typeof LIFECYCLE_FLOW_STEP_ACTIVITY_KIND_VALUES)[number];

export const LIFECYCLE_FLOW_TIMELINE_STATUS_VALUES = [
    "unspecified",
    "completed",
    "current",
    "planned",
] as const;
export type LifecycleFlowTimelineStatusValue =
    (typeof LIFECYCLE_FLOW_TIMELINE_STATUS_VALUES)[number];

export const LIFECYCLE_REQUEST_FEE_STATUS_VALUES = ["unspecified", "locked", "settled"] as const;
export type LifecycleRequestFeeStatusValue = (typeof LIFECYCLE_REQUEST_FEE_STATUS_VALUES)[number];

export const LIFECYCLE_FLOW_DOMAIN_VALUES = [
    "external_chain",
    "zipper",
    "funding",
    "trading",
    "lending",
] as const;
export type LifecycleFlowDomainValue = (typeof LIFECYCLE_FLOW_DOMAIN_VALUES)[number];
export type LifecycleFlowDomainOutputValue = "unspecified" | LifecycleFlowDomainValue;

export const LifecycleFlowDomainCodec = {
    protoToOutput: {
        [FlowDomain.DOMAIN_UNSPECIFIED]: "unspecified",
        [FlowDomain.DOMAIN_EXTERNAL_CHAIN]: "external_chain",
        [FlowDomain.DOMAIN_ZIPPER]: "zipper",
        [FlowDomain.DOMAIN_FUNDING]: "funding",
        [FlowDomain.DOMAIN_TRADING]: "trading",
        [FlowDomain.DOMAIN_LENDING]: "lending",
    } satisfies Record<FlowDomain, LifecycleFlowDomainOutputValue>,
} as const;

export const LifecycleFlowKindCodec = {
    inputToProto: {
        deposit: FlowKind.KIND_DEPOSIT,
        withdraw: FlowKind.KIND_WITHDRAW,
        transfer: FlowKind.KIND_TRANSFER,
    } satisfies Record<LifecycleFlowKindValue, FlowKind>,
    protoToOutput: {
        [FlowKind.KIND_UNSPECIFIED]: "unspecified",
        [FlowKind.KIND_DEPOSIT]: "deposit",
        [FlowKind.KIND_WITHDRAW]: "withdraw",
        [FlowKind.KIND_TRANSFER]: "transfer",
    } satisfies Record<FlowKind, LifecycleFlowKindOutputValue>,
} as const;

export const LifecycleFlowStateCodec = {
    inputToProto: {
        pending_source: FlowState.STATE_PENDING_SOURCE,
        pending_polyester_chain: FlowState.STATE_PENDING_POLYESTER_CHAIN,
        pending_ledger: FlowState.STATE_PENDING_LEDGER,
        completed: FlowState.STATE_COMPLETED,
        failed: FlowState.STATE_FAILED,
        dropped: FlowState.STATE_DROPPED,
        refunded: FlowState.STATE_REFUNDED,
    } satisfies Record<LifecycleFlowStateValue, FlowState>,
    protoToOutput: {
        [FlowState.STATE_UNSPECIFIED]: "unspecified",
        [FlowState.STATE_PENDING_SOURCE]: "pending_source",
        [FlowState.STATE_PENDING_POLYESTER_CHAIN]: "pending_polyester_chain",
        [FlowState.STATE_PENDING_LEDGER]: "pending_ledger",
        [FlowState.STATE_COMPLETED]: "completed",
        [FlowState.STATE_FAILED]: "failed",
        [FlowState.STATE_DROPPED]: "dropped",
        [FlowState.STATE_REFUNDED]: "refunded",
    } satisfies Record<FlowState, LifecycleFlowStateOutputValue>,
} as const;

export const LifecycleListScopeCodec = {
    inputToProto: {
        all: ListScope.LIST_ALL,
        open: ListScope.LIST_OPEN_ONLY,
        terminal: ListScope.LIST_TERMINAL_ONLY,
    } satisfies Record<LifecycleListScopeValue, ListScope>,
    protoToOutput: {
        [ListScope.LIST_UNSPECIFIED]: "unspecified",
        [ListScope.LIST_ALL]: "all",
        [ListScope.LIST_OPEN_ONLY]: "open",
        [ListScope.LIST_TERMINAL_ONLY]: "terminal",
    } satisfies Record<ListScope, LifecycleListScopeOutputValue>,
} as const;

export const LifecycleTxLookupKindCodec = {
    inputToProto: {
        source: TxLookupKind.TX_SOURCE,
        any: TxLookupKind.TX_ANY,
    } satisfies Record<LifecycleTxLookupKindValue, TxLookupKind>,
    protoToOutput: {
        [TxLookupKind.TX_UNSPECIFIED]: "unspecified",
        [TxLookupKind.TX_SOURCE]: "source",
        [TxLookupKind.TX_ANY]: "any",
    } satisfies Record<TxLookupKind, LifecycleTxLookupKindOutputValue>,
} as const;

export const LifecycleFlowStepCodec = {
    protoToOutput: {
        [FlowStep.UNSPECIFIED]: "unspecified",
        [FlowStep.SOURCE]: "source",
        [FlowStep.TRANSFER]: "transfer",
        [FlowStep.REQUEST]: "request",
        [FlowStep.VALIDATION]: "validation",
        [FlowStep.EXECUTION]: "execution",
        [FlowStep.ASSET_BURNED]: "asset_burned",
        [FlowStep.DROPPED]: "dropped",
        [FlowStep.FAILED]: "failed",
        [FlowStep.REFUNDED]: "refunded",
        [FlowStep.FULFILLING]: "fulfilling",
        [FlowStep.SETTLEMENT]: "settlement",
    } satisfies Record<FlowStep, LifecycleFlowStepValue>,
} as const;

export const LifecycleSourceCodec = {
    protoToOutput: {
        [LifecycleSource.SOURCE_UNSPECIFIED]: "unspecified",
        [LifecycleSource.SOURCE_RELAYER]: "relayer",
        [LifecycleSource.SOURCE_POLYESTER_CHAIN]: "polyester_chain",
        [LifecycleSource.SOURCE_EXECUTOR]: "executor",
        [LifecycleSource.SOURCE_LEDGER]: "ledger",
    } satisfies Record<LifecycleSource, LifecycleSourceValue>,
} as const;

export const LifecycleFlowStepActivityKindCodec = {
    protoToOutput: {
        [FlowStepActivityKind.ACTIVITY_UNSPECIFIED]: "unspecified",
        [FlowStepActivityKind.ACTIVITY_MINTED]: "minted",
        [FlowStepActivityKind.ACTIVITY_FUNDING]: "funding",
        [FlowStepActivityKind.ACTIVITY_TRADING]: "trading",
    } satisfies Record<FlowStepActivityKind, LifecycleFlowStepActivityKindValue>,
} as const;

export const LifecycleFlowTimelineStatusCodec = {
    protoToOutput: {
        [FlowTimelineStatus.TIMELINE_STATUS_UNSPECIFIED]: "unspecified",
        [FlowTimelineStatus.TIMELINE_STATUS_COMPLETED]: "completed",
        [FlowTimelineStatus.TIMELINE_STATUS_CURRENT]: "current",
        [FlowTimelineStatus.TIMELINE_STATUS_PLANNED]: "planned",
    } satisfies Record<FlowTimelineStatus, LifecycleFlowTimelineStatusValue>,
} as const;

export const LifecycleRequestFeeStatusCodec = {
    protoToOutput: {
        [RequestFeeStatus.UNSPECIFIED]: "unspecified",
        [RequestFeeStatus.LOCKED]: "locked",
        [RequestFeeStatus.SETTLED]: "settled",
    } satisfies Record<RequestFeeStatus, LifecycleRequestFeeStatusValue>,
} as const;
