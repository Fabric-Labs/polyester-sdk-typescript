import {
    FlowDomain,
    FlowKind,
    FlowState,
    LifecycleReason,
    LifecycleSource,
    RequestFeeStatus,
} from "../../gen/chain/lifecycle/v1/types_pb.js";
import {
    FlowStep,
    FlowStepActivityKind,
    FlowTimelineStatus,
    ListOrderBy,
    ListScope,
    Sort,
    TxLookupKind,
} from "../../gen/chain/lifecycle/v1/lifecycle_read_pb.js";
import type { InputToProto, ProtoToOutput } from "../../utils/types.js";

export const LIFECYCLE_FLOW_KIND_VALUES = ["deposit", "withdraw", "transfer"] as const;
export type LifecycleFlowKindValue = (typeof LIFECYCLE_FLOW_KIND_VALUES)[number];

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

export const LIFECYCLE_LIST_SCOPE_VALUES = ["all", "open", "terminal"] as const;
export type LifecycleListScopeValue = (typeof LIFECYCLE_LIST_SCOPE_VALUES)[number];

export const LIFECYCLE_TX_LOOKUP_KIND_VALUES = ["source", "any"] as const;
export type LifecycleTxLookupKindValue = (typeof LIFECYCLE_TX_LOOKUP_KIND_VALUES)[number];

export const LIFECYCLE_SORT_VALUES = ["newest", "oldest"] as const;
export type LifecycleSortValue = (typeof LIFECYCLE_SORT_VALUES)[number];

export const LIFECYCLE_LIST_ORDER_BY_VALUES = ["last_activity", "started_at"] as const;
export type LifecycleListOrderByValue = (typeof LIFECYCLE_LIST_ORDER_BY_VALUES)[number];

export const LIFECYCLE_REASON_VALUES = [
    "unspecified",
    "zipper_validation_rejected",
    "zipper_execution_rejected",
    "zipper_withdraw_execution_failed",
    "zipper_deposit_refund_failed",
    "ledger_mirror_rejected",
    "ledger_mirror_transfer_exceeds_credits",
    "ledger_mirror_transfer_exists",
    "ledger_mirror_pending_transfer_not_found",
    "ledger_mirror_transfer_id_already_failed",
] as const;
/**
 * Catalog labels plus a code-preserving fallback for wire values the generated
 * enum does not know. Proto3 enums are open — the backend can emit codes ahead
 * of a contract update — and rejecting them froze flows out of the UI.
 */
export type LifecycleReasonValue =
    | (typeof LIFECYCLE_REASON_VALUES)[number]
    | `unknown_reason_${number}`;

export const LIFECYCLE_FLOW_STEP_VALUES = [
    "source",
    "transfer",
    "request",
    "validation",
    "execution",
    "bridge_fulfillment",
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
    "minted",
    "funding",
    "trading",
    "unspecified",
] as const;
export type LifecycleFlowStepActivityKindValue =
    (typeof LIFECYCLE_FLOW_STEP_ACTIVITY_KIND_VALUES)[number];

export const LIFECYCLE_FLOW_TIMELINE_STATUS_VALUES = ["completed", "current", "planned"] as const;
export type LifecycleFlowTimelineStatusValue =
    (typeof LIFECYCLE_FLOW_TIMELINE_STATUS_VALUES)[number];

export const LIFECYCLE_REQUEST_FEE_STATUS_VALUES = ["locked", "settled"] as const;
export type LifecycleRequestFeeStatusValue = (typeof LIFECYCLE_REQUEST_FEE_STATUS_VALUES)[number];

export const LIFECYCLE_FLOW_DOMAIN_VALUES = [
    "external_chain",
    "zipper",
    "funding",
    "trading",
    "lending",
] as const;
export type LifecycleFlowDomainValue = (typeof LIFECYCLE_FLOW_DOMAIN_VALUES)[number];

export const LifecycleFlowDomainCodec = {
    protoToOutput: {
        [FlowDomain.DOMAIN_UNSPECIFIED]: "unspecified",
        [FlowDomain.DOMAIN_EXTERNAL_CHAIN]: "external_chain",
        [FlowDomain.DOMAIN_ZIPPER]: "zipper",
        [FlowDomain.DOMAIN_FUNDING]: "funding",
        [FlowDomain.DOMAIN_TRADING]: "trading",
        [FlowDomain.DOMAIN_LENDING]: "lending",
    } satisfies ProtoToOutput<FlowDomain, LifecycleFlowDomainValue>,
} as const;

