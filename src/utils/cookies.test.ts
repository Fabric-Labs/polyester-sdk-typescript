import { afterEach, describe, expect, it } from "vitest";
import {
    deleteCookie,
    getCookie,
    getCookieValue,
    parseCookiesFromRequest,
    setCookie,
    shouldSecureCookies,
} from "./cookies.js";

const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");

type TestGlobal = typeof globalThis & {
    document?: { cookie: string };
};

function installDocument(cookie = ""): void {
    Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: { cookie },
        writable: true,
    });
}

function documentCookie(): string {
    return (globalThis as TestGlobal).document?.cookie ?? "";
}

afterEach(() => {
    if (originalDocument) {
        Object.defineProperty(globalThis, "document", originalDocument);
    } else {
        Reflect.deleteProperty(globalThis, "document");
    }
});

describe("cookie utilities", () => {
    it("returns decoded values from document.cookie", () => {
        installDocument("plain=value; session=%7B%22username%22%3A%22hunter%22%7D; token=a%3Db");

        expect(getCookie("plain")).toBe("value");
        expect(getCookie("session")).toBe('{"username":"hunter"}');
        expect(getCookie("token")).toBe("a=b");
    });

    it("returns decoded values from Request cookie headers", () => {
        const request = new Request("https://example.test", {
            headers: {
                cookie: "session=%7B%22username%22%3A%22hunter%22%7D; token=a=b==",
            },
        });

        const cookies = parseCookiesFromRequest(request);

        expect(cookies.session).toBe('{"username":"hunter"}');
        expect(cookies.token).toBe("a=b==");
    });

    it("returns decoded values from Request cookie getters", () => {
        const request = new Request("https://example.test", {
            headers: {
                cookie: "token=hello%20world",
            },
        });

        expect(getCookieValue(request, "token")).toBe("hello world");
    });

    it("passes through already-parsed cookie getters", () => {
        expect(getCookieValue({ token: "hello%20world" }, "token")).toBe("hello%20world");
        expect(getCookieValue({ get: () => "hello%20world" }, "token")).toBe("hello%20world");
        expect(getCookieValue({ get: (name) => ({ name, value: "hello%20world" }) }, "token")).toBe(
            "hello%20world",
        );
    });

    it("serializes cookies with cookie-es", () => {
        installDocument();

        setCookie({
            name: "session",
            value: "hello world",
            options: {
                expires: new Date("Tue, 19 Jan 2038 03:14:07 GMT"),
                maxAge: 60,
                path: "/",
                sameSite: "lax",
                secure: true,
            },
        });

        expect(documentCookie()).toBe(
            "session=hello%20world; Max-Age=60; Path=/; Expires=Tue, 19 Jan 2038 03:14:07 GMT; Secure; SameSite=Lax",
        );
    });

    it("serializes deletion with cookie-es", () => {
        installDocument("session=value");

        deleteCookie("session");

        expect(documentCookie()).toBe("session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT");
    });
});

describe("shouldSecureCookies", () => {
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

    function installWindow(protocol: string, hostname: string): void {
        Object.defineProperty(globalThis, "window", {
            configurable: true,
            value: { location: { protocol, hostname } },
            writable: true,
        });
    }

    afterEach(() => {
        if (originalWindow) {
            Object.defineProperty(globalThis, "window", originalWindow);
        } else {
            Reflect.deleteProperty(globalThis, "window");
        }
    });

    it("secures cookies on https pages", () => {
        installWindow("https:", "app.polyester.xyz");
        expect(shouldSecureCookies()).toBe(true);
    });

    // Browsers silently DROP Secure cookies written from plaintext origins
    // (localhost excepted), so dev hosts must skip the attribute — phone testing
    // against http://<LAN-IP> used to log users out instantly because the
    // freshly written session cookies never persisted.
    it("skips Secure on plaintext local and private-network hosts", () => {
        installWindow("http:", "localhost");
        expect(shouldSecureCookies()).toBe(false);

        installWindow("http:", "172.16.0.30");
        expect(shouldSecureCookies()).toBe(false);

        installWindow("http:", "192.168.1.5");
        expect(shouldSecureCookies()).toBe(false);

        installWindow("http:", "10.0.0.2");
        expect(shouldSecureCookies()).toBe(false);
    });

    // A public hostname served over plaintext is a misconfigured deployment,
    // never dev — keep Secure so auth fails closed rather than shipping session
    // cookies over http.
    it("keeps Secure on plaintext public hosts", () => {
        installWindow("http:", "app.polyester.xyz");
        expect(shouldSecureCookies()).toBe(true);

        // Public IPv4 and non-private 172.x ranges stay Secure too.
        installWindow("http:", "172.32.0.1");
        expect(shouldSecureCookies()).toBe(true);
    });

    it("defaults to Secure outside the browser", () => {
        if (originalWindow) {
            Object.defineProperty(globalThis, "window", {
                configurable: true,
                value: undefined,
                writable: true,
            });
        }
        expect(shouldSecureCookies()).toBe(true);
    });
});
