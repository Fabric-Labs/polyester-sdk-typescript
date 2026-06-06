import { createClient, type Client, type Transport } from "@connectrpc/connect";
import * as Proto from "../../gen/marketdata/v1/marketdata_pb.js";
import { z } from "zod";
import { connectProtoChannel } from "../../realtime/client.js";
import type { BaseSubscribeInput } from "../../shared/types.js";
import {
	type CandleColumnar,
	CandleRowSchema,
	CandleRowIntSchema,
	CandleColumnarSchema,
	CandleColumnarIntSchema,
	CandlePointSchema,
	ListCandlesInputSchema,
	type Candle,
	type CandleInt,
	type Timeframe,
	type CandleColumnarInt,
	type GetCandlesInput,
} from "./candles.schemas.js";
import { TimeframeCodec } from "./candles.codecs.js";
import { isDev } from "../../utils/is-dev";

interface SubscribeCandlesInput extends BaseSubscribeInput<Candle> {
	symbolId: number;
	timeframe: Timeframe;
}

interface SubscribeCandlesIntsInput extends BaseSubscribeInput<CandleInt> {
	symbolId: number;
	timeframe: Timeframe;
}

interface SubscribeCandlesColumnarInput extends BaseSubscribeInput<CandleColumnar> {
	symbolId: number;
	timeframe: Timeframe;
}

export class CandlesService {
	#client: Client<typeof Proto.MarketDataService>;

	constructor(transport: Transport) {
		this.#client = createClient(Proto.MarketDataService, transport);
	}

	async list(input: GetCandlesInput): Promise<Candle[]> {
		const validatedInput = ListCandlesInputSchema.parse(input);
		const res = await this.#client.getCandles(validatedInput);
		const candles = z.array(CandlePointSchema).default([]).parse(res.candles);
		return candles.map((c) =>
			CandleRowSchema.parse({ ...c, symbolId: res.symbolId, timeframe: res.timeframe })
		);
	}

	async listColumnar(input: GetCandlesInput): Promise<CandleColumnar> {
		const validatedInput = ListCandlesInputSchema.parse(input);
		const res = await this.#client.getCandlesColumns(validatedInput);
		return CandleColumnarSchema.parse(res);
	}

	async listColumnarInts(input: GetCandlesInput): Promise<CandleColumnarInt> {
		const validatedInput = ListCandlesInputSchema.parse(input);
		const res = await this.#client.getCandlesColumns(validatedInput);
		return CandleColumnarIntSchema.parse(res);
	}

	subscribe(input: SubscribeCandlesInput): () => void {
		const timeframe = TimeframeCodec.outputToStreamable[input.timeframe];
		if (!timeframe) {
			if (isDev()) {
				console.error(
					`[CandlesService] No WS stream for timeframe yet: ${input.timeframe}`
				);
			}
			return () => {};
		}
		const channel = `public:spot:market:candles:${timeframe}:${input.symbolId}:proto`;
		return connectProtoChannel({
			channel,
			schema: Proto.CandlePointSchema,
			onPublication: (data) => {
				const point = CandlePointSchema.parse(data);
				const candle = CandleRowSchema.parse({
					...point,
					symbolId: input.symbolId,
					timeframe: TimeframeCodec.inputToProto[input.timeframe],
				});
				input.onEvent(candle);
			},
			onConnected: input.onOpen,
			onDisconnected: input.onClose,
		});
	}

	subscribeInts(input: SubscribeCandlesIntsInput): () => void {
		const timeframe = TimeframeCodec.outputToStreamable[input.timeframe];
		if (!timeframe) {
			if (isDev()) {
				console.error(
					`[CandlesService] No WS stream for timeframe yet: ${input.timeframe}`
				);
			}
			return () => {};
		}
		const channel = `public:spot:market:candles:${timeframe}:${input.symbolId}:proto`;
		return connectProtoChannel({
			channel,
			schema: Proto.CandlePointSchema,
			onPublication: (data) => {
				const point = CandlePointSchema.parse(data);
				const candle = CandleRowIntSchema.parse({
					...point,
					symbolId: input.symbolId,
					timeframe: TimeframeCodec.inputToProto[input.timeframe],
				});
				input.onEvent(candle);
			},
			onConnected: input.onOpen,
			onDisconnected: input.onClose,
		});
	}

	subscribeColumnar(_input: SubscribeCandlesColumnarInput): never {
		throw new Error(
			"[CandlesService.subscribeColumnar] Not implemented. Use unary listColumnar() + row-based WS subscribe()."
		);
	}
}
