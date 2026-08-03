type ProtoPatchEncoder<Value> = (value: Value) => Record<string, unknown>;

export type ProtoPatchFieldMap<Input extends Record<string, unknown>> = {
    [Key in keyof Input]-?: {
        path: string;
        encode: ProtoPatchEncoder<Exclude<Input[Key], undefined>>;
    };
};

type EncodedField<Fields> = Fields[keyof Fields] extends {
    encode: (...args: never[]) => infer Encoded;
}
    ? Encoded
    : never;

type UnionToIntersection<Union> = (Union extends unknown ? (value: Union) => void : never) extends (
    value: infer Intersection,
) => void
    ? Intersection
    : never;

type ProtoPatchValue<Fields> = Partial<UnionToIntersection<EncodedField<Fields>>>;

/**
 * Define the public-to-proto mapping for every field in a PATCH input.
 *
 * Keeping the encoder and FieldMask path together prevents their presence checks from drifting.
 */
export function defineProtoPatchFields<Input extends Record<string, unknown>>() {
    return <const Fields extends ProtoPatchFieldMap<Input>>(fields: Fields): Fields => fields;
}

/** Build a proto PATCH value and FieldMask in one allocation-conscious pass. */
export function buildProtoPatch<
    Input extends Record<string, unknown>,
    const Fields extends ProtoPatchFieldMap<Input>,
>(
    input: Input,
    fields: Fields,
): { patch: ProtoPatchValue<Fields>; updateMask: { paths: string[] } } {
    const patch: Record<string, unknown> = {};
    const paths: string[] = [];

    for (const key of Object.keys(fields) as Array<keyof Fields>) {
        const value = input[key as keyof Input];
        if (value === undefined) continue;

        const field = fields[key];
        Object.assign(patch, field.encode(value as never));
        paths.push(field.path);
    }

    return {
        patch: patch as ProtoPatchValue<Fields>,
        updateMask: { paths },
    };
}
