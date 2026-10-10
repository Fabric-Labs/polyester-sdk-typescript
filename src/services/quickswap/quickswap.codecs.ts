import * as Proto from "../../gen/swap/quickswap/v1/quickswap_pb.js";
import type { InputToProto, ProtoToOutput } from "../../utils/types.js";

export const QUICKSWAP_BASIS_VALUES = ["source_amount", "destination_amount"] as const;
export type QuickSwapBasis = (typeof QUICKSWAP_BASIS_VALUES)[number];

export const QUICKSWAP_FEE_KIND_VALUES = [
    "service",
    "integrator",
    "deposit_network",
    "withdrawal_network",
] as const;
export type QuickSwapFeeKind = (typeof QUICKSWAP_FEE_KIND_VALUES)[number];

export const QUICKSWAP_DEPOSIT_ADDRESS_STATE_VALUES = ["active", "refund_mode", "retired"] as const;
export type QuickSwapDepositAddressState = (typeof QUICKSWAP_DEPOSIT_ADDRESS_STATE_VALUES)[number];

export const QUICKSWAP_DEPOSIT_DISPOSITION_VALUES = [
    "evaluating",
    "eligible",
    "return_only",
    "on_hold",
    "manual_recovery",
] as const;
export type QuickSwapDepositDisposition = (typeof QUICKSWAP_DEPOSIT_DISPOSITION_VALUES)[number];

export const QUICKSWAP_REASON_VALUES = [
    "source_screening_failed",
    "capacity_unavailable",
    "protection_not_met",
    "execution_deadline_reached",
    "late_deposit",
    "deposit_below_minimum",
    "deposit_above_maximum",
    "wrong_asset",
    "funding_window_ended",
    "withdrawal_failed",
    "outcome_reconciling",
    "source_screening_blocked",
    "refund_below_minimum",
] as const;
export type QuickSwapReason = (typeof QUICKSWAP_REASON_VALUES)[number];

export const QUICKSWAP_WITHDRAWAL_ROLE_VALUES = ["destination", "refund", "return"] as const;
export type QuickSwapWithdrawalRole = (typeof QUICKSWAP_WITHDRAWAL_ROLE_VALUES)[number];

export const QUICKSWAP_WITHDRAWAL_STATE_VALUES = [
    "queued",
    "submitted",
    "finalized",
    "failed",
    "not_sent",
] as const;
export type QuickSwapWithdrawalState = (typeof QUICKSWAP_WITHDRAWAL_STATE_VALUES)[number];

export const QUICKSWAP_STATUS_VALUES = [
    "allocating",
    "awaiting_deposit",
    "waiting_for_capacity",
    "preparing_deposit",
    "confirming",
    "credited",
    "executing",
    "paying_out",
    "refunding",
    "returning",
    "held",
    "completed",
    "refunded",
    "returned",
    "expired",
] as const;
export type QuickSwapStatus = (typeof QUICKSWAP_STATUS_VALUES)[number];

export const QuickSwapBasisCodec = {
    inputToProto: {
        source_amount: Proto.QuoteBasis.SOURCE_AMOUNT,
        destination_amount: Proto.QuoteBasis.DESTINATION_AMOUNT,
    } satisfies InputToProto<QuickSwapBasis, Proto.QuoteBasis>,
    protoToOutput: {
        [Proto.QuoteBasis.BASIS_UNSPECIFIED]: "unspecified",
        [Proto.QuoteBasis.SOURCE_AMOUNT]: "source_amount",
        [Proto.QuoteBasis.DESTINATION_AMOUNT]: "destination_amount",
    } satisfies ProtoToOutput<Proto.QuoteBasis, QuickSwapBasis>,
} as const;

export const QuickSwapFeeKindCodec = {
    protoToOutput: {
        [Proto.FeeKind.FEE_UNSPECIFIED]: "unspecified",
        [Proto.FeeKind.SERVICE]: "service",
        [Proto.FeeKind.INTEGRATOR]: "integrator",
        [Proto.FeeKind.DEPOSIT_NETWORK]: "deposit_network",
        [Proto.FeeKind.WITHDRAWAL_NETWORK]: "withdrawal_network",
    } satisfies ProtoToOutput<Proto.FeeKind, QuickSwapFeeKind>,
} as const;

export const QuickSwapDepositAddressStateCodec = {
    protoToOutput: {
        [Proto.DepositAddressState.ADDRESS_UNSPECIFIED]: "unspecified",
        [Proto.DepositAddressState.ACTIVE]: "active",
        [Proto.DepositAddressState.REFUND_MODE]: "refund_mode",
        [Proto.DepositAddressState.RETIRED]: "retired",
    } satisfies ProtoToOutput<Proto.DepositAddressState, QuickSwapDepositAddressState>,
} as const;

