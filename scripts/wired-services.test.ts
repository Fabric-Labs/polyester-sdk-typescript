import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
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

describe("WIRED_SERVICE_DESCRIPTORS", () => {
    it("matches every createClient call site in src/services and src/realtime", async () => {
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

        const wiredTypeNames = new Set<string>();
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
                wiredTypeNames.add(descriptor?.typeName as string);
            }
        }

        const registryTypeNames = new Set(WIRED_SERVICE_DESCRIPTORS.map((d) => d.typeName));
        expect([...wiredTypeNames].sort()).toEqual([...registryTypeNames].sort());
    });

    it("contains no duplicates", () => {
        const names = WIRED_SERVICE_DESCRIPTORS.map((d) => d.typeName);
        expect(new Set(names).size).toBe(names.length);
    });
});
