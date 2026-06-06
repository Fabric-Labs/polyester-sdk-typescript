import { z } from "zod";
import { tsNsToISO, tsNsToMs } from "../../utils/time.js";
import { parseOptionalUint64Decimal } from "../../utils/numbers.js";
import { SideSchema } from "../shared.js";
import {
	feeSourceLabelFor,
	formatQtyForSymbol,
	formatPriceForSymbol,
	sideLabelFor,
	int18ToDecimalString,
} from "../../catalogs/orders-catalog.js";
import {
	baseAssetForSymbolId,
	quoteAssetForSymbolId,
	baseAssetIdForSymbolId,
	symbolForSymbolId,
} from "../../catalogs/market-data-catalog.js";
import { idToBigInt, formatId } from "../../utils/base58-id";
import { TradeSideCodec } from "./trades.codecs.js";

export const UserTradeSchema = z
	.object({
		tradeId: z.bigint().optional(),
		orderId: z.bigint(),
		subaccountId: z.bigint().optional(),
		symbolId: z.number(),
		side: z.number(),
		isMaker: z.boolean(),
		feeSource: z.number(),
		qtyScaled: z.bigint(),
		priceTicks: z.bigint(),
		feeScaled: z.bigint(),
		tsNs: z.bigint(),
		matchId: z.bigint(),
	})
	.transform((t) => {
		const baseAssetId = baseAssetIdForSymbolId(t.symbolId);
		const baseAsset = baseAssetForSymbolId(t.symbolId);
		const quoteAsset = quoteAssetForSymbolId(t.symbolId);
		// 1=QUOTE fee paid in quote asset, 2=RECEIVED fee paid in base asset
		const feeAsset = t.feeSource === 1 ? quoteAsset : baseAsset;
		const fee = Number(int18ToDecimalString(t.feeScaled));

		return {
			tradeId: t.tradeId ? formatId(t.tradeId) : undefined,
			orderId: formatId(t.orderId),
			subaccountId: t.subaccountId ? formatId(t.subaccountId) : undefined,
			symbolId: t.symbolId,
			symbolLabel: symbolForSymbolId(t.symbolId),
			baseAsset,
			quoteAsset,
			feeAsset,
			sideLabel: sideLabelFor(t.side),
			liquidityLabel: t.isMaker ? ("maker" as const) : ("taker" as const),
			feeSource: t.feeSource,
			feeSourceLabel: feeSourceLabelFor(t.feeSource),
			baseAssetId,
			qtyDisplay: formatQtyForSymbol(t.qtyScaled, t.symbolId),
			priceDisplay: formatPriceForSymbol(t.priceTicks, t.symbolId),
			fee,
			tsNs: t.tsNs,
			tsIso: tsNsToISO(t.tsNs),
			tsMs: tsNsToMs(t.tsNs),
			matchId: Number(t.matchId),
		};
	});

export type Trade = z.output<typeof UserTradeSchema>;

export const GetUserTradesInputSchema = z
	.object({
		subAccountId: z
			.string()
			.trim()
			.optional()
			.transform((v) => (v ? idToBigInt(v, "subaccountId") : undefined)),
		symbolId: z
			.string()
			.trim()
			.optional()
			.transform((v) => {
				if (!v) return undefined;
				const sid = Number(v);
				return Number.isFinite(sid) && sid > 0 ? sid : undefined;
			}),
		side: SideSchema.optional().transform((v) =>
			v ? TradeSideCodec.inputToProto[v] : undefined
		),
		startTsNs: z
			.string()
			.trim()
			.optional()
			.transform((v) => {
				if (!v) return undefined;
				const ts = parseOptionalUint64Decimal(v);
				return ts !== undefined ? ts : undefined;
			}),
		endTsNs: z
			.string()
			.trim()
			.optional()
			.transform((v) => {
				if (!v) return undefined;
				const ts = parseOptionalUint64Decimal(v);
				return ts !== undefined ? ts : undefined;
			}),
		limit: z.number().optional(),
		pageToken: z.string().trim().optional(),
	})
	.transform(({ subAccountId, ...rest }) => ({
		...rest,
		subaccountId: subAccountId,
	}));

export type GetUserTradesInput = z.input<typeof GetUserTradesInputSchema>;
