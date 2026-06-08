import * as Proto from "../../gen/auth/v1/api_keys_pb.js";
import type { InputToProto, ProtoToOutput } from "../../utils/types.js";

export const API_KEY_STATUS_VALUES = ["active", "revoked", "disabled"] as const;
export type ApiKeyStatusLabel = (typeof API_KEY_STATUS_VALUES)[number];

export const ApiKeyStatusCodec = {
    inputToProto: {
        active: Proto.ApiKeyStatus.ACTIVE,
        revoked: Proto.ApiKeyStatus.REVOKED,
        disabled: Proto.ApiKeyStatus.DISABLED,
    } satisfies InputToProto<ApiKeyStatusLabel, Proto.ApiKeyStatus>,
    protoToOutput: {
        [Proto.ApiKeyStatus.ACTIVE]: "active",
        [Proto.ApiKeyStatus.REVOKED]: "revoked",
        [Proto.ApiKeyStatus.DISABLED]: "disabled",
    } satisfies ProtoToOutput<Proto.ApiKeyStatus, ApiKeyStatusLabel>,
} as const;
