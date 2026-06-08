import { describe, expect, it } from "vitest";
import * as v from "valibot";

import * as Proto from "../../gen/auth/v1/policies_pb.js";
import { ApiKeyPolicySchema } from "./api-key-policies/api-key-policies.schemas.js";
import { SubaccountPolicySchema } from "./subaccount-policies/subaccount-policies.schemas.js";

const timestamp = { seconds: 0n, nanos: 0 };

function apiKeyPolicy() {
    return {
        id: 1n,
        name: "API key policy",
        description: "",
        spotMarkets: [],
        spotMarketScope: Proto.MarketScope_Value.ALL,
        perpMarketScope: Proto.MarketScope_Value.ALLOWLIST,
        perpMarkets: [],
        actions: [
            Proto.PolicyAction.TRADE_SPOT,
            Proto.PolicyAction.TRADE_PERP,
            Proto.PolicyAction.INTERNAL_TRANSFER,
            Proto.PolicyAction.EXTERNAL_WITHDRAW,
            Proto.PolicyAction.READ_BALANCES,
            Proto.PolicyAction.READ_SPOT,
            Proto.PolicyAction.READ_PERP,
            Proto.PolicyAction.READ_INTERNAL_TRANSFERS,
            Proto.PolicyAction.READ_EXTERNAL_WITHDRAWALS,
            Proto.PolicyAction.READ_TRANSFER_CONTROLS,
            Proto.PolicyAction.MANAGE_ADDRESS_BOOK,
            Proto.PolicyAction.MANAGE_TRANSFER_WHITELISTS,
        ],
        dailyInternalTransferOutLimit: 0n,
        dailyWithdrawLimit: 0n,
        createdAt: timestamp,
        updatedAt: timestamp,
    };
}

function subaccountPolicy() {
    return {
        id: 1n,
        name: "Subaccount policy",
        description: "",
        spotMarkets: [],
        spotMarketScope: Proto.MarketScope_Value.ALL,
        perpMarketScope: Proto.MarketScope_Value.ALLOWLIST,
        perpMarkets: [],
        actions: [Proto.PolicyAction.READ_BALANCES],
        sourceTemplateId: 0n,
        globalNotionalCap: 0n,
        maxOrderNotional: 0n,
        maxOpenOrders: 0,
        maxOpenPositions: 0,
        globalPerpLeverageX: 0,
        dailyInternalTransferOutLimit: 0n,
        dailyWithdrawLimit: 0n,
        internalTransfersOwnOnly: true,
        enforceWithdrawWhitelist: false,
        tradingHalted: false,
        liquidationOnly: false,
        dailyLossLimit: 0n,
        intradayDrawdownLimitBps: 0,
        locked: false,
        createdAt: timestamp,
        updatedAt: timestamp,
    };
}

describe("policy output schemas", () => {
    it("maps concrete policy permission enums to output labels", () => {
        expect(v.parse(ApiKeyPolicySchema, apiKeyPolicy())).toMatchObject({
            spotMarketScope: "all",
            perpMarketScope: "allowlist",
            actions: [
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
            ],
        });

        expect(v.parse(SubaccountPolicySchema, subaccountPolicy())).toMatchObject({
            spotMarketScope: "all",
            perpMarketScope: "allowlist",
            actions: ["read-balances"],
        });
    });

    it("rejects unspecified market scopes instead of exposing them as permissions", () => {
        expect(() =>
            v.parse(ApiKeyPolicySchema, {
                ...apiKeyPolicy(),
                spotMarketScope: Proto.MarketScope_Value.UNSPECIFIED,
            }),
        ).toThrow("invalid market scope 0");
        expect(() =>
            v.parse(SubaccountPolicySchema, {
                ...subaccountPolicy(),
                perpMarketScope: Proto.MarketScope_Value.UNSPECIFIED,
            }),
        ).toThrow("invalid market scope 0");
    });

    it("rejects unspecified actions instead of exposing them as permissions", () => {
        expect(() =>
            v.parse(ApiKeyPolicySchema, {
                ...apiKeyPolicy(),
                actions: [Proto.PolicyAction.UNSPECIFIED],
            }),
        ).toThrow("invalid policy action 0");
        expect(() =>
            v.parse(SubaccountPolicySchema, {
                ...subaccountPolicy(),
                actions: [Proto.PolicyAction.UNSPECIFIED],
            }),
        ).toThrow("invalid policy action 0");
    });
});
