import fs from "node:fs";
import path from "node:path";

type ExportConditions = Record<string, string>;
type PackageManifest = {
    exports: Record<string, ExportConditions>;
};

const root = path.resolve(import.meta.dir, "..");
const manifest = JSON.parse(
    fs.readFileSync(path.join(root, "package.json"), "utf8"),
) as PackageManifest;

const missing = new Set<string>();
let checked = 0;

function hasMatchingFile(target: string): boolean {
    const wildcardIndex = target.indexOf("*");
    if (wildcardIndex === -1) return fs.existsSync(path.resolve(root, target));

    const prefix = target.slice(0, wildcardIndex);
    const suffix = target.slice(wildcardIndex + 1);

    const searchRoot = path.resolve(root, prefix);
    if (!fs.existsSync(searchRoot)) return false;

    return fs
        .readdirSync(searchRoot, { recursive: true, withFileTypes: true })
        .some((entry) => entry.isFile() && entry.name.endsWith(suffix));
}

for (const [subpath, conditions] of Object.entries(manifest.exports)) {
    for (const [condition, target] of Object.entries(conditions)) {
        checked++;
        if (!hasMatchingFile(target)) missing.add(`${subpath} ${condition}: ${target}`);
    }
}

if (missing.size > 0) {
    throw new Error(`Missing package export targets:\n${[...missing].join("\n")}`);
}

console.log(`Verified ${checked} package export targets.`);
