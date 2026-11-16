import * as Proto from "../../gen/transfer/v1/dust_conversion_pb.js";
import type { ErrorCode } from "../../gen/transfer/v1/internal_transfer_pb.js";
import type { ProtoToOutput } from "../../utils/types.js";

export const DUST_ASSET_ELIGIBILITY_VALUES = [
    "eligible",
    "target_asset",
    "tradable",
    "above_value_limit",
    "no_price",
    "unsupported_asset",
    "source_limit",
] as const;
/**
 * Whether a Trading balance converts as dust: `eligible` converts; `target_asset` is the
 * conversion's target; `tradable` has an open market that takes an order for it (sell or spend
 * it instead); `above_value_limit` is worth more than 10 USD; `no_price` has no current index
 * price; `unsupported_asset` never converts; `source_limit` waits for the next conversion, which
 * takes at most 20 balances, highest-valued first.
 */
export type DustAssetEligibility = (typeof DUST_ASSET_ELIGIBILITY_VALUES)[number];

export const DUST_CONVERSION_STATE_VALUES = ["processing", "completed", "refused"] as const;
/**
 * `processing` completes or is refused with no further request (read it again with `get`);
 * `completed` moved every source and credited the payout atomically; `refused` moved nothing.
 */
export type DustConversionState = (typeof DUST_CONVERSION_STATE_VALUES)[number];

/** Transfer error code a refused conversion carries, e.g. `DUST_BALANCE_CHANGED`. */
export type DustConversionRefusalCode = keyof typeof ErrorCode;

export const DustAssetEligibilityCodec = {
    protoToOutput: {
        [Proto.DustAssetEligibility.UNSPECIFIED]: "unspecified",
        [Proto.DustAssetEligibility.ELIGIBLE]: "eligible",
        [Proto.DustAssetEligibility.TARGET_ASSET]: "target_asset",
        [Proto.DustAssetEligibility.TRADABLE]: "tradable",
        [Proto.DustAssetEligibility.ABOVE_VALUE_LIMIT]: "above_value_limit",
        [Proto.DustAssetEligibility.NO_PRICE]: "no_price",
        [Proto.DustAssetEligibility.UNSUPPORTED_ASSET]: "unsupported_asset",
        [Proto.DustAssetEligibility.SOURCE_LIMIT]: "source_limit",
    } satisfies ProtoToOutput<Proto.DustAssetEligibility, DustAssetEligibility>,
} as const;

export const DustConversionStateCodec = {
    protoToOutput: {
        [Proto.DustConversionState.UNSPECIFIED]: "unspecified",
        [Proto.DustConversionState.PROCESSING]: "processing",
        [Proto.DustConversionState.COMPLETED]: "completed",
        [Proto.DustConversionState.REFUSED]: "refused",
    } satisfies ProtoToOutput<Proto.DustConversionState, DustConversionState>,
} as const;
