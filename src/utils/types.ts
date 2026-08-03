export type UnspecifiedEnumValue = "unspecified";
export type DecodedEnum<T> = T | UnspecifiedEnumValue;

export type ProtoToOutput<ProtoEnum extends number, OutputEnum> = Record<
    ProtoEnum,
    DecodedEnum<OutputEnum>
>;

export type InputToProto<InputValue extends PropertyKey, ProtoEnum extends number> = Record<
    InputValue,
    ProtoEnum
>;
