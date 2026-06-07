import * as v from "valibot";

export const SideSchema = v.picklist(["buy", "sell"]);

export const PositiveStringInputSchema = v.pipe(v.string(), v.trim(), v.minLength(1));

export const PositiveStringOrNumberInputSchema = v.union([
    PositiveStringInputSchema,
    v.pipe(v.number(), v.gtValue(0)),
]);

export const TicksStringInputSchema = v.object({
    kind: v.literal("ticks"),
    ticks: PositiveStringInputSchema,
});

export const TicksStringOrNumberInputSchema = v.object({
    kind: v.literal("ticks"),
    ticks: PositiveStringOrNumberInputSchema,
});

export const BpsStringOrNumberInputSchema = v.object({
    kind: v.literal("bps"),
    bps: PositiveStringOrNumberInputSchema,
});

export const PercentStringOrNumberInputSchema = v.object({
    kind: v.literal("percent"),
    percent: PositiveStringOrNumberInputSchema,
});

export const QuoteStringInputSchema = v.object({
    kind: v.literal("quote"),
    quote: PositiveStringInputSchema,
});

export const NoneInputSchema = v.object({
    kind: v.literal("none"),
});
