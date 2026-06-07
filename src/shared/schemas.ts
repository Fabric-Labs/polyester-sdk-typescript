import * as v from "valibot";
import { formatId, idToBigInt } from "../utils/base58-id.js";
import { tsNsToMs, tsObjToMs } from "../utils/time.js";

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

export function trimmedStringSchema() {
    return v.pipe(v.string(), v.trim());
}

export function optionalTrimmedStringSchema() {
    return v.optional(trimmedStringSchema());
}

export function idInputSchema(fieldName: string) {
    return v.pipe(
        v.string(),
        v.trim(),
        v.minLength(1),
        v.transform((value) => idToBigInt(value, fieldName)),
    );
}

export function optionalIdInputSchema(fieldName: string) {
    return v.pipe(
        optionalTrimmedStringSchema(),
        v.transform((value) => (value ? idToBigInt(value, fieldName) : undefined)),
    );
}

export function optionalSubAccountIdInputSchema() {
    return optionalIdInputSchema("subaccountId");
}

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
