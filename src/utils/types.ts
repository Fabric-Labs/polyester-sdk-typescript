export type ExcludeUnspecified<T> = Exclude<T, 0>;

export type ProtoToOutput<ProtoEnum extends number, OutputEnum> = Record<
    ExcludeUnspecified<ProtoEnum>,
    OutputEnum
>;

export type InputToProto<InputValue extends PropertyKey, ProtoEnum extends number> = Record<
    InputValue,
    ProtoEnum
>;
