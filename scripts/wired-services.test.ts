import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { DescService } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import { WIRED_SERVICE_DESCRIPTORS } from "../src/wired-services.js";

/**
 * Ground truth for WIRED_SERVICE_DESCRIPTORS: every `createClient(X, ...)` or
 * `createClient(Ns.X, ...)` call site in the service layer, resolved through
 * that file's imports to the generated descriptor it references. If a service
 * wires a new descriptor (or drops one) this test fails until the registry —
 * and therefore every registry-driven mock transport — catches up.
 */

const SRC_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../src");

interface ResolvedDescriptorRef {
    file: string;
    modulePath: string;
    exportName: string;
}

function parseDescriptorRefs(file: string): ResolvedDescriptorRef[] {
    const source = readFileSync(file, "utf8");

    // Namespace imports: import * as Proto from "../../gen/x_pb.js"
    const namespaceImports = new Map<string, string>();
    for (const match of source.matchAll(/import \* as (\w+) from "([^"]+_pb\.js)"/g)) {
        namespaceImports.set(match[1] as string, match[2] as string);
    }

    // Named imports (with optional alias): import { A, B as C } from "..x_pb.js"
    const namedImports = new Map<string, { modulePath: string; exportName: string }>();
    for (const match of source.matchAll(
        /import\s*(?:type\s*)?\{([^}]+)\}\s*from\s*"([^"]+_pb\.js)"/gs,
    )) {
        const modulePath = match[2] as string;
        for (const rawSpecifier of (match[1] as string).split(",")) {
            const specifier = rawSpecifier.replace(/\btype\b/g, "").trim();
            if (!specifier) continue;
            const aliasMatch = specifier.match(/^(\w+)\s+as\s+(\w+)$/);
            if (aliasMatch) {
                namedImports.set(aliasMatch[2] as string, {
                    modulePath,
                    exportName: aliasMatch[1] as string,
                });
            } else {
                namedImports.set(specifier, { modulePath, exportName: specifier });
            }
        }
    }

    const refs: ResolvedDescriptorRef[] = [];
    for (const match of source.matchAll(/createClient\(\s*(\w+)(?:\.(\w+))?/g)) {
        const [, base, member] = match as unknown as [string, string, string | undefined];
        if (member) {
            const modulePath = namespaceImports.get(base);
            if (modulePath) refs.push({ file, modulePath, exportName: member });
        } else {
            const named = namedImports.get(base);
            if (named) refs.push({ file, ...named });
        }
    }
    return refs;
}

/** Maps each service descriptor type name to the service-layer files that create its client. */
async function clientFilesByTypeName(): Promise<Map<string, string[]>> {
    const files = ["services", "realtime"].flatMap((dir) =>
        readdirSync(path.join(SRC_DIR, dir), { recursive: true, withFileTypes: true })
            .filter(
                (entry) =>
                    entry.isFile() &&
                    entry.name.endsWith(".ts") &&
                    !entry.name.endsWith(".test.ts"),
            )
            .map((entry) => path.join(entry.parentPath, entry.name)),
    );
    expect(files.length).toBeGreaterThan(0);

    const byTypeName = new Map<string, string[]>();
    for (const file of files) {
        for (const ref of parseDescriptorRefs(file)) {
            const resolved = path.resolve(path.dirname(file), ref.modulePath);
            const module: Record<string, unknown> = await import(
                /* @vite-ignore */ resolved.replace(/\.js$/, ".ts")
            );
            const descriptor = module[ref.exportName] as { typeName?: string } | undefined;
            expect(
                descriptor?.typeName,
                `${ref.file}: createClient references ${ref.exportName} from ${ref.modulePath}, which is not a service descriptor`,
            ).toBeTruthy();
            const typeName = descriptor?.typeName as string;
            byTypeName.set(typeName, [...(byTypeName.get(typeName) ?? []), file]);
        }
    }
    return byTypeName;
}

describe("WIRED_SERVICE_DESCRIPTORS", () => {
    it("matches every createClient call site in src/services and src/realtime", async () => {
        const wiredTypeNames = [...(await clientFilesByTypeName()).keys()];
        const registryTypeNames = new Set(WIRED_SERVICE_DESCRIPTORS.map((d) => d.typeName));
        expect(wiredTypeNames.sort()).toEqual([...registryTypeNames].sort());
    });

    it("contains no duplicates", () => {
        const names = WIRED_SERVICE_DESCRIPTORS.map((d) => d.typeName);
        expect(new Set(names).size).toBe(names.length);
    });
});

/**
 * Generated services and RPCs deliberately left out of the SDK service layer, by proto name
 * (`pkg.Service` or `pkg.Service.Method`). Everything else under `src/gen` must be wrapped:
 * a new service or RPC fails the test below until it is wrapped or listed here.
 */
const UNWRAPPED_BY_DESIGN = new Set([
    // QuickSwap is consumed through its own integration, not the SDK.
    "swap.quickswap.v1.QuickSwapService",
    "swap.quickswap.v1.QuickSwapBrokerService",
    "swap.quickswap.v1.QuickSwapReferralService",
    // Not wrapped yet; exported raw through `@polyester/sdk/unstable/gen`.
    "swap.v1.SwapService",
]);

describe("generated service coverage", () => {
    it("wraps every generated service and RPC not excluded by design", async () => {
        const clientFiles = await clientFilesByTypeName();
        const genFiles = readdirSync(path.join(SRC_DIR, "gen"), {
            recursive: true,
            withFileTypes: true,
        })
            .filter((entry) => entry.isFile() && entry.name.endsWith("_pb.ts"))
            .map((entry) => path.join(entry.parentPath, entry.name));

        const missing: string[] = [];
        for (const file of genFiles) {
            const module: Record<string, unknown> = await import(/* @vite-ignore */ file);
            for (const value of Object.values(module)) {
                const service = value as Partial<DescService> | undefined;
                if (service?.kind !== "service" || !service.typeName || !service.methods) continue;
                if (UNWRAPPED_BY_DESIGN.has(service.typeName)) continue;
                const files = clientFiles.get(service.typeName);
                if (!files) {
                    missing.push(service.typeName);
                    continue;
                }
                // Only the files holding this service's client count, so a same-named method
                // on another service's client can't stand in for it.
                const clientSource = files.map((f) => readFileSync(f, "utf8")).join("\n");
                for (const method of service.methods) {
                    const name = `${service.typeName}.${method.name}`;
                    if (UNWRAPPED_BY_DESIGN.has(name)) continue;
                    if (!clientSource.includes(`.${method.localName}(`)) missing.push(name);
                }
            }
        }
        expect(missing, "wrap these in src/services or add them to UNWRAPPED_BY_DESIGN").toEqual(
            [],
        );
    });
});
