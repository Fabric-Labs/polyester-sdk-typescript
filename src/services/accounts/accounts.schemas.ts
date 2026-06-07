import { z } from "zod";
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

export const ResolveAccountInputSchema = z.object({
	hint: z
		.string()
		.optional()
		.default("")
		.transform((value) => normalizeResolveHint(value)),
	includeSubaccounts: z.boolean().optional().default(false),
});

export type ResolveAccountInput = z.input<typeof ResolveAccountInputSchema>;

export const ResolvedAccountSchema = z.object({
	smartAccountAddress: z.string(),
	kind: z.enum(["root", "sub"]),
	rootUsername: z.string().optional(),
	subaccountLabel: z.string().optional(),
	accountId: z.bigint().transform((v) => formatId(v)),
});

export const ResolvedAccountArraySchema = z.array(ResolvedAccountSchema).default([]);

export type ResolvedAccount = z.output<typeof ResolvedAccountSchema>;
