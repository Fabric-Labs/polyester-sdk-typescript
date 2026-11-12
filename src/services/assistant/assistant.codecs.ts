import * as Proto from "../../gen/ai/v1/assistant_pb.js";
import type { InputToProto, ProtoToOutput } from "../../utils/types.js";

export const ASSISTANT_MESSAGE_ROLE_VALUES = ["user", "assistant"] as const;
export type AssistantMessageRole = (typeof ASSISTANT_MESSAGE_ROLE_VALUES)[number];

export const ASSISTANT_FAILURE_CATEGORY_VALUES = [
    "canceled",
    "budget_exceeded",
    "permission_denied",
    "model_unavailable",
    "unexpected_error",
] as const;
export type AssistantFailureCategory = (typeof ASSISTANT_FAILURE_CATEGORY_VALUES)[number];

export const ASSISTANT_APPROVAL_DECISION_VALUES = ["approve", "reject"] as const;
export type AssistantApprovalDecision = (typeof ASSISTANT_APPROVAL_DECISION_VALUES)[number];

export const ASSISTANT_APPROVAL_STATUS_VALUES = [
    "pending",
    "approved",
    "rejected",
    "expired",
] as const;
export type AssistantApprovalStatus = (typeof ASSISTANT_APPROVAL_STATUS_VALUES)[number];

export const ASSISTANT_MEMORY_KIND_VALUES = ["fact", "planning_figure", "profile"] as const;
export type AssistantMemoryKind = (typeof ASSISTANT_MEMORY_KIND_VALUES)[number];

export const ASSISTANT_KEY_STATE_VALUES = ["active", "disabled"] as const;
export type AssistantKeyState = (typeof ASSISTANT_KEY_STATE_VALUES)[number];

export type AssistantReferencePriceSource = "best_bid" | "best_ask" | "last_price" | "index_price";
export type AssistantTriggerDirection = "at_or_above" | "at_or_below";
export type AssistantOrderPriceField =
    | "limit_price"
    | "trigger_price"
    | "activation_price"
    | "ladder_low_price"
    | "ladder_high_price"
    | "take_profit_trigger_price"
    | "take_profit_limit_price"
    | "stop_loss_trigger_price"
    | "stop_loss_limit_price"
    | "trailing_stop_activation_price"
    | "trailing_stop_limit_price";
export type AssistantPriceOffsetDirection = "above" | "below";
export type AssistantPriceRounding = "down" | "up";
export type AssistantUnfilledSlicePolicy = "cancel_before_next";
export type AssistantTriggerChangeAction = "modify" | "pause" | "resume";

export const MessageRoleCodec = {
    protoToOutput: {
        [Proto.MessageRole.ROLE_UNSPECIFIED]: "unspecified",
        [Proto.MessageRole.USER]: "user",
        [Proto.MessageRole.ASSISTANT]: "assistant",
    } satisfies ProtoToOutput<Proto.MessageRole, AssistantMessageRole>,
} as const;

export const FailureCategoryCodec = {
    protoToOutput: {
        [Proto.FailureCategory.FAILURE_UNSPECIFIED]: "unspecified",
        [Proto.FailureCategory.CANCELLED]: "canceled",
        [Proto.FailureCategory.BUDGET_EXCEEDED]: "budget_exceeded",
        [Proto.FailureCategory.PERMISSION_DENIED]: "permission_denied",
        [Proto.FailureCategory.MODEL_UNAVAILABLE]: "model_unavailable",
        [Proto.FailureCategory.UNEXPECTED_ERROR]: "unexpected_error",
    } satisfies ProtoToOutput<Proto.FailureCategory, AssistantFailureCategory>,
} as const;

export const ApprovalDecisionCodec = {
    inputToProto: {
        approve: Proto.ApprovalDecision.APPROVE,
        reject: Proto.ApprovalDecision.REJECT,
    } satisfies InputToProto<AssistantApprovalDecision, Proto.ApprovalDecision>,
} as const;

export const ApprovalStatusCodec = {
    protoToOutput: {
        [Proto.ApprovalStatus.APPROVAL_UNSPECIFIED]: "unspecified",
        [Proto.ApprovalStatus.PENDING]: "pending",
        [Proto.ApprovalStatus.APPROVED]: "approved",
        [Proto.ApprovalStatus.REJECTED]: "rejected",
        [Proto.ApprovalStatus.EXPIRED]: "expired",
    } satisfies ProtoToOutput<Proto.ApprovalStatus, AssistantApprovalStatus>,
} as const;

export const MemoryKindCodec = {
    protoToOutput: {
        [Proto.MemoryKind.KIND_UNSPECIFIED]: "unspecified",
        [Proto.MemoryKind.FACT]: "fact",
        [Proto.MemoryKind.PLANNING_FIGURE]: "planning_figure",
        [Proto.MemoryKind.PROFILE]: "profile",
    } satisfies ProtoToOutput<Proto.MemoryKind, AssistantMemoryKind>,
} as const;

