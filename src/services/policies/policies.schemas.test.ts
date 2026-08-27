import { describe, expect, it } from "vitest";
import * as v from "valibot";

import * as Proto from "../../gen/auth/v1/policies_pb.js";
import { PROTOBUF_UINT32_MAX } from "../../shared/wire-bounds.js";
import { formatId } from "../../utils/base58-id.js";
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
        spotMarkets: [{ symbolId: 101 }],
        spotMarketScope: Proto.MarketScope_Value.ALL,
        actions: [
            Proto.PolicyAction.TRADE_SPOT,
            Proto.PolicyAction.INTERNAL_TRANSFER,
            Proto.PolicyAction.EXTERNAL_WITHDRAW,
            Proto.PolicyAction.READ_BALANCES,
            Proto.PolicyAction.READ_SPOT,
            Proto.PolicyAction.READ_INTERNAL_TRANSFERS,
            Proto.PolicyAction.READ_ADDRESS_BOOK,
            Proto.PolicyAction.MANAGE_ADDRESS_BOOK,
        ],
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
        spotMarkets: [{ symbolId: 101 }],
        spotMarketScope: Proto.MarketScope_Value.ALL,
        actions: [Proto.PolicyAction.READ_BALANCES],
        sourceTemplateId: 0n,
        maxOrderNotional: 0n,
        maxOpenOrders: 0,
        tradingHalted: false,
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
            actions: [
                "trade-spot",
                "internal-transfer",
                "external-withdraw",
                "read-balances",
                "read-spot",
                "read-internal-transfers",
                "read-address-book",
                "manage-address-book",
            ],
        });

        expect(v.parse(SubaccountPolicySchema, subaccountPolicy())).toMatchObject({
            spotMarketScope: "all",
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
                spotMarketScope: Proto.MarketScope_Value.UNSPECIFIED,
            }),
        ).toMatchObject({ spotMarketScope: "unspecified" });
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
    it("enforces the positive uint32 symbol identifier boundary", () => {
        expect(
            v.parse(UpdateApiKeyPolicyInputSchema, {
                policyId: formatId(1n),
                expectedRevision: "3",
                spotMarkets: [{ symbolId: PROTOBUF_UINT32_MAX }],
            }).policy,
        ).toEqual({ spotMarkets: [{ symbolId: PROTOBUF_UINT32_MAX }] });
        expect(() =>
            v.parse(UpdateApiKeyPolicyInputSchema, {
                policyId: formatId(1n),
                expectedRevision: "3",
                spotMarkets: [{ symbolId: PROTOBUF_UINT32_MAX + 1 }],
            }),
        ).toThrow();
    });

    it("preserves false, empty arrays, and nullable timestamp clears", () => {
        const patch = v.parse(UpdateSubaccountPolicyInputSchema, {
            policyId: formatId(1n),
            expectedRevision: "4",
            actions: ["read-balances", "read-spot"],
            spotMarkets: [],
            tradingHalted: false,
            reviewAt: null,
        });

        expect(patch).toEqual({
            policyId: 1n,
            policy: {
                actions: [Proto.PolicyAction.READ_BALANCES, Proto.PolicyAction.READ_SPOT],
                spotMarkets: [],
                tradingHalted: false,
            },
            updateMask: {
                paths: ["spot_markets", "actions", "trading_halted", "review_at"],
            },
            expectedRevision: 4n,
        });
    });

    it("preserves API policy empty arrays and false", () => {
        expect(
            v.parse(UpdateApiKeyPolicyInputSchema, {
                policyId: formatId(1n),
                expectedRevision: "3",
                actions: [],
                isTemplate: false,
            }),
        ).toEqual({
            policyId: 1n,
            policy: { actions: [], isTemplate: false },
            updateMask: { paths: ["actions", "is_template"] },
            expectedRevision: 3n,
        });
    });
});
