import { afterEach, describe, expect, it } from "vitest";
import {
    deleteCookie,
    getCookie,
    getCookieValue,
    parseCookiesFromRequest,
    setCookie,
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
