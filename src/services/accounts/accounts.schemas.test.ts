import { describe, expect, it } from "vitest";
import * as v from "valibot";
import * as ProtoResolve from "../../gen/auth/v1/resolve_pb.js";
import { formatId } from "../../utils/base58-id.js";
import { ResolveAccountInputSchema, ResolvedAccountSchema } from "./accounts.schemas.js";

describe("ResolveAccountInputSchema", () => {
    it("trims queries and normalizes supported resolve hints", () => {
        const publicIdInput = v.parse(ResolveAccountInputSchema, {
            query: " alice ",
            hint: " public_id ",
            includeSubaccounts: true,
        });
        const prefixedInput = v.parse(ResolveAccountInputSchema, {
            query: "0x0000000000000000000000000000000000000001",
            hint: "RESOLVE_HINT_SMART_ACCOUNT",
        });

        expect(publicIdInput).toEqual({
            query: "alice",
            hint: ProtoResolve.ResolveHint.ID,
            includeSubaccounts: true,
        });
        expect(prefixedInput).toEqual({
            query: "0x0000000000000000000000000000000000000001",
            hint: ProtoResolve.ResolveHint.SMART_ACCOUNT,
            includeSubaccounts: false,
        });
    });

    it("falls back to unspecified hints and rejects empty queries", () => {
        const input = v.parse(ResolveAccountInputSchema, {
            query: "alice",
            hint: "unknown",
        });

        expect(input.hint).toBe(ProtoResolve.ResolveHint.RESOLVE_HINT_UNSPECIFIED);
        expect(() => v.parse(ResolveAccountInputSchema, { query: " " })).toThrow();
    });
});

describe("ResolvedAccountSchema", () => {
    it("formats account IDs and preserves optional account labels", () => {
        const account = v.parse(ResolvedAccountSchema, {
            smartAccountAddress: "0x0000000000000000000000000000000000000001",
            kind: ProtoResolve.ResolvedAccount_Kind.SUB,
            rootUsername: "alice",
            subaccountLabel: "Trading",
            accountId: 42n,
        });

        expect(account).toEqual({
            smartAccountAddress: "0x0000000000000000000000000000000000000001",
            kind: "sub",
            rootUsername: "alice",
            subaccountLabel: "Trading",
            accountId: formatId(42n),
        });

        expect(() =>
            v.parse(ResolvedAccountSchema, {
                smartAccountAddress: "0x0000000000000000000000000000000000000001",
                kind: 999,
                accountId: 42n,
            }),
        ).toThrow();
    });
});
