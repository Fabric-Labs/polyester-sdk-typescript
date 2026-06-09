import { describe, expect, it } from "vitest";
import { resolveAccountScopedInput, type SubaccountResolver } from "./subaccount-resolver.js";

function resolver(defaultSubaccountId: string | null): SubaccountResolver {
    return {
        getDefaultSubaccountId: () => defaultSubaccountId,
    };
}

describe("resolveAccountScopedInput", () => {
    it("uses the resolver default when account is omitted", () => {
        const input = resolveAccountScopedInput({ limit: 50 }, resolver("sub-1"));

        expect(input).toEqual({ limit: 50, account: { subaccountId: "sub-1" } });
    });

    it("uses the resolver default for active account scope", () => {
        const input = resolveAccountScopedInput(
            { limit: 50, account: "active" as const },
            resolver("sub-1"),
        );

        expect(input).toEqual({ limit: 50, account: { subaccountId: "sub-1" } });
    });

    it("prefers explicit subaccount scope over the resolver default", () => {
        const input = resolveAccountScopedInput(
            { limit: 50, account: { subaccountId: "explicit-sub" } },
            resolver("default-sub"),
        );

        expect(input).toEqual({ limit: 50, account: { subaccountId: "explicit-sub" } });
    });

    it("uses main-account scope explicitly", () => {
        const input = resolveAccountScopedInput(
            { limit: 50, account: "main" as const },
            resolver("default-sub"),
        );

        expect(input).toEqual({ limit: 50, account: "main" });
    });

    it("rejects legacy subaccountId inputs", () => {
        expect(() =>
            resolveAccountScopedInput(
                { limit: 50, subaccountId: "" } as never,
                resolver("default-sub"),
            ),
        ).toThrow("Use `account:");
    });
});
