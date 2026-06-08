import { describe, expect, it } from "vitest";
import * as v from "valibot";

import * as Proto from "../../gen/marketdata/v1/marketdata_pb.js";
import { ListCandlesInputSchema } from "./candles.schemas.js";

describe("ListCandlesInputSchema", () => {
    it("maps explicit timeframe values to proto values", () => {
        const input = v.parse(ListCandlesInputSchema, {
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
        expect(() =>
            v.parse(ListCandlesInputSchema, {
                symbolId: 1,
                timeframe: "1M",
            }),
        ).toThrow();

        expect(() =>
            v.parse(ListCandlesInputSchema, {
                symbolId: 1,
                timeframe: Proto.Timeframe.SEC_1,
            }),
        ).toThrow();

        expect(() =>
            v.parse(ListCandlesInputSchema, {
                symbolId: 1,
                timeframe: "1m",
                startTsSec: "100",
            }),
        ).toThrow();

        expect(() =>
            v.parse(ListCandlesInputSchema, {
                symbolId: 1,
                timeframe: "1m",
                startTsSec: 100n,
            }),
        ).toThrow();

        expect(() =>
            v.parse(ListCandlesInputSchema, {
                symbolId: 1,
                timeframe: "1m",
                startTsSec: -1,
            }),
        ).toThrow();
    });
});
