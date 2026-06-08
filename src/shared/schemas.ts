import * as v from "valibot";
import { formatId, idToBigInt } from "../utils/base58-id.js";
import {
    parseOptionalUint64DecimalStrict,
    toBigIntOrZero,
    toBpsOrZero,
    toIntOrZero,
} from "../utils/numbers.js";
import { tsNsToMs, tsObjToMs } from "../utils/time.js";
import type { JsonObject } from "@bufbuild/protobuf";

export const TimestampSchema = v.object({
    seconds: v.bigint(),
    nanos: v.optional(v.optional(v.number()), 0),
});

export const TimestampMsSchema = v.pipe(
    TimestampSchema,
    v.transform((value) => tsObjToMs(value)),
);

export const OptionalTimestampMsSchema = v.pipe(
    v.optional(TimestampSchema),
    v.transform((value) => tsObjToMs(value)),
);

export const OptionalNumberDefaultNullSchema = v.optional(v.nullable(v.number()), null);

export const OptionalNumberToBigIntOrZeroSchema = v.pipe(
    OptionalNumberDefaultNullSchema,
    v.transform((value) => toBigIntOrZero(value)),
);

export const OptionalNumberToIntOrZeroSchema = v.pipe(
    OptionalNumberDefaultNullSchema,
    v.transform((value) => toIntOrZero(value)),
);

export const OptionalNumberToBpsOrZeroSchema = v.pipe(
    OptionalNumberDefaultNullSchema,
    v.transform((value) => toBpsOrZero(value)),
);

export const TimestampNsMsSchema = v.pipe(
    v.bigint(),
    v.transform((value) => tsNsToMs(value)),
);

export const PublicIdSchema = v.pipe(
    v.bigint(),
    v.transform((value) => formatId(value)),
);

export const OptionalPublicIdSchema = v.pipe(
    v.optional(v.bigint()),
    v.transform((value) => (value ? formatId(value) : undefined)),
);

/**
 * Creates a schema that trims required string input.
 */
export function trimmedStringSchema() {
    return v.pipe(v.string(), v.trim());
}

/**
 * Creates a schema that trims optional string input.
 */
export function optionalTrimmedStringSchema() {
    return v.optional(trimmedStringSchema());
}

/**
 * Creates a schema for required public id input.
 */
export function idInputSchema(fieldName: string) {
    return v.pipe(
        v.string(),
        v.trim(),
        v.minLength(1),
        v.transform((value) => idToBigInt(value, fieldName)),
    );
}

/**
 * Creates a schema for optional public id input.
 */
export function optionalIdInputSchema(fieldName: string) {
    return v.pipe(
        optionalTrimmedStringSchema(),
        v.transform((value) => (value ? idToBigInt(value, fieldName) : undefined)),
    );
}

/**
 * Creates a schema for optional subaccount id input.
 */
export function optionalSubaccountIdInputSchema() {
    return optionalIdInputSchema("subaccountId");
}

/**
 * Creates a schema for optional uint64 decimal filter input.
 */
export function optionalUint64DecimalFilterSchema(fieldName: string) {
    return v.pipe(
        optionalTrimmedStringSchema(),
        v.transform((value) => parseOptionalUint64DecimalStrict(value, fieldName)),
    );
}

/**
 * Creates a schema for positive bigint-like input.
 */
export function positiveBigintLikeSchema(message: string) {
    return v.pipe(
        v.union([
            v.bigint(),
            v.pipe(
                trimmedStringSchema(),
                v.regex(/^\d+$/),
                v.transform((value) => BigInt(value)),
            ),
        ]),
        v.check((value) => value > 0n, message),
    );
}

export const JsonObjectSchema = v.custom<JsonObject>(
    (input): input is JsonObject =>
        typeof input === "object" && input !== null && !Array.isArray(input),
);
