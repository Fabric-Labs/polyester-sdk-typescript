/**
 * Strips option-only metadata from the checked-in protobuf descriptors in src/gen.
 *
 * The proto sources (Fabric-Labs/polyester-proto) annotate fields/methods with
 * buf.validate CEL rules and gnostic OpenAPI documentation. protoc-gen-es
 * serializes those options into every gen file's base64 FileDescriptorProto and
 * adds descriptor dependencies on buf/validate, gnostic, google/api and
 * polyester/api/validation. The SDK runtime never reads any of these options —
 * they exist for server-side validation and docs generation — yet they cost
 * ~350 KB of source and real `fileDesc()` parse time at module init (every
 * Cloudflare isolate cold start, every browser first paint).
 *
 * This script:
 *   1. decodes each gen file's descriptor,
 *   2. drops all unknown (extension) option payloads,
 *   3. removes the now-unreferenced option-file dependencies,
 *   4. rewrites the base64 + import statements,
 *   5. deletes the option-only gen files.
 *
 * It is idempotent. RE-RUN AFTER EVERY PROTO SYNC (the sync will restore the
 * stripped files/payloads):
 *
 *   bun scripts/strip-descriptor-options.ts
 *
 * Safety: the script aborts if any kept descriptor actually references a type
 * (field type, extension extendee, method input/output) from a stripped file.
 * Known option fields (e.g. MethodOptions.idempotency_level, which Connect
 * uses for GET requests) are NOT touched — only unknown extension payloads.
 */
import fs from "node:fs";
import path from "node:path";
import { fromBinary, toBinary } from "@bufbuild/protobuf";
import { base64Decode, base64Encode } from "@bufbuild/protobuf/wire";
import {
    FileDescriptorProtoSchema,
    type DescriptorProto,
    type FileDescriptorProto,
} from "@bufbuild/protobuf/wkt";

const GEN_ROOT = path.resolve(import.meta.dir, "../src/gen");

/** Descriptor dependencies that exist purely to carry custom options. */
const STRIP_DEP_PREFIXES = [
    "buf/validate/",
    "gnostic/",
    "polyester/api/validation/",
    "google/api/",
];

/** Gen directories that only contain the stripped option files. */
const DELETE_DIRS = ["buf", "gnostic", "polyester/api/validation", "google/api"];

/** Proto type-name prefixes that must not be referenced by kept descriptors. */
const FORBIDDEN_TYPE_PREFIXES = [
    ".buf.validate.",
    ".gnostic.",
    ".polyester.api.validation.",
    ".google.api.",
];

function listPbFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...listPbFiles(p));
        else if (entry.name.endsWith("_pb.ts")) out.push(p);
    }
    return out;
}

function isStrippedFile(file: string): boolean {
    const rel = path.relative(GEN_ROOT, file).replaceAll(path.sep, "/");
    return DELETE_DIRS.some((d) => rel.startsWith(`${d}/`));
}

type WithOptions = { options?: { $unknown?: unknown[] } };

function clearUnknown(carrier: WithOptions | undefined): number {
    if (!carrier?.options?.$unknown?.length) return 0;
    const count = carrier.options.$unknown.length;
    carrier.options.$unknown = [];
    return count;
}

function stripMessage(message: DescriptorProto): number {
    let stripped = clearUnknown(message);
    for (const field of message.field) stripped += clearUnknown(field);
    for (const ext of message.extension) stripped += clearUnknown(ext);
    for (const oneof of message.oneofDecl) stripped += clearUnknown(oneof);
    for (const range of message.extensionRange) stripped += clearUnknown(range);
    for (const en of message.enumType) {
        stripped += clearUnknown(en);
        for (const value of en.value) stripped += clearUnknown(value);
    }
    for (const nested of message.nestedType) stripped += stripMessage(nested);
    return stripped;
}

function stripFile(file: FileDescriptorProto): number {
    let stripped = clearUnknown(file);
    for (const message of file.messageType) stripped += stripMessage(message);
    for (const ext of file.extension) stripped += clearUnknown(ext);
    for (const en of file.enumType) {
        stripped += clearUnknown(en);
        for (const value of en.value) stripped += clearUnknown(value);
    }
    for (const service of file.service) {
        stripped += clearUnknown(service);
        for (const method of service.method) stripped += clearUnknown(method);
    }
    return stripped;
}

function assertNoForbiddenTypeRefs(file: FileDescriptorProto): void {
    const offenders: string[] = [];
    const checkTypeName = (name: string | undefined, where: string) => {
        if (!name) return;
        if (FORBIDDEN_TYPE_PREFIXES.some((p) => name.startsWith(p))) {
            offenders.push(`${where}: ${name}`);
        }
    };
    const walkMessage = (message: DescriptorProto, scope: string) => {
        for (const field of message.field) {
            checkTypeName(field.typeName, `${scope}.${field.name}`);
            checkTypeName(field.extendee, `${scope}.${field.name} (extendee)`);
        }
        for (const ext of message.extension) {
            checkTypeName(ext.typeName, `${scope}.${ext.name}`);
            checkTypeName(ext.extendee, `${scope}.${ext.name} (extendee)`);
        }
        for (const nested of message.nestedType) walkMessage(nested, `${scope}.${nested.name}`);
    };
    for (const message of file.messageType) walkMessage(message, message.name ?? "?");
    for (const ext of file.extension) {
        checkTypeName(ext.typeName, `${ext.name}`);
        checkTypeName(ext.extendee, `${ext.name} (extendee)`);
    }
    for (const service of file.service) {
        for (const method of service.method) {
            checkTypeName(method.inputType, `${service.name}.${method.name} (input)`);
            checkTypeName(method.outputType, `${service.name}.${method.name} (output)`);
        }
    }
    if (offenders.length) {
        throw new Error(
            `${file.name}: descriptor references types from stripped files; cannot strip:\n  ${offenders.join("\n  ")}`,
        );
    }
}

