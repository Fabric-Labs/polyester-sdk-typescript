import * as Proto from "../../gen/chain/withdraw/v1/auto_withdraw_pb.js";
import type { InputToProto, ProtoToOutput } from "../../utils/types.js";

export const AUTO_WITHDRAW_CADENCE_VALUES = [
    "hourly",
    "daily",
    "weekly",
    "biweekly",
    "monthly",
] as const;
export type AutoWithdrawCadence = (typeof AUTO_WITHDRAW_CADENCE_VALUES)[number];

export const AUTO_WITHDRAW_WEEKDAY_VALUES = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
] as const;
export type AutoWithdrawWeekday = (typeof AUTO_WITHDRAW_WEEKDAY_VALUES)[number];

export const AUTO_WITHDRAW_RUN_STATE_VALUES = [
    "planned",
    "paying",
    "completed",
    "partially_failed",
    "failed",
    "skipped",
] as const;
export type AutoWithdrawRunState = (typeof AUTO_WITHDRAW_RUN_STATE_VALUES)[number];

export const AUTO_WITHDRAW_STEP_STATE_VALUES = [
    "pending",
    "submitting",
    "submitted",
    "completed",
    "failed",
    "skipped",
] as const;
export type AutoWithdrawStepState = (typeof AUTO_WITHDRAW_STEP_STATE_VALUES)[number];

export const AutoWithdrawCadenceCodec = {
    inputToProto: {
        hourly: Proto.AutoWithdrawCadence.HOURLY,
        daily: Proto.AutoWithdrawCadence.DAILY,
        weekly: Proto.AutoWithdrawCadence.WEEKLY,
        biweekly: Proto.AutoWithdrawCadence.BIWEEKLY,
        monthly: Proto.AutoWithdrawCadence.MONTHLY,
    } satisfies InputToProto<AutoWithdrawCadence, Proto.AutoWithdrawCadence>,
} as const;

export const AutoWithdrawWeekdayCodec = {
    inputToProto: {
        monday: Proto.AutoWithdrawWeekday.MONDAY,
        tuesday: Proto.AutoWithdrawWeekday.TUESDAY,
        wednesday: Proto.AutoWithdrawWeekday.WEDNESDAY,
        thursday: Proto.AutoWithdrawWeekday.THURSDAY,
        friday: Proto.AutoWithdrawWeekday.FRIDAY,
        saturday: Proto.AutoWithdrawWeekday.SATURDAY,
        sunday: Proto.AutoWithdrawWeekday.SUNDAY,
    } satisfies InputToProto<AutoWithdrawWeekday, Proto.AutoWithdrawWeekday>,
    protoToOutput: {
        [Proto.AutoWithdrawWeekday.WEEKDAY_UNSPECIFIED]: "unspecified",
        [Proto.AutoWithdrawWeekday.MONDAY]: "monday",
        [Proto.AutoWithdrawWeekday.TUESDAY]: "tuesday",
        [Proto.AutoWithdrawWeekday.WEDNESDAY]: "wednesday",
        [Proto.AutoWithdrawWeekday.THURSDAY]: "thursday",
        [Proto.AutoWithdrawWeekday.FRIDAY]: "friday",
        [Proto.AutoWithdrawWeekday.SATURDAY]: "saturday",
        [Proto.AutoWithdrawWeekday.SUNDAY]: "sunday",
    } satisfies ProtoToOutput<Proto.AutoWithdrawWeekday, AutoWithdrawWeekday>,
} as const;

export const AutoWithdrawRunStateCodec = {
    protoToOutput: {
        [Proto.AutoWithdrawRunState.RUN_STATE_UNSPECIFIED]: "unspecified",
        [Proto.AutoWithdrawRunState.RUN_PLANNED]: "planned",
        [Proto.AutoWithdrawRunState.RUN_PAYING]: "paying",
        [Proto.AutoWithdrawRunState.RUN_COMPLETED]: "completed",
        [Proto.AutoWithdrawRunState.RUN_PARTIALLY_FAILED]: "partially_failed",
        [Proto.AutoWithdrawRunState.RUN_FAILED]: "failed",
        [Proto.AutoWithdrawRunState.RUN_SKIPPED]: "skipped",
    } satisfies ProtoToOutput<Proto.AutoWithdrawRunState, AutoWithdrawRunState>,
} as const;

export const AutoWithdrawStepStateCodec = {
    protoToOutput: {
        [Proto.AutoWithdrawStepState.STEP_STATE_UNSPECIFIED]: "unspecified",
        [Proto.AutoWithdrawStepState.STEP_PENDING]: "pending",
        [Proto.AutoWithdrawStepState.STEP_SUBMITTING]: "submitting",
        [Proto.AutoWithdrawStepState.STEP_SUBMITTED]: "submitted",
        [Proto.AutoWithdrawStepState.STEP_COMPLETED]: "completed",
        [Proto.AutoWithdrawStepState.STEP_FAILED]: "failed",
        [Proto.AutoWithdrawStepState.STEP_SKIPPED]: "skipped",
    } satisfies ProtoToOutput<Proto.AutoWithdrawStepState, AutoWithdrawStepState>,
} as const;

/** Why a rule paused itself. Unknown future reasons pass through as strings. */
export type AutoWithdrawPauseReason =
    | "destination_not_whitelisted"
    | "destination_invalid"
    | "authority_revoked"
    | (string & {});

/** Why a run was skipped. Unknown future reasons pass through as strings. */
export type AutoWithdrawRunReason =
    | "nothing_to_pay"
    | "price_unavailable"
    | "rule_superseded"
    | (string & {});

/** Why a step was skipped or failed. Unknown future reasons pass through as strings. */
export type AutoWithdrawStepReason =
    | "below_minimum"
    | "price_unavailable"
    | "rule_superseded"
    | "destination_not_whitelisted"
    | "authority_revoked"
    | "gateway_capacity_insufficient"
    | "withdrawal_released"
    | "withdrawal_failed"
    | (string & {});
