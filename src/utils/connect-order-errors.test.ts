import { create } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import { describe, expect, it } from "vitest";
import { ErrorCode, ErrorDetailSchema } from "../gen/orders/v1/orders_pb.js";
import {
    FailureReason,
    LimiterScope,
    PolicyClass,
    RateLimitDetailSchema,
    RefillModel,
} from "../gen/polyester/ratelimit/v1/types_pb.js";
import { ValidationError } from "../shared/errors.js";
import { getOrderErrorDetail, isStaleQuoteError } from "./connect-order-errors.js";

function orderDetailError(code: ErrorCode): ConnectError {
    return new ConnectError("order rejected", Code.InvalidArgument, undefined, [
        { desc: ErrorDetailSchema, value: create(ErrorDetailSchema, { code }) },
    ]);
}

describe("isStaleQuoteError", () => {
    it("reads a structured stale-quote detail through the mapped SDK error cause", () => {
        const error = new ValidationError("Order rejected.", {
            cause: orderDetailError(ErrorCode.STALE_QUOTE),
        });

        expect(isStaleQuoteError(error)).toBe(true);
    });

    it("does not classify unrelated order details or message text", () => {
        expect(isStaleQuoteError(orderDetailError(ErrorCode.INSUFFICIENT_FUNDS))).toBe(false);
        expect(isStaleQuoteError(new ValidationError("STALE_QUOTE"))).toBe(false);
    });
});

describe("getOrderErrorDetail", () => {
    it("parses the first structured detail from an error cause chain", () => {
        const rateLimit = create(RateLimitDetailSchema, {
            reason: FailureReason.QUOTA_EXCEEDED,
            limit: 100n,
            remaining: 0n,
            retryAfterMs: 1_500n,
            policyVersion: 7n,
            operationId: "orders.create",
            policyClass: PolicyClass.TRADING_PLACE,
            scope: LimiterScope.SUBACCOUNT,
            refillModel: RefillModel.ROLLING_WINDOW,
        });
        const detail = create(ErrorDetailSchema, {
            code: ErrorCode.RATE_LIMIT_EXCEEDED,
            rateLimit,
        });
        const connectError = new ConnectError(
            "quota exhausted",
            Code.ResourceExhausted,
            undefined,
            [{ desc: ErrorDetailSchema, value: detail }],
        );
        const wrappedError = new Error("order rejected", { cause: connectError });

        expect(getOrderErrorDetail(wrappedError)).toEqual({
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

    it("ignores unrelated errors and stops traversing cause cycles", () => {
        const cyclic = new Error("not an order rejection");
        Object.defineProperty(cyclic, "cause", { value: cyclic });

        expect(getOrderErrorDetail(cyclic)).toBeUndefined();
        expect(getOrderErrorDetail(new Error("plain failure"))).toBeUndefined();
    });
});
