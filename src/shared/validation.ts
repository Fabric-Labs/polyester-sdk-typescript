import * as v from "valibot";
import { ValidationError } from "./errors.js";

type AnyIssue = v.BaseIssue<unknown>;

/**
 * Builds a message from the most specific issue. Valibot's own message is only
 * `issues[0].message`, which for a failed union is a generic "Expected Object
 * but received Object" with the real causes nested in `issue.issues`. Nested
 * issue paths are relative to the union, so the union's path is prefixed.
 */
function describeIssue(issue: AnyIssue): string {
    let path = v.getDotPath(issue) ?? "";
    while (issue.type === "union" && issue.issues?.length && hasDefaultMessage(issue)) {
        // Nested issues are flattened across branches, so a validation issue
        // (a branch that got past its type checks) stands in for the closest branch.
        issue = issue.issues.find((nested) => nested.kind === "validation") ?? issue.issues[0]!;
        const nestedPath = v.getDotPath(issue);
        if (nestedPath) path = path ? `${path}.${nestedPath}` : nestedPath;
    }
    // Some custom messages already name their field, e.g. "items.orderId must be ...".
    const field = path.replace(/\.\d+(?=\.|$)/g, "");
    if (!path || issue.message.startsWith(path) || issue.message.startsWith(field)) {
        return issue.message;
    }
    return `${path}: ${issue.message}`;
}

/** Unions given a custom message already say what went wrong. */
function hasDefaultMessage(issue: AnyIssue): boolean {
    return (
        issue.message === `Invalid type: Expected ${issue.expected} but received ${issue.received}`
    );
}

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
            throw new ValidationError(describeIssue(error.issues[0]), { cause: error });
        }
        throw error;
    }
}
