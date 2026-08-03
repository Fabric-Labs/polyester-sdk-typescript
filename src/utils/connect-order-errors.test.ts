import { create } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import { describe, expect, it } from "vitest";
import { ErrorCode, ErrorDetailSchema } from "../gen/orders/v1/orders_pb.js";
import { ValidationError } from "../shared/errors.js";
import { isStaleQuoteError } from "./connect-order-errors.js";

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
