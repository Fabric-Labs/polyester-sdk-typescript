import * as Proto from "../../gen/auth/v1/api_keys_pb.js";
import * as v from "valibot";
import type { Timestamp } from "@bufbuild/protobuf/wkt";
import { toTimestamp } from "../../utils/timestamp.js";
import { tsObjToMs } from "../../utils/time.js";
import {
    OptionalPublicIdSchema,
    OptionalTimestampMsSchema,
    TimestampMsSchema,
    TimestampSchema,
} from "../../shared/schemas.js";
import {
    AccountScopeInputEntries,
    accountScopeToSubaccountId,
} from "../../shared/account-scope.js";
import { requiredEnumLabel } from "../../shared/proto-enum-codec.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import {
    API_KEY_STATUS_VALUES,
    API_KEY_UPDATE_STATUS_VALUES,
    ApiKeyStatusCodec,
} from "./api-keys.codecs.js";

const ApiKeyStatusSchema = v.picklist(API_KEY_STATUS_VALUES);
const ApiKeyUpdateStatusSchema = v.picklist(API_KEY_UPDATE_STATUS_VALUES);

export type ApiKeyStatus = v.InferOutput<typeof ApiKeyStatusSchema>;

export const ApiKeysListInputSchema = v.pipe(
    v.object({
        ...AccountScopeInputEntries,
    }),
    v.transform(({ account }) => ({
        subaccountId: accountScopeToSubaccountId(account),
    })),
);

export type ApiKeysListInput = v.InferInput<typeof ApiKeysListInputSchema>;

export const ApiKeyIdInputSchema = v.object({
    keyId: v.pipe(v.string(), v.trim(), v.minLength(1, "keyId is required")),
});

export type ApiKeyIdInput = v.InferInput<typeof ApiKeyIdInputSchema>;

export const ApiKeysCreateInputSchema = v.pipe(
    v.object({
        label: v.string(),
        icon: v.optional(v.string(), ""),
        color: v.optional(v.string(), ""),
        ...AccountScopeInputEntries,
        ipWhitelist: v.optional(v.array(v.string()), []),
        publicKeyEd25519: v.instance(Uint8Array<ArrayBufferLike>),
    }),
    v.transform(({ account, ...input }) => ({
        ...input,
        subaccountId: accountScopeToSubaccountId(account),
    })),
);

export type ApiKeysCreateInput = v.InferInput<typeof ApiKeysCreateInputSchema>;

export const ApiKeysUpdateInputSchema = v.pipe(
    v.object({
        keyId: v.pipe(v.string(), v.trim(), v.minLength(1, "keyId is required")),
        label: v.optional(v.string()),
        icon: v.optional(v.string()),
        color: v.optional(v.string()),
        status: v.pipe(
            v.optional(ApiKeyUpdateStatusSchema),
            v.transform((v) => (v ? ApiKeyStatusCodec.inputToProto[v] : undefined)),
        ),
        ipWhitelist: v.optional(v.array(v.string())),
        expiresAtIso: v.pipe(
            v.optional(v.nullable(v.string())),
            v.transform((v) => {
                let expiresAt: Timestamp | undefined;
                if (v !== undefined) {
                    if (v === null) {
                        expiresAt = toTimestamp({ seconds: 0n, nanos: 0 });
                    } else {
                        const d = new Date(v);
                        if (!Number.isNaN(d.getTime())) {
                            const ms = d.getTime();
                            const seconds = BigInt(Math.floor(ms / 1000));
                            const nanos = (ms % 1000) * 1_000_000;
                            expiresAt = toTimestamp({ seconds, nanos });
                        }
                    }
                }
                return expiresAt;
            }),
        ),
    }),
    v.transform(({ expiresAtIso: expiresAt, ipWhitelist, ...rest }) => ({
        ...rest,
        ...(expiresAt !== undefined ? { expiresAt } : {}),
        ...(ipWhitelist !== undefined ? { ipWhitelist: { cidrs: ipWhitelist } } : {}),
    })),
);

export type ApiKeysUpdateInput = v.InferInput<typeof ApiKeysUpdateInputSchema>;

export const ApiKeySchema = v.pipe(
    v.object({
        keyId: v.string(),
        label: v.optional(v.string(), ""),
        icon: v.optional(v.string(), ""),
        color: v.optional(v.string(), ""),
        ipWhitelist: v.optional(v.array(v.string()), []),
        subaccountId: OptionalPublicIdSchema,
        policyId: OptionalPublicIdSchema,
        createdAt: TimestampMsSchema,
        lastUsedAt: OptionalTimestampMsSchema,
        publicKeyEd25519: v.instance(Uint8Array<ArrayBufferLike>),
        expiresAt: v.pipe(
            v.optional(TimestampSchema),
            v.transform((v) => {
                const ms = tsObjToMs(v);
                return ms ? new Date(ms).toISOString() : undefined;
            }),
        ),
        status: v.pipe(
            v.enum(Proto.ApiKeyStatus),
            v.transform((v) =>
                requiredEnumLabel(
                    ApiKeyStatusCodec.protoToOutput,
                    v,
                    "PolyesterClient.ApiKeySchema",
                    "status",
                ),
            ),
        ),
        createdByActor: v.string(),
    }),
    v.transform(({ subaccountId, ...rest }) => {
        const hex = bytesToHex(rest.publicKeyEd25519);
        return {
            ...rest,
            subaccountId,
            publicKeyHex: hex,
        };
    }),
);

export type ApiKey = v.InferOutput<typeof ApiKeySchema>;

export const ApiKeysSchema = v.array(ApiKeySchema);