export const LifecycleFlowKindCodec = {
    inputToProto: {
        deposit: FlowKind.KIND_DEPOSIT,
        withdraw: FlowKind.KIND_WITHDRAW,
        transfer: FlowKind.KIND_TRANSFER,
    } satisfies InputToProto<LifecycleFlowKindValue, FlowKind>,
    protoToOutput: {
        [FlowKind.KIND_UNSPECIFIED]: "unspecified",
        [FlowKind.KIND_DEPOSIT]: "deposit",
        [FlowKind.KIND_WITHDRAW]: "withdraw",
        [FlowKind.KIND_TRANSFER]: "transfer",
    } satisfies ProtoToOutput<FlowKind, LifecycleFlowKindValue>,
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
    } satisfies InputToProto<LifecycleFlowStateValue, FlowState>,
    protoToOutput: {
        [FlowState.STATE_UNSPECIFIED]: "unspecified",
        [FlowState.STATE_PENDING_SOURCE]: "pending_source",
        [FlowState.STATE_PENDING_POLYESTER_CHAIN]: "pending_polyester_chain",
        [FlowState.STATE_PENDING_LEDGER]: "pending_ledger",
        [FlowState.STATE_COMPLETED]: "completed",
        [FlowState.STATE_FAILED]: "failed",
        [FlowState.STATE_DROPPED]: "dropped",
        [FlowState.STATE_REFUNDED]: "refunded",
    } satisfies ProtoToOutput<FlowState, LifecycleFlowStateValue>,
} as const;

export const LifecycleListScopeCodec = {
    inputToProto: {
        all: ListScope.LIST_ALL,
        open: ListScope.LIST_OPEN_ONLY,
        terminal: ListScope.LIST_TERMINAL_ONLY,
    } satisfies InputToProto<LifecycleListScopeValue, ListScope>,
    protoToOutput: {
        [ListScope.LIST_UNSPECIFIED]: "unspecified",
        [ListScope.LIST_ALL]: "all",
        [ListScope.LIST_OPEN_ONLY]: "open",
        [ListScope.LIST_TERMINAL_ONLY]: "terminal",
    } satisfies ProtoToOutput<ListScope, LifecycleListScopeValue>,
} as const;

export const LifecycleSortCodec = {
    inputToProto: {
        newest: Sort.NEWEST,
        oldest: Sort.OLDEST,
    } satisfies InputToProto<LifecycleSortValue, Sort>,
} as const;

export const LifecycleListOrderByCodec = {
    inputToProto: {
        last_activity: ListOrderBy.ORDER_BY_LAST_ACTIVITY,
        started_at: ListOrderBy.ORDER_BY_STARTED_AT,
    } satisfies InputToProto<LifecycleListOrderByValue, ListOrderBy>,
} as const;

/**
 * LifecycleReason is a stable product-facing reason catalog. Unlike the other
 * lifecycle enums, `REASON_UNSPECIFIED` (0) is a valid wire value — it is
 * the normal state for flows without a notable reason — so the codec maps the
 * full enum including zero.
 */
export const LifecycleReasonCodec = {
    protoToOutput: {
        [LifecycleReason.REASON_UNSPECIFIED]: "unspecified",
        [LifecycleReason.ZIPPER_VALIDATION_REJECTED]: "zipper_validation_rejected",
        [LifecycleReason.ZIPPER_EXECUTION_REJECTED]: "zipper_execution_rejected",
        [LifecycleReason.ZIPPER_WITHDRAW_EXECUTION_FAILED]: "zipper_withdraw_execution_failed",
        [LifecycleReason.ZIPPER_DEPOSIT_REFUND_FAILED]: "zipper_deposit_refund_failed",
        [LifecycleReason.LEDGER_MIRROR_REJECTED]: "ledger_mirror_rejected",
        [LifecycleReason.LEDGER_MIRROR_TRANSFER_EXCEEDS_CREDITS]:
            "ledger_mirror_transfer_exceeds_credits",
        [LifecycleReason.LEDGER_MIRROR_TRANSFER_EXISTS]: "ledger_mirror_transfer_exists",
        [LifecycleReason.LEDGER_MIRROR_PENDING_TRANSFER_NOT_FOUND]:
            "ledger_mirror_pending_transfer_not_found",
        [LifecycleReason.LEDGER_MIRROR_TRANSFER_ID_ALREADY_FAILED]:
            "ledger_mirror_transfer_id_already_failed",
    } satisfies Record<LifecycleReason, LifecycleReasonValue>,
} as const;

