import * as Proto from "../../gen/chain/guard/v1/guard_signer_pb.js";
import type { InputToProto, ProtoToOutput } from "../../utils/types.js";

export const PROTECTED_ACTION_VALUES = [
    "fundingSetExternalWhitelistRequired",
    "fundingAddExternalWhitelist",
    "fundingRemoveExternalWhitelist",
    "fundingAddInternalWhitelist",
    "fundingRemoveInternalWhitelist",
    "fundingSetInternalWhitelistRequired",
] as const;

export type ProtectedActionLabel = (typeof PROTECTED_ACTION_VALUES)[number];

export const ProtectedActionCodec = {
    inputToProto: {
        fundingSetExternalWhitelistRequired:
            Proto.ProtectedAction.FUNDING_SET_EXTERNAL_WHITELIST_REQUIRED,
        fundingAddExternalWhitelist: Proto.ProtectedAction.FUNDING_ADD_EXTERNAL_WHITELIST,
        fundingRemoveExternalWhitelist: Proto.ProtectedAction.FUNDING_REMOVE_EXTERNAL_WHITELIST,
        fundingAddInternalWhitelist: Proto.ProtectedAction.FUNDING_ADD_INTERNAL_WHITELIST,
        fundingRemoveInternalWhitelist: Proto.ProtectedAction.FUNDING_REMOVE_INTERNAL_WHITELIST,
        fundingSetInternalWhitelistRequired:
            Proto.ProtectedAction.FUNDING_SET_INTERNAL_WHITELIST_REQUIRED,
    } satisfies InputToProto<ProtectedActionLabel, Proto.ProtectedAction>,
    protoToOutput: {
        [Proto.ProtectedAction.UNSPECIFIED]: "unspecified",
        [Proto.ProtectedAction.FUNDING_SET_EXTERNAL_WHITELIST_REQUIRED]:
            "fundingSetExternalWhitelistRequired",
        [Proto.ProtectedAction.FUNDING_ADD_EXTERNAL_WHITELIST]: "fundingAddExternalWhitelist",
        [Proto.ProtectedAction.FUNDING_REMOVE_EXTERNAL_WHITELIST]: "fundingRemoveExternalWhitelist",
        [Proto.ProtectedAction.FUNDING_ADD_INTERNAL_WHITELIST]: "fundingAddInternalWhitelist",
        [Proto.ProtectedAction.FUNDING_REMOVE_INTERNAL_WHITELIST]: "fundingRemoveInternalWhitelist",
        [Proto.ProtectedAction.FUNDING_SET_INTERNAL_WHITELIST_REQUIRED]:
            "fundingSetInternalWhitelistRequired",
    } satisfies ProtoToOutput<Proto.ProtectedAction, ProtectedActionLabel>,
} as const;
