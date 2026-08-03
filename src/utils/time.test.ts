import { describe, expect, expectTypeOf, it } from "vitest";
import { tsObjToMs, tsObjToNsString } from "./time.js";

describe("protobuf timestamp conversions", () => {
    it("returns required outputs for timestamps with required seconds", () => {
        const timestamp = { seconds: 2n, nanos: 345_678_901 };
        const milliseconds = tsObjToMs(timestamp);
        const nanoseconds = tsObjToNsString(timestamp);

        expectTypeOf(milliseconds).toEqualTypeOf<number>();
        expectTypeOf(nanoseconds).toEqualTypeOf<string>();
        expect(milliseconds).toBe(2_345);
        expect(nanoseconds).toBe("2345678901");
    });

    it("preserves optional outputs for partial or absent timestamps", () => {
        const timestamp: { seconds?: bigint; nanos?: number } | undefined = undefined;
        const milliseconds = tsObjToMs(timestamp);
        const nanoseconds = tsObjToNsString(timestamp);

        expectTypeOf(milliseconds).toEqualTypeOf<number | undefined>();
        expectTypeOf(nanoseconds).toEqualTypeOf<string | undefined>();
        expect(milliseconds).toBeUndefined();
        expect(nanoseconds).toBeUndefined();
    });
});
