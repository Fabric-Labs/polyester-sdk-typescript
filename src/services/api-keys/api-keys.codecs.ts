import * as Proto from "../../gen/auth/v1/api_keys_pb.js";
import type { ExcludeUnspecified } from "../../utils/types.js";

export const API_KEY_STATUS_VALUES = ["active", "revoked", "disabled"] as const;
export type ApiKeyStatusLabel = (typeof API_KEY_STATUS_VALUES)[number];

export const ApiKeyStatusCodec = {
    inputToProto: {
        active: Proto.ApiKeyStatus.ACTIVE,
        revoked: Proto.ApiKeyStatus.REVOKED,
        disabled: Proto.ApiKeyStatus.DISABLED,
    } satisfies Record<ApiKeyStatusLabel, Proto.ApiKeyStatus>,
    protoToOutput: {
        [Proto.ApiKeyStatus.ACTIVE]: "active",
        [Proto.ApiKeyStatus.REVOKED]: "revoked",
        [Proto.ApiKeyStatus.DISABLED]: "disabled",
    } satisfies Record<ExcludeUnspecified<Proto.ApiKeyStatus>, ApiKeyStatusLabel>,
    protoToOutputWithDefault: {
        [Proto.ApiKeyStatus.API_KEY_STATUS_UNSPECIFIED]: undefined,
        [Proto.ApiKeyStatus.ACTIVE]: "active",
        [Proto.ApiKeyStatus.REVOKED]: "revoked",
        [Proto.ApiKeyStatus.DISABLED]: "disabled",
    } satisfies Record<Proto.ApiKeyStatus, ApiKeyStatusLabel | undefined>,
} as const;
