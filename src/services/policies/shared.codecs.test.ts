import { describe, expect, it } from "vitest";

import * as Proto from "../../gen/auth/v1/policies_pb.js";
import {
    PolicyActionCodec,
    PolicyMarketScopeCodec,
    policyActionLabelFor,
    policyMarketScopeLabelFor,
} from "./shared.codecs.js";

const marketScopeCases = [
    [Proto.MarketScope_Value.ALL, "all"],
    [Proto.MarketScope_Value.ALLOWLIST, "allowlist"],
] as const;

const policyActionCases = [
    [Proto.PolicyAction.TRADE_SPOT, "trade-spot"],
    [Proto.PolicyAction.TRADE_PERP, "trade-perp"],
    [Proto.PolicyAction.INTERNAL_TRANSFER, "internal-transfer"],
    [Proto.PolicyAction.EXTERNAL_WITHDRAW, "external-withdraw"],
    [Proto.PolicyAction.READ_BALANCES, "read-balances"],
    [Proto.PolicyAction.READ_SPOT, "read-spot"],
    [Proto.PolicyAction.READ_PERP, "read-perp"],
    [Proto.PolicyAction.READ_INTERNAL_TRANSFERS, "read-internal-transfers"],
    [Proto.PolicyAction.READ_EXTERNAL_WITHDRAWALS, "read-external-withdrawals"],
    [Proto.PolicyAction.READ_TRANSFER_CONTROLS, "read-transfer-controls"],
    [Proto.PolicyAction.MANAGE_ADDRESS_BOOK, "manage-address-book"],
    [Proto.PolicyAction.MANAGE_TRANSFER_WHITELISTS, "manage-transfer-whitelists"],
] as const;

describe("PolicyMarketScopeCodec", () => {
    it("maps every concrete proto market scope to its output label", () => {
        for (const [protoValue, label] of marketScopeCases) {
            expect(PolicyMarketScopeCodec.protoToOutput[protoValue]).toBe(label);
            expect(policyMarketScopeLabelFor(protoValue)).toBe(label);
        }
    });

    it("does not convert an unspecified market scope into a permission label", () => {
        expect(Proto.MarketScope_Value.UNSPECIFIED in PolicyMarketScopeCodec.protoToOutput).toBe(
            false,
        );
        expect(() => policyMarketScopeLabelFor(Proto.MarketScope_Value.UNSPECIFIED)).toThrow(
            "invalid market scope 0",
        );
    });
});

describe("PolicyActionCodec", () => {
    it("maps every concrete proto action to its output label", () => {
        for (const [protoValue, label] of policyActionCases) {
            expect(PolicyActionCodec.protoToOutput[protoValue]).toBe(label);
            expect(policyActionLabelFor(protoValue)).toBe(label);
        }
    });

    it("does not convert an unspecified action into a permission label", () => {
        expect(Proto.PolicyAction.UNSPECIFIED in PolicyActionCodec.protoToOutput).toBe(false);
        expect(() => policyActionLabelFor(Proto.PolicyAction.UNSPECIFIED)).toThrow(
            "invalid policy action 0",
        );
    });
});
