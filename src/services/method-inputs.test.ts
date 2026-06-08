import { describe, expect, it } from "vitest";
import * as v from "valibot";
import { SocialProvider } from "../gen/auth/v1/social_verification_pb.js";
import { ResolveAccountInputSchema } from "./accounts/accounts.schemas.js";
import { ApiKeyIdInputSchema } from "./api-keys/api-keys.schemas.js";
import { SocialProviderInputSchema } from "./social-verification/social-verification.schemas.js";
import { SubaccountIdInputSchema } from "./subaccounts/subaccounts.schemas.js";

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
