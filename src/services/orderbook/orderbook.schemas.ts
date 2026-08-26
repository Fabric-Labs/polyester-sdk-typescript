import * as v from "valibot";
import { scaledToDecimalOutput, type SdkScales } from "../../shared/decimal-surface.js";
import { SymbolIdInputSchema } from "../shared.js";
import { normalizeOrderbookDepth } from "./orderbook.codecs.js";

export const GetOrderbookInputSchema = v.pipe(
    v.object({
        symbolId: SymbolIdInputSchema,
        depth: v.optional(v.number(), 50),
    }),
    v.transform((input) => {
        const depth = normalizeOrderbookDepth(input.depth);
        return {
            symbolId: input.symbolId,
            depth: depth.levels,
            protoDepth: depth.protoDepth,
        };
    }),
);

export type GetOrderbookInput = v.InferInput<typeof GetOrderbookInputSchema>;

const OrderbookLevelInputSchema = v.object({
    priceTicks: v.bigint(),
    qtyScaled: v.bigint(),
});

export type OrderbookLevelInput = v.InferOutput<typeof OrderbookLevelInputSchema>;

export function formatOrderbookLevel(
    level: OrderbookLevelInput,
    scales: SdkScales,
    symbolId: number,
) {
    return {
        price: scaledToDecimalOutput(level.priceTicks, scales.price()),
        qty: scaledToDecimalOutput(level.qtyScaled, scales.baseQty(symbolId)),
    };
}

export type OrderbookLevel = ReturnType<typeof formatOrderbookLevel>;

export function createOrderbookDataSchema(scales: SdkScales, symbolId: number) {
    return v.pipe(
        v.object({
            symbolId: v.literal(symbolId),
            depth: v.number(),
            bookSeq: v.bigint(),
            bids: v.array(OrderbookLevelInputSchema),
            asks: v.array(OrderbookLevelInputSchema),
        }),
        v.transform((d) => ({
            ...d,
            bookSeq: d.bookSeq.toString(),
            bids: d.bids.map((level) => formatOrderbookLevel(level, scales, symbolId)),
            asks: d.asks.map((level) => formatOrderbookLevel(level, scales, symbolId)),
        })),
    );
}

export type OrderbookData = v.InferOutput<ReturnType<typeof createOrderbookDataSchema>>;
