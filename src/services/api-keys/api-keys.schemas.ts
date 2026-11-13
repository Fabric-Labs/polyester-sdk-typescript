import * as v from "valibot";
import { msToTimestamp } from "../../utils/timestamp.js";
import { tsObjToMs, tsObjToNsString } from "../../utils/time.js";
import {
    OptionalPublicIdSchema,
    PublicIdOrEmptySchema,
    OptionalTimestampMsSchema,
    BigIntStringSchema,
    TimestampMsSchema,
    TimestampSchema,
    positiveBigintStringInputSchema,
    idInputSchema,
    optionalSubaccountIdInputSchema,
} from "../../shared/schemas.js";
import {
    AccountScopeInputEntries,
    accountScopeToSubaccountId,
} from "../../shared/account-scope.js";
import { enumLabelSchema } from "../../shared/proto-enum-codec.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import {
    API_KEY_STATUS_VALUES,
    API_KEY_UPDATE_STATUS_VALUES,
    ASSISTANT_KEY_PRESET_VALUES,
    ApiKeyPurposeCodec,
    AssistantKeyPresetCodec,
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
            return { expiresAt: msToTimestamp(new Date(expiresAtIso).getTime()) };
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
        // Unset decodes to "", matching DEFAULT_API_KEY_POLICY.id.
        policyId: v.optional(PublicIdOrEmptySchema, 0n),
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
        status: enumLabelSchema(ApiKeyStatusCodec.protoToOutput),
        /** `"standard"`, `"assistant"`, or `"unspecified"` from older servers. */
        purpose: v.optional(enumLabelSchema(ApiKeyPurposeCodec.protoToOutput), 0),
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

const BytesSchema = v.instance(Uint8Array<ArrayBufferLike>);

/**
 * One account's key in the assistant key set. Spread a key from `assistant.prepareKeys` and add
 * exactly one of `policyId` and `preset`; other fields (like `publicKeyHex`) are ignored.
 */
const AssistantKeySpecInputSchema = v.pipe(
    v.object({
        /** Subaccount the key acts for; omit for the main account. */
        subaccountId: optionalSubaccountIdInputSchema(),
        /** 32-byte Ed25519 public key from `assistant.prepareKeys`. */
        publicKeyEd25519: v.pipe(BytesSchema, v.length(32, "publicKeyEd25519 must be 32 bytes")),
        /** API policy that bounds the key. It must not allow moving value out of the account. */
        policyId: v.optional(idInputSchema("policyId")),
        /**
         * Permission preset that bounds the key instead of `policyId`. The key is bound to the
         * account's policy named after the preset, created in the same change when missing; the
         * returned key's `policyId` names it. Devnet only.
         */
        preset: v.optional(
            v.pipe(
                v.picklist(ASSISTANT_KEY_PRESET_VALUES),
                v.transform((preset) => AssistantKeyPresetCodec.inputToProto[preset]),
            ),
        ),
        /** Epoch ms from `assistant.prepareKeys`; needed for a new key, not for one already registered. */
        registrationDeadline: v.optional(
            v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(Number.MAX_SAFE_INTEGER)),
        ),
        /** 64-byte proof from `assistant.prepareKeys`; needed for a new key, not for one already registered. */
        registrationProof: v.optional(
            v.pipe(BytesSchema, v.length(64, "registrationProof must be 64 bytes")),
        ),
    }),
    v.check(
        ({ policyId, preset }) => (policyId === undefined) !== (preset === undefined),
        "Set exactly one of policyId and preset.",
    ),
    v.transform(({ registrationDeadline, registrationProof, ...key }) => ({
        ...key,
        registrationDeadline:
            registrationDeadline === undefined ? undefined : msToTimestamp(registrationDeadline),
        registrationProof: registrationProof ?? new Uint8Array(),
    })),
);

export type AssistantKeySpecInput = v.InferInput<typeof AssistantKeySpecInputSchema>;

export const SetAssistantKeysInputSchema = v.strictObject({
    /** The complete set: at most one key per account, at most 64. An account left out loses its key. */
    keys: v.pipe(
        v.array(AssistantKeySpecInputSchema),
        v.maxLength(64, "At most 64 assistant keys are allowed."),
        v.check(
            (keys) => new Set(keys.map((k) => k.subaccountId ?? 0n)).size === keys.length,
            "At most one assistant key per account is allowed.",
        ),
        v.check(
            (keys) => new Set(keys.map((k) => bytesToHex(k.publicKeyEd25519))).size === keys.length,
            "Assistant public keys must be distinct.",
        ),
    ),
});

export type SetAssistantKeysInput = v.InferInput<typeof SetAssistantKeysInputSchema>;
