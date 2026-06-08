import * as Proto from "../../gen/auth/v1/api_keys_pb.js";
import * as v from "valibot";
import type { Timestamp } from "@bufbuild/protobuf/wkt";
import { toTimestamp } from "../../utils/timestamp.js";
import { formatId } from "../../utils/base58-id.js";
import { tsObjToMs } from "../../utils/time.js";
import {
    OptionalTimestampMsSchema,
    TimestampMsSchema,
    TimestampSchema,
    optionalSubaccountIdInputSchema,
} from "../../shared/schemas.js";
import { requiredEnumLabel } from "../../shared/proto-enum-codec.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { ApiKeyStatusCodec } from "./api-keys.codecs.js";

const ApiKeyStatusSchema = v.picklist(["active", "revoked", "disabled"]);

export type ApiKeyStatus = v.InferOutput<typeof ApiKeyStatusSchema>;

export const ApiKeysListInputSchema = v.object({
    subaccountId: optionalSubaccountIdInputSchema(),
});

export type ApiKeysListInput = v.InferInput<typeof ApiKeysListInputSchema>;

export const ApiKeyIdInputSchema = v.object({
    keyId: v.pipe(v.string(), v.trim(), v.minLength(1, "keyId is required")),
});

export type ApiKeyIdInput = v.InferInput<typeof ApiKeyIdInputSchema>;

export const ApiKeysCreateInputSchema = v.object({
    label: v.string(),
    subaccountId: optionalSubaccountIdInputSchema(),
    ipWhitelist: v.optional(v.array(v.string()), []),
    publicKeyEd25519: v.instance(Uint8Array<ArrayBufferLike>),
});

export type ApiKeysCreateInput = v.InferInput<typeof ApiKeysCreateInputSchema>;

export const ApiKeysUpdateInputSchema = v.pipe(
    v.object({
        keyId: v.pipe(v.string(), v.trim(), v.minLength(1, "keyId is required")),
        label: v.optional(v.string()),
        status: v.pipe(
            v.optional(ApiKeyStatusSchema),
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
        ipWhitelist: v.optional(v.array(v.string()), []),
        subaccountId: v.pipe(
            v.optional(v.bigint()),
            v.transform((v) => (v ? formatId(v) : undefined)),
        ),
        policyId: v.pipe(
            v.optional(v.bigint()),
            v.transform((v) => (v ? formatId(v) : undefined)),
        ),
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
