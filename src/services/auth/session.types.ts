import type { HexAddress } from "../../account-signer/types.js";

/**
 * Information about the currently active account (main or subaccount).
 * This is the canonical shape used across session storage, SDK state, and hydration.
 */
export interface ActiveAccountInfo {
    accountId: string;
    isMain: boolean;
    mainAccountId: string;
    smartAccountAddress?: string;
    label?: string;
}

export type AuthLoginMethod = "google" | "email" | "metamask" | "phantom" | "walletconnect";

/**
 * Session data stored in cookie for SSR hydration.
 * Contains minimal info needed to restore auth state on page load.
 */
export interface SessionData {
    environmentFingerprint: string;
    provider: "metamask" | "turnkey" | "other";
    loginMethod: AuthLoginMethod | null;
    primaryWallet: string;
    smartAccount: string;
    activeAccount?: ActiveAccountInfo;
    username?: string;
}

/**
 * SDK's internal auth state, exposed via getState().
 * Represents the current authentication status and account info.
 */
export interface AuthState {
    isAuthenticated: boolean;
    accountAddress: HexAddress | null;
    ownerAddress: HexAddress | null;
    mainAccountId: string | null;
    activeAccount: ActiveAccountInfo | null;
}

/**
 * Data needed to hydrate SDK auth state from server-side rendering.
 * Pass this to hydrateAuthState() on mount to avoid flash of unauthenticated content.
 */
export interface AuthHydrationData {
    mainAccountId: string;
    username: string | null;
    activeAccountId?: string;
    smartAccountAddress?: HexAddress;
    ownerAddress?: HexAddress;
}
