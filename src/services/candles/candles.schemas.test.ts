import { describe, expect, it } from "vitest";
import * as v from "valibot";

import * as Proto from "../../gen/marketdata/v1/marketdata_pb.js";
import { TIMEFRAMES, TimeframeCodec } from "./candles.codecs.js";
import { createListCandlesInputSchema } from "./candles.schemas.js";

describe("ListCandlesInputSchema", () => {
    it("round-trips every timeframe label, including 3m, 2h, 6h, 8h and 3d", () => {
        const schema = createListCandlesInputSchema();

        expect(v.parse(schema, { symbolId: 1, timeframe: "3d" }).timeframe).toBe(
            Proto.Timeframe.DAY_3,
        );
        for (const timeframe of TIMEFRAMES) {
            const proto = v.parse(schema, { symbolId: 1, timeframe }).timeframe;
            expect(TimeframeCodec.protoToOutput[proto]).toBe(timeframe);
        }
    });

    it("maps explicit timeframe values to proto values", () => {
        const schema = createListCandlesInputSchema();
        const input = v.parse(schema, {
            symbolId: 1,
            timeframe: "1mo",
            startTsSec: 100,
            endTsSec: 200,
        });

        expect(input.timeframe).toBe(Proto.Timeframe.MONTH_1);
        expect(input.startTime).toEqual({ seconds: 100n, nanos: 0 });
        expect(input.endTime).toEqual({ seconds: 200n, nanos: 0 });
    });

    it("rejects timeframe aliases, proto enum input, and timestamp coercion", () => {
        const schema = createListCandlesInputSchema();

        expect(() =>
            v.parse(schema, {
                symbolId: 1,
                timeframe: "1M",
            }),
        ).toThrow();

        expect(() =>
            v.parse(schema, {
                symbolId: 1,
                timeframe: Proto.Timeframe.SEC_1,
            }),
        ).toThrow();

        expect(() =>
            v.parse(schema, {
                symbolId: 1,
                timeframe: "1m",
                startTsSec: "100",
            }),
        ).toThrow();

        expect(() =>
            v.parse(schema, {
                symbolId: 1,
                timeframe: "1m",
                startTsSec: 100n,
            }),
        ).toThrow();

        expect(() =>
            v.parse(schema, {
                symbolId: 1,
                timeframe: "1m",
                startTsSec: -1,
            }),
        ).toThrow();
    });

    it("rejects invalid limits instead of omitting them", () => {
        const schema = createListCandlesInputSchema();

        expect(() => v.parse(schema, { symbolId: 1, timeframe: "1m", limit: "3" })).toThrow();
        expect(() => v.parse(schema, { symbolId: 1, timeframe: "1m", limit: 0 })).toThrow();
        expect(() => v.parse(schema, { symbolId: 1, timeframe: "1m", limit: -1 })).toThrow();
    });
});
