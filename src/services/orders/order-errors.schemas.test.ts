import { describe, expect, it } from "vitest";
import * as v from "valibot";
import * as ProtoRateLimit from "../../gen/polyester/ratelimit/v1/types_pb.js";
import * as ProtoWrite from "../../gen/orders/v1/orders_pb.js";
import { OrderErrorDetailSchema } from "./order-errors.schemas.js";

describe("OrderErrorDetailSchema", () => {
    it("preserves exact structured rate-limit guidance", () => {
        expect(
            v.parse(OrderErrorDetailSchema, {
                code: ProtoWrite.ErrorCode.RATE_LIMIT_EXCEEDED,
                violations: [],
                rateLimit: {
                    reason: ProtoRateLimit.FailureReason.QUOTA_EXCEEDED,
                    limit: 100n,
                    remaining: 0n,
                    retryAfterMs: 1_500n,
                    policyVersion: 7n,
                    operationId: "orders.create",
                    policyClass: ProtoRateLimit.PolicyClass.TRADING_PLACE,
                    scope: ProtoRateLimit.LimiterScope.SUBACCOUNT,
                    refillModel: ProtoRateLimit.RefillModel.ROLLING_WINDOW,
                },
            }),
        ).toEqual({
            code: "RATE_LIMIT_EXCEEDED",
            violations: [],
            rateLimit: {
                reason: "quota_exceeded",
                limit: "100",
                remaining: "0",
                retryAfterMs: "1500",
                policyVersion: "7",
                operationId: "orders.create",
                policyClass: "trading_place",
                scope: "subaccount",
                refillModel: "rolling_window",
            },
        });
    });

    it("rejects unknown rate-limit enum values", () => {
        expect(() =>
            v.parse(OrderErrorDetailSchema, {
                code: ProtoWrite.ErrorCode.RATE_LIMIT_EXCEEDED,
                violations: [],
                rateLimit: {
                    reason: 999,
                    operationId: "orders.create",
                    policyClass: ProtoRateLimit.PolicyClass.TRADING_PLACE,
                    scope: ProtoRateLimit.LimiterScope.SUBACCOUNT,
                    refillModel: ProtoRateLimit.RefillModel.CONTINUOUS,
                },
            }),
        ).toThrow();
    });
});
