import * as Proto from "../../gen/auth/v1/policies_pb.js";
import { enumLabel } from "../../shared/proto-enum-codec.js";
import type { DecodedEnum, ProtoToOutput } from "../../utils/types.js";

/** Product actions, accepted by sub-account and API-key policies. */
export const PRODUCT_POLICY_ACTION_LABELS = [
    "trade-spot",
    "internal-transfer",
    "external-withdraw",
    "read-balances",
    "read-spot",
    "read-internal-transfers",
    "read-address-book",
    "manage-address-book",
    "read-auto-withdraw",
    "manage-auto-withdraw",
    "swap",
] as const;

/**
 * Account permissions, accepted by API-key policies only: a sub-account policy refuses them.
 * Each grants exactly the calls it names, and main-account permissions apply only to keys
 * scoped to the main account.
 */
export const ACCOUNT_PERMISSION_POLICY_ACTION_LABELS = [
    "read-api-keys",
    "read-api-policies",
    "read-subaccount-policies",
    "read-subaccount-permissions",
    "read-vip-status",
    "read-social-verification",
    "read-profile",
    "read-account-directory",
    "read-withdraw-validation",
    "read-daily-claims",
    "claim-daily-reward",
    "read-checkpoints",
    "read-rewards",
    "create-deposit-address",
    "read-deposit-addresses",
    "read-subaccounts",
    "read-subaccount-activity",
    "read-subaccount-members",
    "read-subaccount-invites",
    "read-guard-signer-status",
    "read-price-alerts",
    "manage-price-alerts",
] as const;

export const POLICY_ACTION_LABELS = [
    ...PRODUCT_POLICY_ACTION_LABELS,
    ...ACCOUNT_PERMISSION_POLICY_ACTION_LABELS,
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
        [Proto.MarketScope_Value.UNSPECIFIED]: "unspecified",
        [Proto.MarketScope_Value.ALL]: "all",
        [Proto.MarketScope_Value.ALLOWLIST]: "allowlist",
    } satisfies ProtoToOutput<Proto.MarketScope_Value, PolicyMarketScopeLabel>,
} as const;

