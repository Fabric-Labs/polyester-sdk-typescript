import * as v from "valibot";
import { scaledToDecimalOutput, type SdkScales } from "../../shared/decimal-surface.js";
import { OptionalTimestampMsSchema } from "../../shared/schemas.js";
import { PositiveUint32InputSchema, SymbolIdInputSchema } from "../shared.js";

export const GetOrderbookInputSchema = v.object({
    symbolId: SymbolIdInputSchema,
    /** Price levels per side, sent as given. The server rejects a depth above the `maxDepth` it reports. */
    depth: v.optional(PositiveUint32InputSchema, 50),
});

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
            /** Epoch of `bookSeq`: order snapshots by `(bookEpoch, bookSeq)`, since a new epoch may restart `bookSeq`. */
            bookEpoch: v.bigint(),
            /** Largest `depth` the server accepts. */
            maxDepth: v.number(),
            /** False while the book is being built or after it was invalidated: its levels are unknown, not empty. */
            available: v.boolean(),
            bids: v.array(OrderbookLevelInputSchema),
            asks: v.array(OrderbookLevelInputSchema),
            /** Best-effort snapshot time in epoch ms; absent when the server sends none. */
            ts: OptionalTimestampMsSchema,
        }),
        v.transform((d) => ({
            ...d,
            bookSeq: d.bookSeq.toString(),
            bookEpoch: d.bookEpoch.toString(),
            bids: d.bids.map((level) => formatOrderbookLevel(level, scales, symbolId)),
            asks: d.asks.map((level) => formatOrderbookLevel(level, scales, symbolId)),
        })),
    );
}

export type OrderbookData = v.InferOutput<ReturnType<typeof createOrderbookDataSchema>>;
