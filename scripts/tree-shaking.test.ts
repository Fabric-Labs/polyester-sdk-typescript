import { readdirSync } from "node:fs";
import path from "node:path";
import { rolldown } from "rolldown";
import { describe, expect, it } from "vitest";
import { POLYESTER_SERVICES } from "../src/client.js";
import { POLYESTER_SERVER_SERVICES } from "../src/server-client.js";

/**
 * Bundles small apps against `src/` and inspects the entry chunk (what a page
 * loads up front) to keep the cores tree-shakable: a core that only touches
 * auth must not pull in other services, their descriptors, or API-key signing.
 */

const SRC_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../src");
const ENTRY = "\0tree-shaking-entry";

async function entryModules(source: string): Promise<string[]> {
    const bundle = await rolldown({
        input: ENTRY,
        platform: "browser",
        logLevel: "silent",
        resolve: { extensionAlias: { ".js": [".ts", ".js"] } },
        plugins: [
            {
                name: "tree-shaking-entry",
                resolveId: (id) => (id === ENTRY ? id : null),
                load: (id) => (id === ENTRY ? source.replaceAll("@sdk/", `${SRC_DIR}/`) : null),
            },
        ],
    });
    const { output } = await bundle.generate({ format: "esm" });
    await bundle.close();
    const chunks = new Map(
        output.flatMap((file) => (file.type === "chunk" ? [[file.fileName, file] as const] : [])),
    );
    // What a page loads up front: the entry chunk plus its static-import closure.
    const initial = new Set<string>();
    const visit = (fileName: string) => {
        if (initial.has(fileName)) return;
        initial.add(fileName);
        chunks.get(fileName)?.imports.forEach(visit);
    };
    const entry = [...chunks.values()].find((chunk) => chunk.isEntry);
    if (!entry) throw new Error("Expected an entry chunk.");
    visit(entry.fileName);
    return [...initial].flatMap((fileName) =>
        Object.entries(chunks.get(fileName)!.modules)
            .filter(([, module]) => module.renderedLength > 0)
            .map(([id]) =>
                id.startsWith(SRC_DIR)
                    ? path.relative(SRC_DIR, id)
                    : id.replace(/^.*node_modules\//u, "node_modules/"),
            ),
    );
}

// Service implementations other than auth (and the MFA schemas auth reuses).
const serviceModules = (modules: string[]) =>
    modules.filter(
        (id) =>
            id.startsWith("services/") &&
            !/^services\/(auth\/|mfa\/mfa\.(schemas|codecs))/u.test(id),
    );
const generatedModules = (modules: string[]) => modules.filter((id) => id.startsWith("gen/"));

const AUTH_DESCRIPTORS = [
    "gen/auth/v1/auth_pb.ts",
    "gen/auth/v1/mfa_pb.ts",
    "gen/auth/v1/profile_pb.ts",
    "gen/polyester/api/options_pb.ts",
];

describe("core tree-shaking", () => {
    it("keeps a browser core that only uses auth to core + auth", async () => {
        const modules = await entryModules(`
            import { PolyesterBrowserCore, POLYESTER_TESTNET_ENVIRONMENT } from "@sdk/index.ts";
            const core = new PolyesterBrowserCore({ environment: POLYESTER_TESTNET_ENVIRONMENT });
            console.log(core.auth.getState(), core.catalog.snapshot());
        `);

        expect(serviceModules(modules)).toEqual([]);
        expect(generatedModules(modules).sort()).toEqual(AUTH_DESCRIPTORS);
        expect(modules.filter((id) => id.includes("@noble/ed25519"))).toEqual([]);
    });

    it("keeps a server core that only verifies sessions to core + auth", async () => {
        const modules = await entryModules(`
            import { createPolyesterServerCoreFromCookies, POLYESTER_TESTNET_ENVIRONMENT } from "@sdk/index.ts";
            const core = createPolyesterServerCoreFromCookies({ cookies: {}, environment: POLYESTER_TESTNET_ENVIRONMENT });
            console.log(await core.verifySession());
        `);

        expect(serviceModules(modules)).toEqual([]);
        expect(generatedModules(modules).sort()).toEqual(AUTH_DESCRIPTORS);
        expect(modules.filter((id) => id.includes("@noble/ed25519"))).toEqual([]);
    });

    it("adds only the services a core reaches through accessors", async () => {
        const modules = await entryModules(`
            import { PolyesterBrowserCore, POLYESTER_TESTNET_ENVIRONMENT } from "@sdk/index.ts";
            import { ordersService } from "@sdk/services/orders/service.ts";
            const core = new PolyesterBrowserCore({ environment: POLYESTER_TESTNET_ENVIRONMENT });
            console.log(await ordersService(core).listOpen({}));
        `);

        expect(modules).toContain("services/orders/orders.ts");
        expect(modules).not.toContain("services/triggers/triggers.ts");
        expect(modules).not.toContain("services/subaccounts/subaccounts.ts");
    });

    it("keeps every service reachable from the full client", async () => {
        const modules = await entryModules(`
            import { PolyesterBrowserClient, POLYESTER_TESTNET_ENVIRONMENT } from "@sdk/index.ts";
            console.log(new PolyesterBrowserClient({ environment: POLYESTER_TESTNET_ENVIRONMENT }));
        `);

        expect(modules).toContain("services/orders/orders.ts");
        expect(modules).toContain("services/triggers/triggers.ts");
        expect(modules).toContain("services/subaccounts/subaccounts.ts");
        // Server-only: the broker API must never ship to a browser.
        expect(modules).not.toContain("services/quickswap/quickswap.ts");
        expect(modules).not.toContain("gen/swap/quickswap/v1/quickswap_pb.ts");
    });

    it("adds the server-only QuickSwap service to the full server client", async () => {
        const modules = await entryModules(`
            import { PolyesterServerClient, POLYESTER_TESTNET_ENVIRONMENT } from "@sdk/index.ts";
            console.log(new PolyesterServerClient({ environment: POLYESTER_TESTNET_ENVIRONMENT }));
        `);

        expect(modules).toContain("services/quickswap/quickswap.ts");
        expect(modules).toContain("gen/swap/quickswap/v1/quickswap_pb.ts");
    });
});

describe("service accessor modules", () => {
    it("gives the full clients a getter for every service accessor module", async () => {
        const accessors = new Set<unknown>([
            ...Object.values(POLYESTER_SERVICES),
            ...Object.values(POLYESTER_SERVER_SERVICES),
        ]);
        const modules = readdirSync(path.join(SRC_DIR, "services"), { withFileTypes: true }).filter(
            (entry) =>
                entry.isDirectory() &&
                readdirSync(path.join(path.join(SRC_DIR, "services"), entry.name)).includes(
                    "service.ts",
                ),
        );
        expect(modules).toHaveLength(accessors.size);
        for (const { name } of modules) {
            const exports: Record<string, unknown> = await import(
                `../src/services/${name}/service.ts`
            );
            for (const accessor of Object.values(exports)) {
                expect(accessors.has(accessor), `services/${name}/service.ts`).toBe(true);
            }
        }
    });
});

describe("server-only service accessors", () => {
    it("keeps them out of the accessors the browser client shares", () => {
        for (const name of Object.keys(POLYESTER_SERVER_SERVICES)) {
            expect(Object.keys(POLYESTER_SERVICES)).not.toContain(name);
        }
    });
});
