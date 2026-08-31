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
import { PROTOBUF_UINT32_MAX } from "./wire-bounds.js";

const UINT64_MAX = (1n << 64n) - 1n;
const MS_TO_US = 1_000n;
const MS_TO_NS = 1_000_000n;
const MAX_UINT64_TIMESTAMP_MS_US = Number(UINT64_MAX / MS_TO_US);
const MAX_UINT64_TIMESTAMP_MS = Number(UINT64_MAX / MS_TO_NS);

export const TimestampSchema = v.object({
    seconds: v.bigint(),
    nanos: v.optional(v.number(), 0),
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
    v.optional(v.nullable(v.pipe(v.number(), v.maxValue(PROTOBUF_UINT32_MAX))), null),
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

export const BigIntStringSchema = v.pipe(
    v.bigint(),
    v.transform((value) => value.toString()),
);

export const OptionalBigIntStringSchema = v.pipe(
    v.optional(v.bigint()),
    v.transform((value) => (value === undefined ? undefined : value.toString())),
);

export const OptionalTimestampMsToNsInputSchema = v.optional(
    v.pipe(
        v.number(),
        v.integer(),
        v.minValue(0),
        v.maxValue(MAX_UINT64_TIMESTAMP_MS),
        v.transform((value) => BigInt(value) * MS_TO_NS),
    ),
);

export const OptionalTimestampMsToUsInputSchema = v.optional(
    v.pipe(
        v.number(),
        v.integer(),
        v.minValue(0),
        v.maxValue(MAX_UINT64_TIMESTAMP_MS_US),
        v.transform((value) => BigInt(value) * MS_TO_US),
    ),
);

export const OptionalTimestampSecondsInputSchema = v.optional(
    v.pipe(
        v.number(),
        v.integer(),
        v.minValue(0),
        v.maxValue(Number.MAX_SAFE_INTEGER),
        v.transform((value) => BigInt(value)),
    ),
);

export const PublicIdSchema = v.pipe(
    v.bigint(),
    v.transform((value) => formatId(value)),
);

export const OptionalPublicIdSchema = v.pipe(
    v.optional(v.bigint()),
    v.transform((value) => (value ? formatId(value) : undefined)),
);

const TrimmedStringSchema = v.pipe(v.string(), v.trim());

const OptionalTrimmedStringSchema = v.optional(TrimmedStringSchema);

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
        OptionalTrimmedStringSchema,
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
        OptionalTrimmedStringSchema,
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
                TrimmedStringSchema,
                v.regex(/^\d+$/),
                v.transform((value) => BigInt(value)),
            ),
        ]),
        v.check((value) => value > 0n, message),
    );
}

export function bigintStringInputSchema(fieldName: string) {
    return v.pipe(
        TrimmedStringSchema,
        v.regex(/^\d+$/, `${fieldName} must be a decimal integer`),
        v.transform((value) => BigInt(value)),
    );
}

export function positiveBigintStringInputSchema(fieldName: string) {
    return v.pipe(
        bigintStringInputSchema(fieldName),
        v.check((value) => value > 0n, `${fieldName} must be greater than 0`),
    );
}

export const JsonObjectSchema = v.custom<JsonObject>(
    (input): input is JsonObject =>
        typeof input === "object" && input !== null && !Array.isArray(input),
);
