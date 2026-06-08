export function requiredEnumLabel<TOutput>(
    mapping: Readonly<Partial<Record<number, TOutput>>>,
    value: number,
    schemaName: string,
    enumName: string,
): TOutput {
    const output = mapping[value];
    if (output === undefined) throw new Error(`[${schemaName}]: invalid ${enumName} ${value}`);
    return output;
}
