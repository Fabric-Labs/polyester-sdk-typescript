import * as v from "valibot";
import { idInputSchema } from "../../shared/schemas.js";

const OrderIdempotencyKeyPattern = /^[A-Za-z0-9._:/-]*$/;

const ClientOrderIdWireInputSchema = v.pipe(
    v.string(),
    v.trim(),
    v.maxLength(36),
    v.regex(OrderIdempotencyKeyPattern, "clientOrderId has an invalid format"),
);

export const ClientOrderIdInputSchema = v.pipe(ClientOrderIdWireInputSchema, v.minLength(1));

export const OptionalClientOrderIdInputSchema = v.optional(ClientOrderIdWireInputSchema);

export function positiveOrderIdInputSchema(fieldName = "orderId") {
    return v.pipe(
        idInputSchema(fieldName),
        v.check((value) => value > 0n, `${fieldName} must be greater than zero`),
    );
}

export const OrderIdInputSchema = positiveOrderIdInputSchema();

export const OrderRequestIdInputSchema = v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1),
    v.maxLength(64),
    v.regex(OrderIdempotencyKeyPattern, "requestId has an invalid format"),
);
