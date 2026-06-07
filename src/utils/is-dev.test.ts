import { afterEach, describe, expect, it } from "vitest";
import { isDev } from "./is-dev.js";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

function installWindow(url: string): void {
    const location = new URL(url);
    Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: {
            location: {
                hostname: location.hostname,
            },
        },
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

describe("isDev", () => {
    it("returns false outside the browser", () => {
        Reflect.deleteProperty(globalThis, "window");

        expect(isDev()).toBe(false);
    });

    it("returns true for explicit local development hosts", () => {
        for (const url of [
            "http://localhost:3000",
            "http://app.localhost:3000",
            "http://127.0.0.1:3000",
            "http://127.24.8.1:3000",
            "http://[::1]:3000",
        ]) {
            installWindow(url);

            expect(isDev()).toBe(true);
        }
    });

    it("returns false for remote hosts on non-standard ports", () => {
        installWindow("https://app.example.com:8443");

        expect(isDev()).toBe(false);
    });
});