const FILE_DESC_RE = /fileDesc\(\s*"([A-Za-z0-9+/=]+)"\s*(?:,\s*\[([^\]]*)\]\s*)?\)/;

let totalBytesBefore = 0;
let totalBytesAfter = 0;
let filesChanged = 0;

for (const tsFile of listPbFiles(GEN_ROOT)) {
    if (isStrippedFile(tsFile)) continue;

    let source = fs.readFileSync(tsFile, "utf8");
    const match = source.match(FILE_DESC_RE);
    if (!match) {
        throw new Error(`${tsFile}: no fileDesc() call found`);
    }
    if (source.indexOf("fileDesc(") !== source.lastIndexOf("fileDesc(")) {
        throw new Error(`${tsFile}: multiple fileDesc() calls — script needs updating`);
    }

    const [, b64, depsText] = match;
    const proto = fromBinary(FileDescriptorProtoSchema, base64Decode(b64!));

    if (proto.weakDependency.length) {
        throw new Error(`${proto.name}: weak dependencies present — script needs updating`);
    }
    assertNoForbiddenTypeRefs(proto);

    // Drop option payloads (unknown extension fields on options messages).
    stripFile(proto);

    // Remove option-file dependencies, remapping public_dependency indices.
    const removedDepIndexes = new Set<number>();
    proto.dependency = proto.dependency.filter((dep, i) => {
        const remove = STRIP_DEP_PREFIXES.some((p) => dep.startsWith(p));
        if (remove) removedDepIndexes.add(i);
        return !remove;
    });
    proto.publicDependency = proto.publicDependency.flatMap((idx) => {
        if (removedDepIndexes.has(idx)) return [];
        let shifted = idx;
        for (const removed of removedDepIndexes) if (removed < idx) shifted--;
        return [shifted];
    });

    const newB64 = base64Encode(toBinary(FileDescriptorProtoSchema, proto));
    totalBytesBefore += b64!.length;
    totalBytesAfter += newB64.length;
    if (newB64 === b64) continue;

    // Rewrite the deps array: drop identifiers imported from stripped files.
    const removedIdentifiers = new Set<string>();
    source = source.replace(
        /^import \{ (file_[A-Za-z0-9_]+) \} from "([^"]+)";\n/gm,
        (line, identifier: string, spec: string) => {
            const resolved = path
                .relative(GEN_ROOT, path.resolve(path.dirname(tsFile), spec))
                .replaceAll(path.sep, "/");
            if (DELETE_DIRS.some((d) => resolved.startsWith(`${d}/`))) {
                removedIdentifiers.add(identifier);
                return "";
            }
            return line;
        },
    );
    let newDepsText = depsText;
    if (depsText) {
        const kept = depsText
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.length && !removedIdentifiers.has(s));
        newDepsText = kept.join(", ");
    }
    const replacement =
        newDepsText && newDepsText.length
            ? `fileDesc("${newB64}", [${newDepsText}])`
            : `fileDesc("${newB64}")`;
    source = source.replace(FILE_DESC_RE, () => replacement);

    fs.writeFileSync(tsFile, source);
    filesChanged++;
}

// Delete the option-only gen files.
for (const dir of DELETE_DIRS) {
    const p = path.join(GEN_ROOT, dir);
    if (fs.existsSync(p)) {
        fs.rmSync(p, { recursive: true });
        console.log(`deleted ${path.relative(GEN_ROOT, p)}/`);
    }
}

// Prune now-empty parent directories (e.g. polyester/api).
for (const dir of ["polyester/api", "polyester", "google"]) {
    const p = path.join(GEN_ROOT, dir);
    if (fs.existsSync(p) && fs.readdirSync(p).length === 0) fs.rmSync(p, { recursive: true });
}

console.log(
    `rewrote ${filesChanged} files; descriptor base64 ${(totalBytesBefore / 1024).toFixed(1)} KB -> ${(totalBytesAfter / 1024).toFixed(1)} KB`,
);

// Final safety: no dangling references to stripped files.
const dangling: string[] = [];
for (const tsFile of listPbFiles(GEN_ROOT)) {
    const source = fs.readFileSync(tsFile, "utf8");
    if (/buf\/validate|gnostic\/openapi|polyester\/api\/validation|google\/api\//.test(source)) {
        dangling.push(tsFile);
    }
}
if (dangling.length) {
    console.error("DANGLING references to stripped files:\n  " + dangling.join("\n  "));
    process.exit(1);
}
console.log("no dangling references — done");
