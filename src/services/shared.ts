import * as v from "valibot";
import { PROTOBUF_UINT32_MAX } from "../shared/wire-bounds.js";

export const SideSchema = v.picklist(["buy", "sell"]);

/** A positive spot-market identifier that fits its protobuf `uint32` field. */
export const SymbolIdInputSchema = v.pipe(
    v.number(),
    v.integer(),
    v.gtValue(0),
    v.maxValue(PROTOBUF_UINT32_MAX),
);

export const PositiveStringInputSchema = v.pipe(v.string(), v.trim(), v.minLength(1));

export const PositiveStringOrNumberInputSchema = v.union([
    PositiveStringInputSchema,
    v.pipe(v.number(), v.gtValue(0)),
]);

/** Absolute price distance, as a decimal price string (e.g. "0.50"). */
export const PriceDistanceInputSchema = v.strictObject({
    kind: v.literal("distance"),
    distance: PositiveStringInputSchema,
});

/** Absolute price slippage, as a decimal price string (e.g. "0.25"). */
export const PriceSlippageInputSchema = v.strictObject({
    kind: v.literal("slippage"),
    slippage: PositiveStringInputSchema,
});

export const BpsStringOrNumberInputSchema = v.strictObject({
    kind: v.literal("bps"),
    bps: PositiveStringOrNumberInputSchema,
});

export const NoneInputSchema = v.strictObject({
    kind: v.literal("none"),
});
