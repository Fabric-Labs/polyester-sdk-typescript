import { describe, expect, it } from "vitest";
import { parsePackResult } from "./npm-pack-result.js";

const packed = {
    name: "@example/pk",
    version: "1.0.0",
    filename: "example-pk-1.0.0.tgz",
    files: [{ path: "index.js" }, { path: "package.json" }],
};

describe("parsePackResult", () => {
    it.each([
        ["npm 11 array", [packed]],
        ["npm 12 object", { [packed.name]: packed }],
    ])("reads the package from %s output", (_shape, output) => {
        expect(parsePackResult(JSON.stringify(output))).toEqual(packed);
    });

    it.each([[], {}, [packed, packed], { a: packed, b: packed }, [{ name: "x" }], null, "x"])(
        "rejects %j",
        (output) => {
            expect(() => parsePackResult(JSON.stringify(output))).toThrow(/npm pack returned/);
        },
    );
});
