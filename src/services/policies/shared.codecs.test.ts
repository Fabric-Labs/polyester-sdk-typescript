import { describe, expect, it } from "vitest";

import * as Proto from "../../gen/auth/v1/policies_pb.js";
import {
    PolicyActionCodec,
    PolicyMarketScopeCodec,
    policyActionLabelFor,
    policyMarketScopeLabelFor,
} from "./shared.codecs.js";

const marketScopeCases = [
    [Proto.MarketScope_Value.UNSPECIFIED, "unspecified"],
    [Proto.MarketScope_Value.ALL, "all"],
    [Proto.MarketScope_Value.ALLOWLIST, "allowlist"],
] as const;

const policyActionCases = [
    [Proto.PolicyAction.UNSPECIFIED, "unspecified"],
    [Proto.PolicyAction.TRADE_SPOT, "trade-spot"],
    [Proto.PolicyAction.INTERNAL_TRANSFER, "internal-transfer"],
    [Proto.PolicyAction.EXTERNAL_WITHDRAW, "external-withdraw"],
    [Proto.PolicyAction.READ_BALANCES, "read-balances"],
    [Proto.PolicyAction.READ_SPOT, "read-spot"],
    [Proto.PolicyAction.READ_INTERNAL_TRANSFERS, "read-internal-transfers"],
    [Proto.PolicyAction.READ_ADDRESS_BOOK, "read-address-book"],
    [Proto.PolicyAction.MANAGE_ADDRESS_BOOK, "manage-address-book"],
    [Proto.PolicyAction.READ_AUTO_WITHDRAW, "read-auto-withdraw"],
    [Proto.PolicyAction.MANAGE_AUTO_WITHDRAW, "manage-auto-withdraw"],
    [Proto.PolicyAction.SWAP, "swap"],
    [Proto.PolicyAction.READ_API_KEYS, "read-api-keys"],
    [Proto.PolicyAction.READ_API_POLICIES, "read-api-policies"],
    [Proto.PolicyAction.READ_SUBACCOUNT_POLICIES, "read-subaccount-policies"],
    [Proto.PolicyAction.READ_SUBACCOUNT_PERMISSIONS, "read-subaccount-permissions"],
    [Proto.PolicyAction.READ_VIP_STATUS, "read-vip-status"],
    [Proto.PolicyAction.READ_SOCIAL_VERIFICATION, "read-social-verification"],
    [Proto.PolicyAction.READ_PROFILE, "read-profile"],
    [Proto.PolicyAction.READ_ACCOUNT_DIRECTORY, "read-account-directory"],
    [Proto.PolicyAction.READ_WITHDRAW_VALIDATION, "read-withdraw-validation"],
    [Proto.PolicyAction.READ_DAILY_CLAIMS, "read-daily-claims"],
    [Proto.PolicyAction.CLAIM_DAILY_REWARD, "claim-daily-reward"],
    [Proto.PolicyAction.READ_CHECKPOINTS, "read-checkpoints"],
    [Proto.PolicyAction.READ_REWARDS, "read-rewards"],
    [Proto.PolicyAction.CREATE_DEPOSIT_ADDRESS, "create-deposit-address"],
    [Proto.PolicyAction.READ_DEPOSIT_ADDRESSES, "read-deposit-addresses"],
    [Proto.PolicyAction.READ_SUBACCOUNTS, "read-subaccounts"],
    [Proto.PolicyAction.READ_SUBACCOUNT_ACTIVITY, "read-subaccount-activity"],
    [Proto.PolicyAction.READ_SUBACCOUNT_MEMBERS, "read-subaccount-members"],
    [Proto.PolicyAction.READ_SUBACCOUNT_INVITES, "read-subaccount-invites"],
    [Proto.PolicyAction.READ_GUARD_SIGNER_STATUS, "read-guard-signer-status"],
    [Proto.PolicyAction.READ_PRICE_ALERTS, "read-price-alerts"],
    [Proto.PolicyAction.MANAGE_PRICE_ALERTS, "manage-price-alerts"],
] as const;

describe("PolicyMarketScopeCodec", () => {
    it("maps every concrete proto market scope to its output label", () => {
        for (const [protoValue, label] of marketScopeCases) {
            expect(PolicyMarketScopeCodec.protoToOutput[protoValue]).toBe(label);
            expect(policyMarketScopeLabelFor(protoValue)).toBe(label);
        }
    });
});

describe("PolicyActionCodec", () => {
    it("maps every concrete proto action to its output label", () => {
        for (const [protoValue, label] of policyActionCases) {
            expect(PolicyActionCodec.protoToOutput[protoValue]).toBe(label);
            expect(policyActionLabelFor(protoValue)).toBe(label);
        }
    });
});
