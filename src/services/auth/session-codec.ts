import { parseSessionData } from "./session.schemas.js";
import type { SessionData } from "./session.types.js";

/**
 * Owns serialization details for the client-readable auth session cookie.
 */
export const SessionCodec = {
    encode(session: SessionData): string {
        return JSON.stringify(session);
    },

    decode(value: string): SessionData | null {
        try {
            const jsonStr = value.startsWith("%7B") ? decodeURIComponent(value) : value;
            return parseSessionData(JSON.parse(jsonStr));
        } catch {
            return null;
        }
    },
};
