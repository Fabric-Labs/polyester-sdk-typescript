import * as v from "../../shared/validation.js";

const OrderIdempotencyKeyPattern = /^[A-Za-z0-9._:/-]*$/;

const ClientOrderIdWireInputSchema = v.pipe(
    v.string(),
    v.trim(),
    v.maxLength(36),
    v.regex(OrderIdempotencyKeyPattern, "clientOrderId has an invalid format"),
);

export const ClientOrderIdInputSchema = v.pipe(ClientOrderIdWireInputSchema, v.minLength(1));

export const OptionalClientOrderIdInputSchema = v.optional(ClientOrderIdWireInputSchema);

export const OrderRequestIdInputSchema = v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1),
    v.maxLength(64),
    v.regex(OrderIdempotencyKeyPattern, "requestId has an invalid format"),
);
