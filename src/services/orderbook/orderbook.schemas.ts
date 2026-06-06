import * as Proto from "../../gen/orderbook/v1/orderbook_pb.js";
import { z } from "zod";
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
		Math.abs(curr - depth) < Math.abs(prev - depth) ? curr : prev
	);
	return DepthCodec.depthToProto[closest];
}

export const GetOrderbookInputSchema = z.object({
	symbol: z.string(),
	depth: z
		.number()
		.default(50)
		.transform((v) => toDepthEnum(v)),
});

export const OrderbookLevelSchema = z
	.object({
		priceTicks: z.bigint(),
		qtyScaled: z.bigint(),
	})
	.transform((l) => ({
		priceTicks: l.priceTicks.toString(),
		qtyScaled: l.qtyScaled.toString(),
		priceDisplay: int6ToDecimalString(l.priceTicks),
		qtyDisplay: int18ToDecimalString(l.qtyScaled),
	}));

export type OrderbookLevel = z.output<typeof OrderbookLevelSchema>;

export const OrderbookDataSchema = z
	.object({
		symbol: z.string(),
		depth: z.number(),
		bookSeq: z.bigint(),
		bids: z.array(OrderbookLevelSchema),
		asks: z.array(OrderbookLevelSchema),
	})
	.transform((d) => {
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
	});

export type OrderbookData = z.output<typeof OrderbookDataSchema>;
