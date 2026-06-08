import { afterEach, describe, expect, it, vi } from "vitest";
import { POLYESTER_TESTNET_ENVIRONMENT } from "../../environment.js";
import { POLYESTER_SESSION_COOKIE_NAME } from "./cookie-constants.js";
import { polyesterSession } from "./session.js";
import type { SessionData } from "./session.types.js";

function sessionCookie(session: unknown): string {
    return `${POLYESTER_SESSION_COOKIE_NAME}=${encodeURIComponent(JSON.stringify(session))}`;
}

function validSession(): SessionData {
    return {
        environmentFingerprint: POLYESTER_TESTNET_ENVIRONMENT.fingerprint,
        provider: "metamask",
        loginMethod: "metamask",
        primaryWallet: "0xprimary",
        smartAccount: "0xsmart",
        activeAccount: {
            accountId: "sub-1",
            isMain: false,
            mainAccountId: "main-1",
        },
        username: "hunter",
    };
}

describe("polyesterSession", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("returns schema-valid display session data from cookies", () => {
        const session = validSession();
        vi.stubGlobal("document", { cookie: sessionCookie(session) });

        expect(polyesterSession.get()).toEqual(session);
    });

    it("clears and ignores display session data that fails schema validation", () => {
        const session = {
            ...validSession(),
            activeAccount: {
                accountId: "sub-1",
                isMain: "false",
                mainAccountId: "main-1",
            },
        };
        vi.stubGlobal("document", { cookie: sessionCookie(session) });

        expect(polyesterSession.get()).toBeNull();
        expect(polyesterSession.get()).toBeNull();
    });
});
