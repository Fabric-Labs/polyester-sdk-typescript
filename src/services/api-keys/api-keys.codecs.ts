import * as Proto from "../../gen/auth/v1/api_keys_pb.js";
import type { InputToProto, ProtoToOutput } from "../../utils/types.js";

export const API_KEY_STATUS_VALUES = ["active", "revoked", "disabled"] as const;
export type ApiKeyStatusLabel = (typeof API_KEY_STATUS_VALUES)[number];
export const API_KEY_UPDATE_STATUS_VALUES = ["active", "disabled"] as const;
export type ApiKeyUpdateStatusLabel = (typeof API_KEY_UPDATE_STATUS_VALUES)[number];

export const ApiKeyStatusCodec = {
    inputToProto: {
        active: Proto.ApiKeyStatus.ACTIVE,
        disabled: Proto.ApiKeyStatus.DISABLED,
    } satisfies InputToProto<ApiKeyUpdateStatusLabel, Proto.ApiKeyStatus>,
    protoToOutput: {
        [Proto.ApiKeyStatus.API_KEY_STATUS_UNSPECIFIED]: "unspecified",
        [Proto.ApiKeyStatus.ACTIVE]: "active",
        [Proto.ApiKeyStatus.REVOKED]: "revoked",
        [Proto.ApiKeyStatus.DISABLED]: "disabled",
    } satisfies ProtoToOutput<Proto.ApiKeyStatus, ApiKeyStatusLabel>,
} as const;
