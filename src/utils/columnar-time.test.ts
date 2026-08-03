import { describe, expect, it } from "vitest";
import { columnarTimestampSecAt, expandColumnarTimestampsSec } from "./columnar-time.js";

describe("columnar time helpers", () => {
    it("treats zero points as empty", () => {
        const window = { startTsSec: 100, endTsSec: 200, points: 0 };

        expect(expandColumnarTimestampsSec(window)).toEqual([]);
        expect(columnarTimestampSecAt(window, 0)).toBeNull();
    });

    it("returns the start timestamp for a single exclusive-end point", () => {
        const window = { startTsSec: 100, endTsSec: 200, points: 1 };

        expect(expandColumnarTimestampsSec(window)).toEqual([100]);
        expect(columnarTimestampSecAt(window, 0)).toBe(100);
        expect(columnarTimestampSecAt(window, 1)).toBeNull();
    });

    it("uses endTsSec as an exclusive boundary for multi-point windows", () => {
        const window = { startTsSec: 100, endTsSec: 200, points: 4 };

        expect(expandColumnarTimestampsSec(window)).toEqual([100, 125, 150, 175]);
    });
});
