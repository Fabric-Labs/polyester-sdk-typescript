import * as ProtoResolve from "../../gen/auth/v1/resolve_pb.js";
import type { ProtoToOutput } from "../../utils/types.js";

export const RESOLVE_HINT_KEYS = [
    "USERNAME",
    "ID",
    "PUBLIC_ID",
    "SMART_ACCOUNT",
    "SMARTACCOUNT",
] as const;
export type ResolveHintKey = (typeof RESOLVE_HINT_KEYS)[number];

const keyToProto = {
    USERNAME: ProtoResolve.ResolveHint.USERNAME,
    ID: ProtoResolve.ResolveHint.ID,
    PUBLIC_ID: ProtoResolve.ResolveHint.ID,
    SMART_ACCOUNT: ProtoResolve.ResolveHint.SMART_ACCOUNT,
    SMARTACCOUNT: ProtoResolve.ResolveHint.SMART_ACCOUNT,
} satisfies Record<ResolveHintKey, ProtoResolve.ResolveHint>;

export const ResolveHintCodec = {
    keyToProto,
    keyToProtoLookup: keyToProto as Record<string, ProtoResolve.ResolveHint>,
} as const;

export const ResolvedAccountKindCodec = {
    protoToOutput: {
        [ProtoResolve.ResolvedAccount_Kind.KIND_UNSPECIFIED]: "unspecified",
        [ProtoResolve.ResolvedAccount_Kind.ROOT]: "root",
        [ProtoResolve.ResolvedAccount_Kind.SUB]: "sub",
    } satisfies ProtoToOutput<ProtoResolve.ResolvedAccount_Kind, "root" | "sub">,
} as const;
