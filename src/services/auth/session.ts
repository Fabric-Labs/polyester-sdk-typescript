import { setCookie, deleteCookie, getCookie } from "../../utils/cookies.js";
import { isDev } from "../../utils/is-dev.js";
import {
    POLYESTER_SESSION_COOKIE_NAME,
    POLYESTER_LOGIN_COOKIE_MAX_AGE,
} from "./cookie-constants.js";
import { parseSessionData } from "./session.schemas.js";
import type { ActiveAccountInfo, AuthLoginMethod, SessionData } from "./session.types.js";

export type { ActiveAccountInfo, AuthLoginMethod, SessionData };

interface SessionCookieOptions {
    maxAgeSeconds?: number | null;
}

function resolveSessionCookieMaxAge(options?: SessionCookieOptions): number | undefined {
    if (!options) return POLYESTER_LOGIN_COOKIE_MAX_AGE;
    return options.maxAgeSeconds ?? undefined;
}

class PolyesterSessionManager {
    set(session: SessionData, options?: SessionCookieOptions): void {
        setCookie({
            name: POLYESTER_SESSION_COOKIE_NAME,
            value: JSON.stringify(session),
            options: {
                path: "/",
                maxAge: resolveSessionCookieMaxAge(options),
                secure: !isDev(),
                sameSite: "lax",
            },
        });
    }

    get(): SessionData | null {
        const value = getCookie(POLYESTER_SESSION_COOKIE_NAME);
        if (!value) return null;
        try {
            // handle legacy double-encoded cookies (value was previously encoded before passing to setCookie)
            const jsonStr = value.startsWith("%7B") ? decodeURIComponent(value) : value;
            const session = parseSessionData(JSON.parse(jsonStr));
            if (!session) {
                this.clear();
                return null;
            }
            return session;
        } catch {
            this.clear();
            return null;
        }
    }

    setActiveAccount(
        activeAccount: Omit<ActiveAccountInfo, "mainAccountId">,
        options?: SessionCookieOptions,
    ): void {
        const session = this.get();
        if (!session) return;
        const mainAccountId = session.activeAccount?.mainAccountId ?? activeAccount.accountId;
        const smartAccountAddress = activeAccount.isMain
            ? session.smartAccount
            : activeAccount.smartAccountAddress;
        const label = activeAccount.isMain ? undefined : activeAccount.label;
        this.set(
            {
                ...session,
                activeAccount: { ...activeAccount, mainAccountId, smartAccountAddress, label },
                username: session.username,
            },
            options,
        );
    }

    setUsername(username: string | null, options?: SessionCookieOptions): void {
        const session = this.get();
        if (!session) return;
        const nextSession = { ...session };

        if (username) {
            nextSession.username = username;
        } else {
            delete nextSession.username;
        }

        this.set(nextSession, options);
    }

    clear(): void {
        deleteCookie(POLYESTER_SESSION_COOKIE_NAME);
    }
}

export const polyesterSession = new PolyesterSessionManager();
