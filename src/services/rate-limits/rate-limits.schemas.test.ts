import { describe, expect, it } from "vitest";
import * as v from "valibot";
import * as Proto from "../../gen/ratelimit/v1/ratelimit_pb.js";
import { formatId } from "../../utils/base58-id.js";
import {
    GetTradingRateLimitsInputSchema,
    TradingRateLimitRuleSchema,
} from "./rate-limits.schemas.js";

describe("GetTradingRateLimitsInputSchema", () => {
    it("maps account scope onto the proto request", () => {
        expect(
            v.parse(GetTradingRateLimitsInputSchema, {
                account: { subaccountId: formatId(42n) },
            }),
        ).toEqual({ subaccountId: 42n });
    });
});

describe("TradingRateLimitRuleSchema", () => {
    it("decodes policy class labels and bigint weights", () => {
        expect(
            v.parse(TradingRateLimitRuleSchema, {
                policyClass: Proto.TradingRateLimitClass.CANCEL,
                vipTier: 10,
                quotaWeight: 5n,
                periodMs: 250n,
                burstWeight: 1n,
            }),
        ).toEqual({
            policyClass: "trading_cancel",
            vipTier: 10,
            quotaWeight: "5",
            periodMs: "250",
            burstWeight: "1",
        });
    });

    it("preserves unspecified policy class", () => {
        expect(
            v.parse(TradingRateLimitRuleSchema, {
                policyClass: Proto.TradingRateLimitClass.UNSPECIFIED,
                vipTier: 0,
                quotaWeight: 0n,
                periodMs: 1000n,
                burstWeight: 0n,
            }),
        ).toMatchObject({ policyClass: "unspecified" });
    });
});
