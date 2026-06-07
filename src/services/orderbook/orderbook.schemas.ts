import type * as Proto from "../../gen/orderbook/v1/orderbook_pb.js";
import * as v from "valibot";
import {
    formatQtyForSymbol,
    int6ToDecimalString,
    int18ToDecimalString,
} from "../../catalogs/orders-catalog.js";
import { getPair } from "../../catalogs/market-data-catalog.js";
import { DepthCodec, type OrderbookSupportedDepth } from "./orderbook.codecs.js";

function toDepthEnum(depth: number): Proto.Depth {
    if (depth in DepthCodec.depthToProto)
        return DepthCodec.depthToProto[depth as OrderbookSupportedDepth];
    const closest = DepthCodec.supportedDepths.reduce((prev, curr) =>
        Math.abs(curr - depth) < Math.abs(prev - depth) ? curr : prev,
    );
    return DepthCodec.depthToProto[closest];
}

export const GetOrderbookInputSchema = v.object({
    symbol: v.string(),
    depth: v.pipe(
        v.optional(v.number(), 50),
        v.transform((v) => toDepthEnum(v)),
    ),
});

export const OrderbookLevelSchema = v.pipe(
    v.object({
        priceTicks: v.bigint(),
        qtyScaled: v.bigint(),
    }),
    v.transform((l) => ({
        priceTicks: l.priceTicks.toString(),
        qtyScaled: l.qtyScaled.toString(),
        priceDisplay: int6ToDecimalString(l.priceTicks),
        qtyDisplay: int18ToDecimalString(l.qtyScaled),
    })),
);

export type OrderbookLevel = v.InferOutput<typeof OrderbookLevelSchema>;

export const OrderbookDataSchema = v.pipe(
    v.object({
        symbol: v.string(),
        depth: v.number(),
        bookSeq: v.bigint(),
        bids: v.array(OrderbookLevelSchema),
        asks: v.array(OrderbookLevelSchema),
    }),
    v.transform((d) => {
        const pair = getPair(d.symbol);
        const symbolId = pair?.symbolId ?? 0;
        return {
            ...d,
            bookSeq: d.bookSeq.toString(),
            bids: d.bids.map((level) => ({
                ...level,
                qtyDisplay: formatQtyForSymbol(level.qtyScaled, symbolId),
            })),
            asks: d.asks.map((level) => ({
                ...level,
                qtyDisplay: formatQtyForSymbol(level.qtyScaled, symbolId),
            })),
        };
    }),
);

export type OrderbookData = v.InferOutput<typeof OrderbookDataSchema>;
