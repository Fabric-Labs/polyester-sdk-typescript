import * as v from "valibot";
import * as ProtoResolve from "../../gen/auth/v1/resolve_pb.js";
import { requiredEnumLabel } from "../../shared/proto-enum-codec.js";
import { PublicIdSchema } from "../../shared/schemas.js";
import { ResolvedAccountKindCodec, ResolveHintCodec } from "./accounts.codecs.js";

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
        v.optional(v.string(), ""),
        v.transform((value) => normalizeResolveHint(value)),
    ),
    includeSubaccounts: v.optional(v.boolean(), false),
});

export type ResolveAccountInput = v.InferInput<typeof ResolveAccountInputSchema>;

export const ResolvedAccountSchema = v.object({
    smartAccountAddress: v.string(),
    kind: v.pipe(
        v.enum(ProtoResolve.ResolvedAccount_Kind),
        v.transform((kind) =>
            requiredEnumLabel(
                ResolvedAccountKindCodec.protoToOutput,
                kind,
                "ResolvedAccountSchema",
                "kind",
            ),
        ),
    ),
    rootUsername: v.optional(v.string()),
    subaccountLabel: v.optional(v.string()),
    accountId: PublicIdSchema,
});

export const ResolvedAccountArraySchema = v.optional(v.array(ResolvedAccountSchema), []);

export type ResolvedAccount = v.InferOutput<typeof ResolvedAccountSchema>;