export const AssistantKeyStateCodec = {
    protoToOutput: {
        [Proto.AssistantKeyState.KEY_STATE_UNSPECIFIED]: "unspecified",
        [Proto.AssistantKeyState.ACTIVE]: "active",
        [Proto.AssistantKeyState.DISABLED]: "disabled",
    } satisfies ProtoToOutput<Proto.AssistantKeyState, AssistantKeyState>,
} as const;

export const ReferencePriceSourceCodec = {
    protoToOutput: {
        [Proto.ReferencePriceSource.PRICE_SOURCE_UNSPECIFIED]: "unspecified",
        [Proto.ReferencePriceSource.BEST_BID]: "best_bid",
        [Proto.ReferencePriceSource.BEST_ASK]: "best_ask",
        [Proto.ReferencePriceSource.LAST_PRICE]: "last_price",
        [Proto.ReferencePriceSource.INDEX_PRICE]: "index_price",
    } satisfies ProtoToOutput<Proto.ReferencePriceSource, AssistantReferencePriceSource>,
} as const;

export const TriggerDirectionCodec = {
    protoToOutput: {
        [Proto.TriggerDirection.DIRECTION_UNSPECIFIED]: "unspecified",
        [Proto.TriggerDirection.AT_OR_ABOVE]: "at_or_above",
        [Proto.TriggerDirection.AT_OR_BELOW]: "at_or_below",
    } satisfies ProtoToOutput<Proto.TriggerDirection, AssistantTriggerDirection>,
} as const;

export const OrderPriceFieldCodec = {
    protoToOutput: {
        [Proto.OrderPriceField.PRICE_FIELD_UNSPECIFIED]: "unspecified",
        [Proto.OrderPriceField.LIMIT_PRICE]: "limit_price",
        [Proto.OrderPriceField.TRIGGER_PRICE]: "trigger_price",
        [Proto.OrderPriceField.ACTIVATION_PRICE]: "activation_price",
        [Proto.OrderPriceField.LADDER_LOW_PRICE]: "ladder_low_price",
        [Proto.OrderPriceField.LADDER_HIGH_PRICE]: "ladder_high_price",
        [Proto.OrderPriceField.TAKE_PROFIT_TRIGGER_PRICE]: "take_profit_trigger_price",
        [Proto.OrderPriceField.TAKE_PROFIT_LIMIT_PRICE]: "take_profit_limit_price",
        [Proto.OrderPriceField.STOP_LOSS_TRIGGER_PRICE]: "stop_loss_trigger_price",
        [Proto.OrderPriceField.STOP_LOSS_LIMIT_PRICE]: "stop_loss_limit_price",
        [Proto.OrderPriceField.TRAILING_STOP_ACTIVATION_PRICE]: "trailing_stop_activation_price",
        [Proto.OrderPriceField.TRAILING_STOP_LIMIT_PRICE]: "trailing_stop_limit_price",
    } satisfies ProtoToOutput<Proto.OrderPriceField, AssistantOrderPriceField>,
} as const;

export const PriceOffsetDirectionCodec = {
    protoToOutput: {
        [Proto.PriceOffsetDirection.OFFSET_DIRECTION_UNSPECIFIED]: "unspecified",
        [Proto.PriceOffsetDirection.ABOVE]: "above",
        [Proto.PriceOffsetDirection.BELOW]: "below",
    } satisfies ProtoToOutput<Proto.PriceOffsetDirection, AssistantPriceOffsetDirection>,
} as const;

export const PriceRoundingCodec = {
    protoToOutput: {
        [Proto.PriceRounding.ROUNDING_UNSPECIFIED]: "unspecified",
        [Proto.PriceRounding.DOWN]: "down",
        [Proto.PriceRounding.UP]: "up",
    } satisfies ProtoToOutput<Proto.PriceRounding, AssistantPriceRounding>,
} as const;

export const UnfilledSlicePolicyCodec = {
    protoToOutput: {
        [Proto.UnfilledSlicePolicy.UNFILLED_SLICE_UNSPECIFIED]: "unspecified",
        [Proto.UnfilledSlicePolicy.CANCEL_BEFORE_NEXT]: "cancel_before_next",
    } satisfies ProtoToOutput<Proto.UnfilledSlicePolicy, AssistantUnfilledSlicePolicy>,
} as const;

export const TriggerChangeActionCodec = {
    protoToOutput: {
        [Proto.TriggerChangeAction.TRIGGER_CHANGE_UNSPECIFIED]: "unspecified",
        [Proto.TriggerChangeAction.MODIFY]: "modify",
        [Proto.TriggerChangeAction.PAUSE]: "pause",
        [Proto.TriggerChangeAction.RESUME]: "resume",
    } satisfies ProtoToOutput<Proto.TriggerChangeAction, AssistantTriggerChangeAction>,
} as const;
