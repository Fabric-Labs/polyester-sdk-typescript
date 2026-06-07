import * as Proto from "../../gen/auth/v1/api_keys_pb.js";
import { z } from "zod";
import type { Timestamp } from "@bufbuild/protobuf/wkt";
import { toTimestamp } from "../../utils/timestamp.js";
import { formatId, idToBigInt } from "../../utils/base58-id.js";
import { tsObjToMs } from "../../utils/time.js";
import { TimestampSchema } from "../../shared/schemas.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { ApiKeyStatusCodec } from "./api-keys.codecs.js";

const ApiKeyStatusSchema = z.enum(["active", "revoked", "disabled"]);

export type ApiKeyStatus = z.output<typeof ApiKeyStatusSchema>;

export const ApiKeysListInputSchema = z
	.object({
		subAccountId: z
			.string()
			.optional()
			.transform((v) => (v ? idToBigInt(v, "subaccountId") : undefined)),
	})
	.transform(({ subAccountId, ...rest }) => ({ ...rest, subaccountId: subAccountId }));

export type ApiKeysListInput = z.input<typeof ApiKeysListInputSchema>;

export const ApiKeysCreateInputSchema = z
	.object({
		label: z.string(),
		subAccountId: z
			.string()
			.optional()
			.transform((v) => (v ? idToBigInt(v, "subaccountId") : undefined)),
		ipWhitelist: z.array(z.string()).optional().default([]),
		publicKeyEd25519: z.instanceof(Uint8Array<ArrayBufferLike>),
	})
	.transform(({ subAccountId, ...rest }) => ({ ...rest, subaccountId: subAccountId }));

export type ApiKeysCreateInput = z.input<typeof ApiKeysCreateInputSchema>;

export const ApiKeysUpdateInputSchema = z
	.object({
		keyId: z.string(),
		label: z.string().optional(),
		status: ApiKeyStatusSchema.optional().transform((v) =>
			v ? ApiKeyStatusCodec.inputToProto[v] : undefined
		),
		ipWhitelist: z.array(z.string()).optional(),
		expiresAtIso: z
			.string()
			.optional()
			.nullable()
			.transform((v) => {
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
	})
	.transform((data) => {
		const { expiresAtIso: expiresAt, ipWhitelist, ...rest } = data;
		return {
			...rest,
			expiresAt,
			ipWhitelist: {
				cidrs: ipWhitelist,
			},
		};
	});

export type ApiKeysUpdateInput = z.input<typeof ApiKeysUpdateInputSchema>;

export const ApiKeySchema = z
	.object({
		keyId: z.string(),
		label: z.string().default(""),
		ipWhitelist: z.array(z.string()).default([]),
		subaccountId: z
			.bigint()
			.optional()
			.transform((v) => (v ? formatId(v) : undefined)),
		policyId: z
			.bigint()
			.optional()
			.transform((v) => (v ? formatId(v) : undefined)),
		createdAt: TimestampSchema.transform((v) => tsObjToMs(v)),
		lastUsedAt: TimestampSchema.optional().transform((v) => tsObjToMs(v)),
		publicKeyEd25519: z.instanceof(Uint8Array<ArrayBufferLike>),
		expiresAt: TimestampSchema.optional().transform((v) => {
			const ms = tsObjToMs(v);
			return ms ? new Date(ms).toISOString() : undefined;
		}),
		status: z.enum(Proto.ApiKeyStatus).transform((v) => {
			const status = ApiKeyStatusCodec.protoToOutputWithDefault[v];
			if (!status) {
				throw new Error("[PolyesterClient.ApiKeySchema]: status is required");
			}
			return status;
		}),
		createdByActor: z.string(),
	})
	.transform(({ subaccountId, ...rest }) => {
		const hex = bytesToHex(rest.publicKeyEd25519);
		return {
			...rest,
			subAccountId: subaccountId,
			publicKeyHex: hex,
		};
	});

export type ApiKey = z.output<typeof ApiKeySchema>;

export const ApiKeysSchema = z.array(ApiKeySchema);
