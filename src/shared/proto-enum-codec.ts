import * as v from "valibot";
import type { UnspecifiedEnumValue } from "../utils/types.js";

/**
 * Maps a proto enum value to its public label. Values the SDK does not know
 * (e.g. added server-side after this build) fall back to "unspecified" so a
 * newer enum member degrades one field instead of failing the whole decode.
 */
export function enumLabel<TOutput>(
    mapping: Readonly<Partial<Record<number, TOutput>>>,
    value: number,
): TOutput | UnspecifiedEnumValue {
    return mapping[value] ?? "unspecified";
}

/** Schema form of {@link enumLabel}: accepts any number and yields the label. */
export function enumLabelSchema<TOutput>(mapping: Readonly<Partial<Record<number, TOutput>>>) {
    return v.pipe(
        v.number(),
        v.transform((value) => enumLabel(mapping, value)),
    );
}
