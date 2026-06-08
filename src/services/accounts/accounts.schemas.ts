import * as v from "valibot";
import * as ProtoResolve from "../../gen/auth/v1/resolve_pb.js";
import { formatId } from "../../utils/base58-id.js";
import { ResolveHintCodec } from "./accounts.codecs.js";

function normalizeResolveHint(value?: string): ProtoResolve.ResolveHint {
    const raw = (value ?? "").trim();
    if (!raw) return ProtoResolve.ResolveHint.RESOLVE_HINT_UNSPECIFIED;
    const key = raw.toUpperCase().replace(/^RESOLVE_HINT_/, "");
    return (
        ResolveHintCodec.keyToProtoLookup[key] ?? ProtoResolve.ResolveHint.RESOLVE_HINT_UNSPECIFIED
    );
}

export const ResolveAccountInputSchema = v.object({
    query: v.pipe(v.string(), v.trim(), v.minLength(1, "query is required")),
    hint: v.pipe(
        v.optional(v.optional(v.string()), ""),
        v.transform((value) => normalizeResolveHint(value)),
    ),
    includeSubaccounts: v.optional(v.optional(v.boolean()), false),
});

export type ResolveAccountInput = v.InferInput<typeof ResolveAccountInputSchema>;

export const ResolvedAccountSchema = v.object({
    smartAccountAddress: v.string(),
    kind: v.picklist(["root", "sub"]),
    rootUsername: v.optional(v.string()),
    subaccountLabel: v.optional(v.string()),
    accountId: v.pipe(
        v.bigint(),
        v.transform((v) => formatId(v)),
    ),
});

export const ResolvedAccountArraySchema = v.optional(v.array(ResolvedAccountSchema), []);

export type ResolvedAccount = v.InferOutput<typeof ResolvedAccountSchema>;
