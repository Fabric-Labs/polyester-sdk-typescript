import { describe, expect, it } from "vitest";
import { resolveSubAccountScopedInput, type SubAccountResolver } from "./sub-account-resolver.js";

function resolver(defaultSubAccountId: string | null): SubAccountResolver {
	return {
		getDefaultSubAccountId: () => defaultSubAccountId,
	};
}

describe("resolveSubAccountScopedInput", () => {
	it("uses the resolver default when subAccountId is omitted", () => {
		const input = resolveSubAccountScopedInput({ limit: 50 }, resolver("sub-1"));

		expect(input).toEqual({ limit: 50, subAccountId: "sub-1" });
	});

	it("prefers explicit subAccountId over the resolver default", () => {
		const input = resolveSubAccountScopedInput(
			{ limit: 50, subAccountId: "explicit-sub" },
			resolver("default-sub")
		);

		expect(input).toEqual({ limit: 50, subAccountId: "explicit-sub" });
	});

	it("uses undefined for an empty subAccountId to force main-account scope", () => {
		const input = resolveSubAccountScopedInput(
			{ limit: 50, subAccountId: "" },
			resolver("default-sub")
		);

		expect(input).toEqual({ limit: 50, subAccountId: undefined });
	});
});