export const PolicyActionCodec = {
    protoToOutput: {
        [Proto.PolicyAction.UNSPECIFIED]: "unspecified",
        [Proto.PolicyAction.TRADE_SPOT]: "trade-spot",
        [Proto.PolicyAction.INTERNAL_TRANSFER]: "internal-transfer",
        [Proto.PolicyAction.EXTERNAL_WITHDRAW]: "external-withdraw",
        [Proto.PolicyAction.READ_BALANCES]: "read-balances",
        [Proto.PolicyAction.READ_SPOT]: "read-spot",
        [Proto.PolicyAction.READ_INTERNAL_TRANSFERS]: "read-internal-transfers",
        [Proto.PolicyAction.READ_ADDRESS_BOOK]: "read-address-book",
        [Proto.PolicyAction.MANAGE_ADDRESS_BOOK]: "manage-address-book",
        [Proto.PolicyAction.READ_AUTO_WITHDRAW]: "read-auto-withdraw",
        [Proto.PolicyAction.MANAGE_AUTO_WITHDRAW]: "manage-auto-withdraw",
        [Proto.PolicyAction.SWAP]: "swap",
        [Proto.PolicyAction.READ_API_KEYS]: "read-api-keys",
        [Proto.PolicyAction.READ_API_POLICIES]: "read-api-policies",
        [Proto.PolicyAction.READ_SUBACCOUNT_POLICIES]: "read-subaccount-policies",
        [Proto.PolicyAction.READ_SUBACCOUNT_PERMISSIONS]: "read-subaccount-permissions",
        [Proto.PolicyAction.READ_VIP_STATUS]: "read-vip-status",
        [Proto.PolicyAction.READ_SOCIAL_VERIFICATION]: "read-social-verification",
        [Proto.PolicyAction.READ_PROFILE]: "read-profile",
        [Proto.PolicyAction.READ_ACCOUNT_DIRECTORY]: "read-account-directory",
        [Proto.PolicyAction.READ_WITHDRAW_VALIDATION]: "read-withdraw-validation",
        [Proto.PolicyAction.READ_DAILY_CLAIMS]: "read-daily-claims",
        [Proto.PolicyAction.CLAIM_DAILY_REWARD]: "claim-daily-reward",
        [Proto.PolicyAction.READ_CHECKPOINTS]: "read-checkpoints",
        [Proto.PolicyAction.READ_REWARDS]: "read-rewards",
        [Proto.PolicyAction.CREATE_DEPOSIT_ADDRESS]: "create-deposit-address",
        [Proto.PolicyAction.READ_DEPOSIT_ADDRESSES]: "read-deposit-addresses",
        [Proto.PolicyAction.READ_SUBACCOUNTS]: "read-subaccounts",
        [Proto.PolicyAction.READ_SUBACCOUNT_ACTIVITY]: "read-subaccount-activity",
        [Proto.PolicyAction.READ_SUBACCOUNT_MEMBERS]: "read-subaccount-members",
        [Proto.PolicyAction.READ_SUBACCOUNT_INVITES]: "read-subaccount-invites",
        [Proto.PolicyAction.READ_GUARD_SIGNER_STATUS]: "read-guard-signer-status",
        [Proto.PolicyAction.READ_PRICE_ALERTS]: "read-price-alerts",
        [Proto.PolicyAction.MANAGE_PRICE_ALERTS]: "manage-price-alerts",
    } satisfies ProtoToOutput<Proto.PolicyAction, PolicyActionLabel>,
    inputToProto: {
        "trade-spot": Proto.PolicyAction.TRADE_SPOT,
        "internal-transfer": Proto.PolicyAction.INTERNAL_TRANSFER,
        "external-withdraw": Proto.PolicyAction.EXTERNAL_WITHDRAW,
        "read-balances": Proto.PolicyAction.READ_BALANCES,
        "read-spot": Proto.PolicyAction.READ_SPOT,
        "read-internal-transfers": Proto.PolicyAction.READ_INTERNAL_TRANSFERS,
        "read-address-book": Proto.PolicyAction.READ_ADDRESS_BOOK,
        "manage-address-book": Proto.PolicyAction.MANAGE_ADDRESS_BOOK,
        "read-auto-withdraw": Proto.PolicyAction.READ_AUTO_WITHDRAW,
        "manage-auto-withdraw": Proto.PolicyAction.MANAGE_AUTO_WITHDRAW,
        swap: Proto.PolicyAction.SWAP,
        "read-api-keys": Proto.PolicyAction.READ_API_KEYS,
        "read-api-policies": Proto.PolicyAction.READ_API_POLICIES,
        "read-subaccount-policies": Proto.PolicyAction.READ_SUBACCOUNT_POLICIES,
        "read-subaccount-permissions": Proto.PolicyAction.READ_SUBACCOUNT_PERMISSIONS,
        "read-vip-status": Proto.PolicyAction.READ_VIP_STATUS,
        "read-social-verification": Proto.PolicyAction.READ_SOCIAL_VERIFICATION,
        "read-profile": Proto.PolicyAction.READ_PROFILE,
        "read-account-directory": Proto.PolicyAction.READ_ACCOUNT_DIRECTORY,
        "read-withdraw-validation": Proto.PolicyAction.READ_WITHDRAW_VALIDATION,
        "read-daily-claims": Proto.PolicyAction.READ_DAILY_CLAIMS,
        "claim-daily-reward": Proto.PolicyAction.CLAIM_DAILY_REWARD,
        "read-checkpoints": Proto.PolicyAction.READ_CHECKPOINTS,
        "read-rewards": Proto.PolicyAction.READ_REWARDS,
        "create-deposit-address": Proto.PolicyAction.CREATE_DEPOSIT_ADDRESS,
        "read-deposit-addresses": Proto.PolicyAction.READ_DEPOSIT_ADDRESSES,
        "read-subaccounts": Proto.PolicyAction.READ_SUBACCOUNTS,
        "read-subaccount-activity": Proto.PolicyAction.READ_SUBACCOUNT_ACTIVITY,
        "read-subaccount-members": Proto.PolicyAction.READ_SUBACCOUNT_MEMBERS,
        "read-subaccount-invites": Proto.PolicyAction.READ_SUBACCOUNT_INVITES,
        "read-guard-signer-status": Proto.PolicyAction.READ_GUARD_SIGNER_STATUS,
        "read-price-alerts": Proto.PolicyAction.READ_PRICE_ALERTS,
        "manage-price-alerts": Proto.PolicyAction.MANAGE_PRICE_ALERTS,
    } satisfies Record<PolicyActionLabel, Proto.PolicyAction>,
} as const;

/**
 * Returns the display label for a policy market scope.
 */
export function policyMarketScopeLabelFor(value: number): DecodedEnum<PolicyMarketScopeLabel> {
    return enumLabel(PolicyMarketScopeCodec.protoToOutput, value);
}

/**
 * Returns the display label for a policy action.
 */
export function policyActionLabelFor(value: number): DecodedEnum<PolicyActionLabel> {
    return enumLabel(PolicyActionCodec.protoToOutput, value);
}
