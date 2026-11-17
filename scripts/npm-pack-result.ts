type PackedFile = { path: string };
export type PackResult = {
    filename: string;
    files: PackedFile[];
    name: string;
    version: string;
};

/**
 * Reads the single package from `npm pack --json` output. npm 11 and earlier
 * print an array of results; npm 12 prints an object keyed by package name.
 */
export function parsePackResult(output: string): PackResult {
    const parsed: unknown = JSON.parse(output);
    const results = parsed !== null && typeof parsed === "object" ? Object.values(parsed) : [];
    if (results.length !== 1) {
        throw new Error(`npm pack returned ${results.length} package results, expected one.`);
    }
    const [packed] = results as Partial<PackResult>[];
    if (!Array.isArray(packed?.files)) throw new Error("npm pack returned no package metadata.");
    return packed as PackResult;
}
