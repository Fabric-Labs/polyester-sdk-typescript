import * as v from "valibot";
import { ValidationError } from "./errors.js";

export * from "valibot";

/**
 * Parses a value with Valibot and translates schema failures into the SDK's
 * public error hierarchy.
 */
export function parse<const TSchema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>>(
    schema: TSchema,
    input: unknown,
    config?: v.Config<v.InferIssue<TSchema>>,
): v.InferOutput<TSchema> {
    try {
        return v.parse(schema, input, config);
    } catch (error) {
        if (v.isValiError(error)) {
            throw new ValidationError(error.message, { cause: error });
        }
        throw error;
    }
}
