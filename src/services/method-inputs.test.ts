import { describe, expect, it } from "vitest";
import * as v from "valibot";
import { SocialProvider } from "../gen/auth/v1/social_verification_pb.js";
import { ResolveAccountInputSchema } from "./accounts/accounts.schemas.js";
import { ApiKeyIdInputSchema } from "./api-keys/api-keys.schemas.js";
import { BalanceHistoryInputSchema, BalancesListInputSchema } from "./balances/balances.schemas.js";
import { OpenOrdersInputSchema } from "./orders/orders-input.schemas.js";
import { assertKnownModifyOrderInputKeys } from "./orders/orders-modify.schemas.js";
import { SocialProviderInputSchema } from "./social-verification/social-verification.schemas.js";
import {
    CreateSubaccountInputSchema,
    SubaccountIdInputSchema,
} from "./subaccounts/subaccounts.schemas.js";

describe("standard object method inputs", () => {
    it("parses account resolve input with query in the object", () => {
        const input = v.parse(ResolveAccountInputSchema, {
            query: " alice ",
            includeSubaccounts: true,
        });

        expect(input).toMatchObject({
            query: "alice",
            includeSubaccounts: true,
        });
    });

    it("parses API key ID input", () => {
        const input = v.parse(ApiKeyIdInputSchema, { keyId: " key_1 " });

        expect(input).toEqual({ keyId: "key_1" });
    });

    it("parses subaccount ID input", () => {
        const input = v.parse(SubaccountIdInputSchema, { subaccountId: " 2 " });

        expect(input).toEqual({ subaccountId: 2n });
    });

    it("parses social provider input", () => {
        const input = v.parse(SocialProviderInputSchema, { provider: "twitter" });

        expect(input).toEqual({ provider: SocialProvider.TWITTER });
    });
});

describe("strict method inputs reject unknown keys", () => {
    it("rejects a top-level subaccount key typo instead of querying the active account", () => {
        expect(() => v.parse(BalancesListInputSchema, { subAccountId: "2" })).toThrow(
            /subAccountId/,
        );
        expect(() =>
            v.parse(BalanceHistoryInputSchema, { range: "7d", subAccountId: "2" }),
        ).toThrow(/subAccountId/);
        expect(() => v.parse(OpenOrdersInputSchema, { symbolId: [1], subAccountId: "2" })).toThrow(
            /subAccountId/,
        );
    });

    it("rejects unknown keys inside the account scope object", () => {
        expect(v.parse(BalancesListInputSchema, { account: { subaccountId: "2" } })).toEqual({
            account: { subaccountId: "2" },
        });
        expect(() =>
            v.parse(BalancesListInputSchema, { account: { subaccountId: "2", extra: true } }),
        ).toThrow();
    });

    it("rejects unknown keys on mutating inputs", () => {
        const create = {
            smartAccountAddress: "0xabc",
            nonce: "1",
            signature: "0xsig",
        };
        expect(() => v.parse(CreateSubaccountInputSchema, create)).not.toThrow();
        expect(() => v.parse(CreateSubaccountInputSchema, { ...create, labell: "typo" })).toThrow(
            /labell/,
        );
    });

    it("rejects unknown modify-order keys while allowing every declared key", () => {
        expect(() => assertKnownModifyOrderInputKeys({ symbolId: 1, newPrise: "1" })).toThrow(
            'Unknown key "newPrise" in modify order input.',
        );
        expect(() =>
            assertKnownModifyOrderInputKeys({
                account: "main",
                symbolId: 1,
                requestId: "req",
                behavior: "amend_or_replace",
                newClientOrderId: "c1",
                orderId: "1",
                clientOrderId: "c0",
                newPrice: "1",
                newQty: "2",
                risk: {},
                clearRisk: false,
            }),
        ).not.toThrow();
    });
});
