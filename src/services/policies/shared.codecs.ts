import * as Proto from "../../gen/auth/v1/policies_pb.js";
import { requiredEnumLabel } from "../../shared/proto-enum-codec.js";
import type { ExcludeUnspecified } from "../../utils/types.js";

export const POLICY_ACTION_LABELS = [
    "trade-spot",
    "trade-perp",
    "internal-transfer",
    "external-withdraw",
    "read-balances",
    "read-spot",
    "read-perp",
    "read-internal-transfers",
    "read-external-withdrawals",
    "read-transfer-controls",
    "manage-address-book",
    "manage-transfer-whitelists",
] as const;
export type PolicyActionLabel = (typeof POLICY_ACTION_LABELS)[number];

export const POLICY_MARKET_SCOPE_LABELS = ["all", "allowlist"] as const;
export type PolicyMarketScopeLabel = (typeof POLICY_MARKET_SCOPE_LABELS)[number];

export const PolicyMarketScopeCodec = {
    inputToProto: {
        all: Proto.MarketScope_Value.ALL,
        allowlist: Proto.MarketScope_Value.ALLOWLIST,
    } satisfies Record<PolicyMarketScopeLabel, Proto.MarketScope_Value>,
    protoToOutput: {
        [Proto.MarketScope_Value.ALL]: "all",
        [Proto.MarketScope_Value.ALLOWLIST]: "allowlist",
    } satisfies Record<ExcludeUnspecified<Proto.MarketScope_Value>, PolicyMarketScopeLabel>,
} as const;

export const PolicyActionCodec = {
    protoToOutput: {
        [Proto.PolicyAction.TRADE_SPOT]: "trade-spot",
        [Proto.PolicyAction.TRADE_PERP]: "trade-perp",
        [Proto.PolicyAction.INTERNAL_TRANSFER]: "internal-transfer",
        [Proto.PolicyAction.EXTERNAL_WITHDRAW]: "external-withdraw",
        [Proto.PolicyAction.READ_BALANCES]: "read-balances",
        [Proto.PolicyAction.READ_SPOT]: "read-spot",
        [Proto.PolicyAction.READ_PERP]: "read-perp",
        [Proto.PolicyAction.READ_INTERNAL_TRANSFERS]: "read-internal-transfers",
        [Proto.PolicyAction.READ_EXTERNAL_WITHDRAWALS]: "read-external-withdrawals",
        [Proto.PolicyAction.READ_TRANSFER_CONTROLS]: "read-transfer-controls",
        [Proto.PolicyAction.MANAGE_ADDRESS_BOOK]: "manage-address-book",
        [Proto.PolicyAction.MANAGE_TRANSFER_WHITELISTS]: "manage-transfer-whitelists",
    } satisfies Record<ExcludeUnspecified<Proto.PolicyAction>, PolicyActionLabel>,
    inputToProto: {
        "trade-spot": Proto.PolicyAction.TRADE_SPOT,
        "trade-perp": Proto.PolicyAction.TRADE_PERP,
        "internal-transfer": Proto.PolicyAction.INTERNAL_TRANSFER,
        "external-withdraw": Proto.PolicyAction.EXTERNAL_WITHDRAW,
        "read-balances": Proto.PolicyAction.READ_BALANCES,
        "read-spot": Proto.PolicyAction.READ_SPOT,
        "read-perp": Proto.PolicyAction.READ_PERP,
        "read-internal-transfers": Proto.PolicyAction.READ_INTERNAL_TRANSFERS,
        "read-external-withdrawals": Proto.PolicyAction.READ_EXTERNAL_WITHDRAWALS,
        "read-transfer-controls": Proto.PolicyAction.READ_TRANSFER_CONTROLS,
        "manage-address-book": Proto.PolicyAction.MANAGE_ADDRESS_BOOK,
        "manage-transfer-whitelists": Proto.PolicyAction.MANAGE_TRANSFER_WHITELISTS,
    } satisfies Record<PolicyActionLabel, Proto.PolicyAction>,
} as const;

export function policyMarketScopeLabelFor(value: Proto.MarketScope_Value): PolicyMarketScopeLabel {
    return requiredEnumLabel(
        PolicyMarketScopeCodec.protoToOutput,
        value,
        "PolicyMarketScopeCodec",
        "market scope",
    );
}

export function policyActionLabelFor(value: Proto.PolicyAction): PolicyActionLabel {
    return requiredEnumLabel(
        PolicyActionCodec.protoToOutput,
        value,
        "PolicyActionCodec",
        "policy action",
    );
}
