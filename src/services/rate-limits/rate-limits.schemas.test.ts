import { describe, expect, it } from "vitest";
import * as v from "valibot";
import * as Proto from "../../gen/ratelimit/v1/ratelimit_pb.js";
import {
    GetTradingRateLimitsInputSchema,
    TradingRateLimitRuleSchema,
} from "./rate-limits.schemas.js";

describe("GetTradingRateLimitsInputSchema", () => {
    it("keeps account scope on the parsed input", () => {
        expect(
            v.parse(GetTradingRateLimitsInputSchema, {
                account: { subaccountId: "42" },
            }),
        ).toEqual({ account: { subaccountId: "42" } });
    });
});

describe("TradingRateLimitRuleSchema", () => {
    it("decodes policy class labels and bigint weights", () => {
        expect(
            v.parse(TradingRateLimitRuleSchema, {
                policyClass: Proto.TradingRateLimitClass.CANCEL,
                tier: 10,
                quotaWeight: 5n,
                periodMs: 250n,
                burstWeight: 1n,
            }),
        ).toEqual({
            policyClass: "trading_cancel",
            tier: 10,
            quotaWeight: "5",
            periodMs: "250",
            burstWeight: "1",
        });
    });

    it("preserves unspecified policy class", () => {
        expect(
            v.parse(TradingRateLimitRuleSchema, {
                policyClass: Proto.TradingRateLimitClass.UNSPECIFIED,
                tier: 0,
                quotaWeight: 0n,
                periodMs: 1000n,
                burstWeight: 0n,
            }),
        ).toMatchObject({ policyClass: "unspecified" });
    });
});
