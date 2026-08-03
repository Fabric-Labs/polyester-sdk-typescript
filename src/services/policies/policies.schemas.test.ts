import { describe, expect, it } from "vitest";
import * as v from "valibot";

import * as Proto from "../../gen/auth/v1/policies_pb.js";
import {
    ApiKeyPolicySchema,
    UpdateApiKeyPolicyInputSchema,
} from "./api-key-policies/api-key-policies.schemas.js";
import {
    SubaccountPolicySchema,
    UpdateSubaccountPolicyInputSchema,
} from "./subaccount-policies/subaccount-policies.schemas.js";

const createdAt = { seconds: 1n, nanos: 234_567_890 };
const updatedAt = { seconds: 2n, nanos: 345_678_901 };
const reviewAt = { seconds: 3n, nanos: 456_789_012 };
const expiresAt = { seconds: 4n, nanos: 567_890_123 };

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
        isTemplate: false,
        sourceTemplateId: 0n,
        createdAt,
        updatedAt,
        revision: 3n,
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
        reviewAt,
        expiresAt,
        createdAt,
        updatedAt,
        revision: 4n,
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

    it("normalizes policy timestamps without losing exact update ordering", () => {
        const apiKeyOutput = v.parse(ApiKeyPolicySchema, apiKeyPolicy());
        const subaccountOutput = v.parse(SubaccountPolicySchema, subaccountPolicy());

        expect(apiKeyOutput).toMatchObject({
            createdAt: 1_234,
            updatedAt: 2_345,
            updatedAtNs: "2345678901",
        });
        expect(subaccountOutput).toMatchObject({
            reviewAt: 3_456,
            expiresAt: 4_567,
            createdAt: 1_234,
            updatedAt: 2_345,
            updatedAtNs: "2345678901",
        });
        for (const output of [apiKeyOutput, subaccountOutput]) {
            expect(typeof output.createdAt).toBe("number");
            expect(typeof output.updatedAt).toBe("number");
            expect(typeof output.updatedAtNs).toBe("string");
            expect(() => JSON.stringify(output)).not.toThrow();
        }
    });

    it("preserves unspecified market scopes", () => {
        expect(
            v.parse(ApiKeyPolicySchema, {
                ...apiKeyPolicy(),
                spotMarketScope: Proto.MarketScope_Value.UNSPECIFIED,
            }),
        ).toMatchObject({ spotMarketScope: "unspecified" });
        expect(
            v.parse(SubaccountPolicySchema, {
                ...subaccountPolicy(),
                perpMarketScope: Proto.MarketScope_Value.UNSPECIFIED,
            }),
        ).toMatchObject({ perpMarketScope: "unspecified" });
    });

    it("preserves unspecified actions", () => {
        expect(
            v.parse(ApiKeyPolicySchema, {
                ...apiKeyPolicy(),
                actions: [Proto.PolicyAction.UNSPECIFIED],
            }),
        ).toMatchObject({ actions: ["unspecified"] });
        expect(
            v.parse(SubaccountPolicySchema, {
                ...subaccountPolicy(),
                actions: [Proto.PolicyAction.UNSPECIFIED],
            }),
        ).toMatchObject({ actions: ["unspecified"] });
    });
});

describe("policy patch schemas", () => {
    it("preserves false, zero, empty arrays, and nullable timestamp clears", () => {
        const patch = v.parse(UpdateSubaccountPolicyInputSchema, {
            policyId: "1",
            expectedRevision: "4",
            actions: ["read-balances", "read-spot"],
            spotMarkets: [],
            tradingHalted: false,
            dailyLossLimit: 0,
            reviewAt: null,
        });

        expect(patch).toEqual({
            policyId: 1n,
            policy: {
                actions: [Proto.PolicyAction.READ_BALANCES, Proto.PolicyAction.READ_SPOT],
                spotMarkets: [],
                tradingHalted: false,
                dailyLossLimit: 0n,
            },
            updateMask: {
                paths: [
                    "spot_markets",
                    "actions",
                    "trading_halted",
                    "daily_loss_limit",
                    "review_at",
                ],
            },
            expectedRevision: 4n,
        });
        expect(() =>
            v.parse(UpdateSubaccountPolicyInputSchema, {
                policyId: "1",
                expectedRevision: "4",
                actions: ["read-balances"],
            }),
        ).toThrow("read-balances and read-spot");
    });

    it("preserves API policy empty arrays, false, and numeric zero", () => {
        expect(
            v.parse(UpdateApiKeyPolicyInputSchema, {
                policyId: "1",
                expectedRevision: "3",
                actions: [],
                maxOrderNotional: 0,
                isTemplate: false,
            }),
        ).toEqual({
            policyId: 1n,
            policy: { actions: [], maxOrderNotional: 0n, isTemplate: false },
            updateMask: { paths: ["actions", "max_order_notional", "is_template"] },
            expectedRevision: 3n,
        });
    });
});
