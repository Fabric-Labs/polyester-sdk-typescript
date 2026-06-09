import * as v from "valibot";
import { normalizeOrderbookDepth } from "./orderbook.codecs.js";

export const GetOrderbookInputSchema = v.pipe(
    v.object({
        symbol: v.string(),
        depth: v.optional(v.number(), 50),
    }),
    v.transform((input) => {
        const depth = normalizeOrderbookDepth(input.depth);
        return {
            symbol: input.symbol,
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

export function formatOrderbookLevel(level: OrderbookLevelInput) {
    return {
        priceTicks: level.priceTicks.toString(),
        qtyScaled: level.qtyScaled.toString(),
    };
}

export type OrderbookLevel = ReturnType<typeof formatOrderbookLevel>;

export const OrderbookDataSchema = v.pipe(
    v.object({
        symbol: v.string(),
        depth: v.number(),
        bookSeq: v.bigint(),
        bids: v.array(OrderbookLevelInputSchema),
        asks: v.array(OrderbookLevelInputSchema),
    }),
    v.transform((d) => ({
        ...d,
        bookSeq: d.bookSeq.toString(),
        bids: d.bids.map((level) => formatOrderbookLevel(level)),
        asks: d.asks.map((level) => formatOrderbookLevel(level)),
    })),
);

export type OrderbookData = v.InferOutput<ReturnType<typeof createOrderbookDataSchema>>;

export function createOrderbookDataSchema() {
    return OrderbookDataSchema;
}
