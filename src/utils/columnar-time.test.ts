import { describe, expect, it } from "vitest";
import { columnarTimestampSecAt, expandColumnarTimestampsSec } from "./columnar-time.js";

describe("columnar time helpers", () => {
    it("treats zero points as empty", () => {
        const window = { startTsSec: 100, endTsSec: 200, points: 0 };

        expect(expandColumnarTimestampsSec(window)).toEqual([]);
        expect(columnarTimestampSecAt(window, 0)).toBeNull();
    });

    it("returns the start timestamp for a single point", () => {
        const window = { startTsSec: 100, endTsSec: 100, points: 1 };

        expect(expandColumnarTimestampsSec(window)).toEqual([100]);
        expect(columnarTimestampSecAt(window, 0)).toBe(100);
        expect(columnarTimestampSecAt(window, 1)).toBeNull();
    });

    it("places the last point at endTsSec for multi-point windows", () => {
        const window = { startTsSec: 100, endTsSec: 175, points: 4 };

        expect(expandColumnarTimestampsSec(window)).toEqual([100, 125, 150, 175]);
    });

    it("expands a testnet 1d equity window into 5-minute buckets ending at endTsSec", () => {
        // balancesService.getEquityHistory({ range: "1d" }) on testnet: 13:05 -> 01:30 UTC, 150 points.
        const startTsSec = Date.UTC(2026, 10, 5, 13, 5) / 1000;
        const endTsSec = Date.UTC(2026, 10, 6, 1, 30) / 1000;
        const timestamps = expandColumnarTimestampsSec({ startTsSec, endTsSec, points: 150 });

        expect(timestamps).toHaveLength(150);
        expect(timestamps[0]).toBe(startTsSec);
        expect(timestamps.at(-1)).toBe(endTsSec);
        expect(timestamps.every((ts, i) => i === 0 || ts - timestamps[i - 1]! === 300)).toBe(true);
    });

    it("rejects inverted, non-finite, and out-of-range inputs", () => {
        expect(columnarTimestampSecAt({ startTsSec: 200, endTsSec: 100, points: 2 }, 0)).toBeNull();
        expect(columnarTimestampSecAt({ startTsSec: NaN, endTsSec: 100, points: 2 }, 0)).toBeNull();
        expect(columnarTimestampSecAt({ startTsSec: 100, endTsSec: 200, points: 2 }, 2)).toBeNull();
        expect(
            columnarTimestampSecAt({ startTsSec: 100, endTsSec: 200, points: 2 }, 0.5),
        ).toBeNull();
    });
});
