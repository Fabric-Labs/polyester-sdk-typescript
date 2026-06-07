import { describe, expect, it } from "vitest";
import { resolveSubaccountScopedInput, type SubaccountResolver } from "./subaccount-resolver.js";

function resolver(defaultSubaccountId: string | null): SubaccountResolver {
    return {
        getDefaultSubaccountId: () => defaultSubaccountId,
    };
}

describe("resolveSubaccountScopedInput", () => {
    it("uses the resolver default when subaccountId is omitted", () => {
        const input = resolveSubaccountScopedInput({ limit: 50 }, resolver("sub-1"));

        expect(input).toEqual({ limit: 50, subaccountId: "sub-1" });
    });

    it("prefers explicit subaccountId over the resolver default", () => {
        const input = resolveSubaccountScopedInput(
            { limit: 50, subaccountId: "explicit-sub" },
            resolver("default-sub"),
        );

        expect(input).toEqual({ limit: 50, subaccountId: "explicit-sub" });
    });

    it("uses undefined for an empty subaccountId to force main-account scope", () => {
        const input = resolveSubaccountScopedInput(
            { limit: 50, subaccountId: "" },
            resolver("default-sub"),
        );

        expect(input).toEqual({ limit: 50, subaccountId: undefined });
    });
});
