// v3: session payload schema added a required environmentFingerprint; bumping
// the cookie name makes the migration an explicit new cookie instead of a
// failed parse of the old one (old sessions are simply ignored).
export const POLYESTER_SESSION_COOKIE_NAME = "polyester_session_3";
export const POLYESTER_LOGIN_COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days
export const POLYESTER_AUTH_TOKEN_COOKIE_NAME = "polyester_auth_token";
