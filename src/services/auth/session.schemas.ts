import * as v from "valibot";
import type { SessionData } from "./session.types.js";

export const AuthLoginMethodSchema = v.picklist([
    "google",
    "email",
    "metamask",
    "phantom",
    "walletconnect",
]);

export const ActiveAccountInfoSchema = v.object({
    accountId: v.string(),
    isMain: v.boolean(),
    mainAccountId: v.string(),
    smartAccountAddress: v.optional(v.string()),
    label: v.optional(v.string()),
});

export const SessionDataSchema = v.object({
    environmentFingerprint: v.string(),
    provider: v.picklist(["metamask", "turnkey", "other"]),
    loginMethod: v.nullable(AuthLoginMethodSchema),
    primaryWallet: v.string(),
    smartAccount: v.string(),
    activeAccount: v.optional(ActiveAccountInfoSchema),
    username: v.optional(v.string()),
});

export function parseSessionData(value: unknown): SessionData | null {
    const parsed = v.safeParse(SessionDataSchema, value);
    return parsed.success ? parsed.output : null;
}