export const QuickSwapDepositDispositionCodec = {
    protoToOutput: {
        [Proto.DepositDisposition.DISPOSITION_UNSPECIFIED]: "unspecified",
        [Proto.DepositDisposition.EVALUATING]: "evaluating",
        [Proto.DepositDisposition.ELIGIBLE]: "eligible",
        [Proto.DepositDisposition.RETURN_ONLY]: "return_only",
        [Proto.DepositDisposition.ON_HOLD]: "on_hold",
        [Proto.DepositDisposition.MANUAL_RECOVERY]: "manual_recovery",
    } satisfies ProtoToOutput<Proto.DepositDisposition, QuickSwapDepositDisposition>,
} as const;

export const QuickSwapReasonCodec = {
    protoToOutput: {
        [Proto.QuickSwapReason.REASON_UNSPECIFIED]: "unspecified",
        [Proto.QuickSwapReason.SOURCE_SCREENING_FAILED]: "source_screening_failed",
        [Proto.QuickSwapReason.CAPACITY_UNAVAILABLE]: "capacity_unavailable",
        [Proto.QuickSwapReason.PROTECTION_NOT_MET]: "protection_not_met",
        [Proto.QuickSwapReason.EXECUTION_DEADLINE_REACHED]: "execution_deadline_reached",
        [Proto.QuickSwapReason.LATE_DEPOSIT]: "late_deposit",
        [Proto.QuickSwapReason.DEPOSIT_BELOW_MINIMUM]: "deposit_below_minimum",
        [Proto.QuickSwapReason.DEPOSIT_ABOVE_MAXIMUM]: "deposit_above_maximum",
        [Proto.QuickSwapReason.WRONG_ASSET]: "wrong_asset",
        [Proto.QuickSwapReason.FUNDING_WINDOW_ENDED]: "funding_window_ended",
        [Proto.QuickSwapReason.WITHDRAWAL_FAILED]: "withdrawal_failed",
        [Proto.QuickSwapReason.OUTCOME_RECONCILING]: "outcome_reconciling",
        [Proto.QuickSwapReason.SOURCE_SCREENING_BLOCKED]: "source_screening_blocked",
        [Proto.QuickSwapReason.REFUND_BELOW_MINIMUM]: "refund_below_minimum",
    } satisfies ProtoToOutput<Proto.QuickSwapReason, QuickSwapReason>,
} as const;

export const QuickSwapWithdrawalRoleCodec = {
    protoToOutput: {
        [Proto.WithdrawalRole.ROLE_UNSPECIFIED]: "unspecified",
        [Proto.WithdrawalRole.DESTINATION]: "destination",
        [Proto.WithdrawalRole.REFUND]: "refund",
        [Proto.WithdrawalRole.RETURN]: "return",
    } satisfies ProtoToOutput<Proto.WithdrawalRole, QuickSwapWithdrawalRole>,
} as const;

export const QuickSwapWithdrawalStateCodec = {
    protoToOutput: {
        [Proto.WithdrawalState.WITHDRAWAL_UNSPECIFIED]: "unspecified",
        [Proto.WithdrawalState.QUEUED]: "queued",
        [Proto.WithdrawalState.SUBMITTED]: "submitted",
        [Proto.WithdrawalState.FINALIZED]: "finalized",
        [Proto.WithdrawalState.FAILED]: "failed",
        [Proto.WithdrawalState.NOT_SENT]: "not_sent",
    } satisfies ProtoToOutput<Proto.WithdrawalState, QuickSwapWithdrawalState>,
} as const;

export const QuickSwapStatusCodec = {
    protoToOutput: {
        [Proto.QuickSwapStatus.STATUS_UNSPECIFIED]: "unspecified",
        [Proto.QuickSwapStatus.ALLOCATING]: "allocating",
        [Proto.QuickSwapStatus.AWAITING_DEPOSIT]: "awaiting_deposit",
        [Proto.QuickSwapStatus.WAITING_FOR_CAPACITY]: "waiting_for_capacity",
        [Proto.QuickSwapStatus.PREPARING_DEPOSIT]: "preparing_deposit",
        [Proto.QuickSwapStatus.CONFIRMING]: "confirming",
        [Proto.QuickSwapStatus.CREDITED]: "credited",
        [Proto.QuickSwapStatus.EXECUTING]: "executing",
        [Proto.QuickSwapStatus.PAYING_OUT]: "paying_out",
        [Proto.QuickSwapStatus.REFUNDING]: "refunding",
        [Proto.QuickSwapStatus.RETURNING]: "returning",
        [Proto.QuickSwapStatus.HELD]: "held",
        [Proto.QuickSwapStatus.COMPLETED]: "completed",
        [Proto.QuickSwapStatus.REFUNDED]: "refunded",
        [Proto.QuickSwapStatus.RETURNED]: "returned",
        [Proto.QuickSwapStatus.EXPIRED]: "expired",
    } satisfies ProtoToOutput<Proto.QuickSwapStatus, QuickSwapStatus>,
} as const;
