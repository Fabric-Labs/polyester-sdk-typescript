import { describe, expect, it } from "vitest";
import { POLYESTER_AUTH_TOKEN_COOKIE_NAME, resolveAuthCookieName } from "./cookie-constants.js";

describe("resolveAuthCookieName", () => {
    it("uses an explicit local port for default and custom cookie names", () => {
        const location = { hostname: "app.localhost", port: "5173", protocol: "http:" };

        expect(resolveAuthCookieName(POLYESTER_AUTH_TOKEN_COOKIE_NAME, location)).toBe(
            "polyester_auth_token_port_5173",
        );
        expect(resolveAuthCookieName("custom_token", location)).toBe("custom_token_port_5173");
    });

    it("uses protocol default ports when local URLs omit a port", () => {
        expect(
            resolveAuthCookieName(POLYESTER_AUTH_TOKEN_COOKIE_NAME, {
                hostname: "localhost",
                port: "",
                protocol: "http:",
            }),
        ).toBe("polyester_auth_token_port_80");
        expect(
            resolveAuthCookieName(POLYESTER_AUTH_TOKEN_COOKIE_NAME, {
                hostname: "localhost",
                port: "",
                protocol: "https:",
            }),
        ).toBe("polyester_auth_token_port_443");
    });

    it("retains the stable name on public hosts", () => {
        expect(
            resolveAuthCookieName(POLYESTER_AUTH_TOKEN_COOKIE_NAME, {
                hostname: "app.polyester.exchange",
                port: "",
                protocol: "https:",
            }),
        ).toBe(POLYESTER_AUTH_TOKEN_COOKIE_NAME);
    });
});
