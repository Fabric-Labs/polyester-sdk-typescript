import * as Proto from "../../gen/auth/v1/api_keys_pb.js";
import * as v from "valibot";
import { toTimestamp } from "../../utils/timestamp.js";
import { tsObjToMs, tsObjToNsString } from "../../utils/time.js";
import {
    OptionalPublicIdSchema,
    OptionalTimestampMsSchema,
    BigIntStringSchema,
    TimestampMsSchema,
    TimestampSchema,
    positiveBigintStringInputSchema,
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
import { buildProtoPatch, defineProtoPatchFields } from "../../utils/proto-patch.js";

const ApiKeyStatusSchema = v.picklist(API_KEY_STATUS_VALUES);
const ApiKeyUpdateStatusSchema = v.picklist(API_KEY_UPDATE_STATUS_VALUES);

export type ApiKeyStatus = v.InferOutput<typeof ApiKeyStatusSchema>;

export const ApiKeysListInputSchema = v.pipe(
    v.strictObject({
        ...AccountScopeInputEntries,
    }),
    v.transform(({ account }) => ({
        subaccountId: accountScopeToSubaccountId(account),
    })),
);

export type ApiKeysListInput = v.InferInput<typeof ApiKeysListInputSchema>;

export const ApiKeyIdInputSchema = v.strictObject({
    keyId: v.pipe(v.string(), v.trim(), v.minLength(1, "keyId is required")),
});

export type ApiKeyIdInput = v.InferInput<typeof ApiKeyIdInputSchema>;

export const ApiKeysCreateInputSchema = v.pipe(
    v.strictObject({
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

type ApiKeyPatch = {
    label?: string;
    icon?: string;
    color?: string;
    status?: v.InferOutput<typeof ApiKeyUpdateStatusSchema>;
    ipWhitelist?: string[];
    expiresAtIso?: string | null;
};

const API_KEY_PATCH_FIELDS = defineProtoPatchFields<ApiKeyPatch>()({
    label: { path: "label", encode: (label) => ({ label }) },
    icon: { path: "icon", encode: (icon) => ({ icon }) },
    color: { path: "color", encode: (color) => ({ color }) },
    status: {
        path: "status",
        encode: (status) => ({ status: ApiKeyStatusCodec.inputToProto[status] }),
    },
    ipWhitelist: {
        path: "ip_whitelist",
        encode: (ipWhitelist) => ({ ipWhitelist }),
    },
    expiresAtIso: {
        path: "expires_at",
        encode: (expiresAtIso) => {
            if (expiresAtIso === null) return {};
            const expiresAtMs = new Date(expiresAtIso).getTime();
            return {
                expiresAt: toTimestamp({
                    seconds: BigInt(Math.floor(expiresAtMs / 1000)),
                    nanos: (expiresAtMs % 1000) * 1_000_000,
                }),
            };
        },
    },
});

export const ApiKeysUpdateInputSchema = v.pipe(
    v.strictObject({
        keyId: v.pipe(v.string(), v.trim(), v.minLength(1, "keyId is required")),
        expectedRevision: positiveBigintStringInputSchema("expectedRevision"),
        label: v.optional(v.string()),
        icon: v.optional(v.string()),
        color: v.optional(v.string()),
        status: v.optional(ApiKeyUpdateStatusSchema),
        ipWhitelist: v.optional(v.array(v.string())),
        expiresAtIso: v.optional(
            v.nullable(
                v.pipe(
                    v.string(),
                    v.check(
                        (value) => Number.isFinite(Date.parse(value)),
                        "expiresAtIso must be a valid timestamp",
                    ),
                ),
            ),
        ),
    }),
    v.check(
        ({ label, icon, color, status, ipWhitelist, expiresAtIso }) =>
            label !== undefined ||
            icon !== undefined ||
            color !== undefined ||
            status !== undefined ||
            ipWhitelist !== undefined ||
            expiresAtIso !== undefined,
        "At least one API key field must be provided",
    ),
    v.transform(({ keyId, expectedRevision, ...input }) => {
        const { patch: apiKey, updateMask } = buildProtoPatch(input, API_KEY_PATCH_FIELDS);
        return { keyId, apiKey, updateMask, expectedRevision };
    }),
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
        updatedAt: v.optional(TimestampSchema),
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
        revision: BigIntStringSchema,
    }),
    v.transform(({ subaccountId, updatedAt, ...rest }) => {
        const hex = bytesToHex(rest.publicKeyEd25519);
        return {
            ...rest,
            subaccountId,
            updatedAt: tsObjToMs(updatedAt),
            updatedAtNs: tsObjToNsString(updatedAt),
            publicKeyHex: hex,
        };
    }),
);

export type ApiKey = v.InferOutput<typeof ApiKeySchema>;

export const ApiKeysSchema = v.array(ApiKeySchema);