/**
 * Maps a wire reason code to its catalog label, preserving uncataloged codes
 * as `unknown_reason_${code}` instead of failing the whole flow payload.
 */
export function lifecycleReasonFromCode(code: number): LifecycleReasonValue {
    const known = LifecycleReasonCodec.protoToOutput as Partial<
        Record<number, LifecycleReasonValue>
    >;
    return known[code] ?? `unknown_reason_${code}`;
}

export const LifecycleTxLookupKindCodec = {
    inputToProto: {
        source: TxLookupKind.TX_SOURCE,
        any: TxLookupKind.TX_ANY,
    } satisfies InputToProto<LifecycleTxLookupKindValue, TxLookupKind>,
    protoToOutput: {
        [TxLookupKind.TX_UNSPECIFIED]: "unspecified",
        [TxLookupKind.TX_SOURCE]: "source",
        [TxLookupKind.TX_ANY]: "any",
    } satisfies ProtoToOutput<TxLookupKind, LifecycleTxLookupKindValue>,
} as const;

export const LifecycleFlowStepCodec = {
    protoToOutput: {
        [FlowStep.UNSPECIFIED]: "unspecified",
        [FlowStep.SOURCE]: "source",
        [FlowStep.TRANSFER]: "transfer",
        [FlowStep.REQUEST]: "request",
        [FlowStep.VALIDATION]: "validation",
        [FlowStep.EXECUTION]: "execution",
        [FlowStep.BRIDGE_FULFILLMENT]: "bridge_fulfillment",
        [FlowStep.DROPPED]: "dropped",
        [FlowStep.FAILED]: "failed",
        [FlowStep.REFUNDED]: "refunded",
        [FlowStep.FULFILLING]: "fulfilling",
        [FlowStep.SETTLEMENT]: "settlement",
    } satisfies ProtoToOutput<FlowStep, LifecycleFlowStepValue>,
} as const;

export const LifecycleSourceCodec = {
    /**
     * In-progress flows may emit SOURCE_UNSPECIFIED (0) before a subsystem is
     * attributed, so zero must decode like other lifecycle "unspecified" enums.
     */
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
        [FlowStepActivityKind.ACTIVITY_MINTED]: "minted",
        [FlowStepActivityKind.ACTIVITY_FUNDING]: "funding",
        [FlowStepActivityKind.ACTIVITY_TRADING]: "trading",
        [FlowStepActivityKind.ACTIVITY_UNSPECIFIED]: "unspecified",
    } satisfies Record<FlowStepActivityKind, LifecycleFlowStepActivityKindValue>,
} as const;

export const LifecycleFlowTimelineStatusCodec = {
    protoToOutput: {
        [FlowTimelineStatus.TIMELINE_STATUS_UNSPECIFIED]: "unspecified",
        [FlowTimelineStatus.TIMELINE_STATUS_COMPLETED]: "completed",
        [FlowTimelineStatus.TIMELINE_STATUS_CURRENT]: "current",
        [FlowTimelineStatus.TIMELINE_STATUS_PLANNED]: "planned",
    } satisfies ProtoToOutput<FlowTimelineStatus, LifecycleFlowTimelineStatusValue>,
} as const;

export const LifecycleRequestFeeStatusCodec = {
    protoToOutput: {
        [RequestFeeStatus.UNSPECIFIED]: "unspecified",
        [RequestFeeStatus.LOCKED]: "locked",
        [RequestFeeStatus.SETTLED]: "settled",
    } satisfies ProtoToOutput<RequestFeeStatus, LifecycleRequestFeeStatusValue>,
} as const;
