import type * as Proto from "../../gen/ai/v1/assistant_pb.js";
import type { SdkScales } from "../../shared/decimal-surface.js";
import { enumLabel } from "../../shared/proto-enum-codec.js";
import { parse } from "../../shared/validation.js";
import { formatId } from "../../utils/base58-id.js";
import { tsObjToMs } from "../../utils/time.js";
import {
    createBalanceHistoryResponseSchema,
    createEquityHistoryResponseSchema,
    formatLedgerBalance,
} from "../balances/balances.schemas.js";
import { TimeframeCodec } from "../candles/candles.codecs.js";
import { createCandleRowSchema } from "../candles/candles.schemas.js";
import { DepositAddressSchema } from "../deposit/deposit.schemas.js";
import {
    OrderSideCodec,
    TimeInForceCodec,
    TriggerPriceSourceCodec,
} from "../orders/order-enums.codecs.js";
import { formatOrder } from "../orders/orders-output.schemas.js";
import { PriceAlertSchema } from "../price-alerts/price-alerts.schemas.js";
import { LedgerTransferSchema } from "../transfers/transfers.schemas.js";
import { TriggerStatusCodec, TriggerTypeCodec } from "../triggers/triggers.codecs.js";
import { createTriggerSchema } from "../triggers/triggers-output.schemas.js";
import {
    ApprovalStatusCodec,
    FailureCategoryCodec,
    MemoryKindCodec,
    OrderPriceFieldCodec,
    PriceOffsetDirectionCodec,
    PriceRoundingCodec,
    ReferencePriceSourceCodec,
    TriggerChangeActionCodec,
    TriggerDirectionCodec,
    UnfilledSlicePolicyCodec,
} from "./assistant.codecs.js";

/*
 * Run events are formatted straight from the decoded protobuf messages, like `formatOrder`.
 * Every oneof becomes a `type`-tagged union; a case this build does not know becomes
 * `{ type: "unspecified" }`, which the proto contract says to skip.
 */

const side = (value: number) => enumLabel(OrderSideCodec.protoToOutput, value);
const tif = (value: number) => enumLabel(TimeInForceCodec.protoToOutput, value);
const watchedPrice = (value: number) => enumLabel(TriggerPriceSourceCodec.protoToOutput, value);
const direction = (value: number) => enumLabel(TriggerDirectionCodec.protoToOutput, value);

function formatUsage(u: Proto.Usage | undefined) {
    return {
        inputTokens: Number(u?.inputTokens ?? 0n),
        outputTokens: Number(u?.outputTokens ?? 0n),
        /** Subset of `inputTokens` served from the prompt cache. */
        cachedInputTokens: Number(u?.cachedInputTokens ?? 0n),
    };
}

function formatReferencePrice(p: Proto.ReferencePrice) {
    return {
        price: p.price,
        source: enumLabel(ReferencePriceSourceCodec.protoToOutput, p.source),
        observedAt: tsObjToMs(p.observedAt),
    };
}

function formatRelativePrice(p: Proto.RelativePrice) {
    return {
        field: enumLabel(OrderPriceFieldCodec.protoToOutput, p.field),
        /** The resolved absolute price the order carries. */
        price: p.price,
        direction: enumLabel(PriceOffsetDirectionCodec.protoToOutput, p.direction),
        offsetBps: p.offsetBps,
        reference:
            p.reference.case === "market"
                ? { type: "market" as const, ...formatReferencePrice(p.reference.value) }
                : p.reference.case === "limitPrice"
                  ? { type: "limit_price" as const, price: p.reference.value }
                  : { type: "unspecified" as const },
        rounding: enumLabel(PriceRoundingCodec.protoToOutput, p.rounding),
        tickSize: p.tickSize,
    };
}

function formatTrailingDistance(
    d:
        | Proto.AttachedTrailingStop["trailingDistance"]
        | Proto.TrailingStopPreview["trailingDistance"],
) {
    if (d.case === "distance") return { kind: "distance" as const, distance: d.value };
    if (d.case === "distanceBps") return { kind: "bps" as const, bps: d.value };
    return { kind: "unspecified" as const };
}

function formatAttachedExits(a: Proto.AttachedExits | undefined) {
    if (!a) return undefined;
    const exit = (e: Proto.AttachedExit | undefined) =>
        e && { triggerPrice: e.triggerPrice, limitPrice: e.limitPrice };
    return {
        takeProfit: exit(a.takeProfit),
        stopLoss: exit(a.stopLoss),
        trailingStop: a.trailingStop && {
            trailingDistance: formatTrailingDistance(a.trailingStop.trailingDistance),
            activationPrice: a.trailingStop.activationPrice,
            limitPrice: a.trailingStop.limitPrice,
        },
        oco: a.oco,
    };
}

function formatStopPreview(s: Proto.StopOrderPreview) {
    return {
        triggerPrice: s.triggerPrice,
        triggerPriceSource: watchedPrice(s.triggerPriceSource),
        direction: direction(s.direction),
        limitPrice: s.limitPrice,
        timeInForce: tif(s.timeInForce),
        postOnly: s.postOnly,
        maxSlippageBps: s.maxSlippageBps,
        fundsReserved: s.fundsReserved,
    };
}

function formatOrderKind(k: Proto.OrderPreview["kind"]) {
    switch (k.case) {
        case "market":
            return {
                type: "market" as const,
                maxSlippageBps: k.value.maxSlippageBps,
                attached: formatAttachedExits(k.value.attached),
            };
        case "limit":
            return {
                type: "limit" as const,
                price: k.value.price,
                timeInForce: tif(k.value.timeInForce),
                expireAt: tsObjToMs(k.value.expireAt),
                postOnly: k.value.postOnly,
                attached: formatAttachedExits(k.value.attached),
            };
        case "stopLoss":
            return { type: "stop_loss" as const, ...formatStopPreview(k.value) };
        case "takeProfit":
            return { type: "take_profit" as const, ...formatStopPreview(k.value) };
        case "trailingStop":
            return {
                type: "trailing_stop" as const,
                trailingDistance: formatTrailingDistance(k.value.trailingDistance),
                activationPrice: k.value.activationPrice,
                triggerPriceSource: watchedPrice(k.value.triggerPriceSource),
                limitPrice: k.value.limitPrice,
                maxSlippageBps: k.value.maxSlippageBps,
                fundsReserved: k.value.fundsReserved,
            };
        case "twap":
            return {
                type: "twap" as const,
                durationMs: Number(k.value.durationMs),
                sliceIntervalMs: Number(k.value.sliceIntervalMs),
                sliceCount: k.value.sliceCount,
                sliceQuantity: k.value.sliceQuantity,
                limitPrice: k.value.limitPrice,
                maxSlippageBps: k.value.maxSlippageBps,
                unfilledSlicePolicy: enumLabel(
                    UnfilledSlicePolicyCodec.protoToOutput,
                    k.value.unfilledSlicePolicy,
                ),
                firstSliceImmediate: k.value.firstSliceImmediate,
            };
        case "ladder":
            return {
                type: "ladder" as const,
                lowPrice: k.value.lowPrice,
                highPrice: k.value.highPrice,
                levels: k.value.levels.map((l) => ({ price: l.price, quantity: l.quantity })),
                postOnly: k.value.postOnly,
                timeInForce: tif(k.value.timeInForce),
                allLevelsAtOnce: k.value.allLevelsAtOnce,
            };
        default:
            return { type: "unspecified" as const };
    }
}

function formatOrderPreview(o: Proto.OrderPreview) {
    return {
        symbolId: o.symbolId,
        symbol: o.symbol,
        baseAsset: o.baseAsset,
        quoteAsset: o.quoteAsset,
        side: side(o.side),
        quantity: o.quantity,
        quoteAmount: o.quoteAmount,
        estimatedValue: o.estimatedValue,
        reservedAmount: o.reservedAmount,
        referencePrice: o.referencePrice && formatReferencePrice(o.referencePrice),
        /** The order type and its own values; `type: "unspecified"` means show the summary only. */
        order: formatOrderKind(o.kind),
        relativePrices: o.relativePrices.map(formatRelativePrice),
    };
}

export type AssistantOrderPreview = ReturnType<typeof formatOrderPreview>;

function formatTriggerSettings(s: Proto.TriggerSettings | undefined) {
    if (!s) return undefined;
    const d = s.trailingDistance;
    const m = s.maxSlippage;
    return {
        status: enumLabel(TriggerStatusCodec.protoToOutput, s.status),
        triggerPrice: s.triggerPrice,
        trailingDistance:
            d.case === "trailingDistancePrice"
                ? { kind: "distance" as const, distance: d.value }
                : d.case === "trailingDistanceBps"
                  ? { kind: "bps" as const, bps: d.value }
                  : undefined,
        activationPrice: s.activationPrice,
        maxSlippage:
            m.case === "maxSlippageBps"
                ? { kind: "bps" as const, bps: m.value }
                : m.case === "maxSlippagePrice"
                  ? { kind: "slippage" as const, slippage: m.value }
                  : undefined,
        limitPrice: s.limitPrice,
    };
}

function formatApprovalPreview(p: Proto.ApprovalRequested["preview"]) {
    switch (p.case) {
        case "orderPreview":
            return { type: "order" as const, ...formatOrderPreview(p.value) };
        case "placeOrders":
            return {
                type: "place_orders" as const,
                orders: p.value.orders.map(formatOrderPreview),
                totalValues: p.value.totalValues.map((t) => ({
                    quoteAsset: t.quoteAsset,
                    value: t.value,
                })),
            };
        case "cancelOrders":
            return {
                type: "cancel_orders" as const,
                orders: p.value.orders.map((o) => ({
                    orderId: formatId(o.orderId),
                    symbol: o.symbol,
                    side: side(o.side),
                    price: o.price,
                    quantity: o.quantity,
                    filledQuantity: o.filledQuantity,
                })),
                cancelAll: p.value.cancelAll,
                symbols: p.value.symbols,
                side: side(p.value.side),
                liveTriggersKept: p.value.liveTriggersKept,
                liveTriggersKeptLowerBound: p.value.liveTriggersKeptLowerBound,
            };
        case "orderChange":
            return {
                type: "order_change" as const,
                symbolId: p.value.symbolId,
                symbol: p.value.symbol,
                baseAsset: p.value.baseAsset,
                quoteAsset: p.value.quoteAsset,
                orders: p.value.orders.map((o) => ({
                    orderId: formatId(o.orderId),
                    side: side(o.side),
                    price: o.price,
                    newPrice: o.newPrice,
                    quantity: o.quantity,
                    newQuantity: o.newQuantity,
                    filledQuantity: o.filledQuantity,
                    replaced: o.replaced,
                })),
            };
        case "triggerChange": {
            const t = p.value;
            return {
                type: "trigger_change" as const,
                triggerId: formatId(t.triggerId),
                symbolId: t.symbolId,
                symbol: t.symbol,
                baseAsset: t.baseAsset,
                quoteAsset: t.quoteAsset,
                triggerType: enumLabel(TriggerTypeCodec.protoToOutput, t.type),
                side: side(t.side),
                quantity: t.quantity,
                action: enumLabel(TriggerChangeActionCodec.protoToOutput, t.action),
                before: formatTriggerSettings(t.before),
                after: formatTriggerSettings(t.after),
                referencePrice: t.referencePrice && formatReferencePrice(t.referencePrice),
                direction: direction(t.direction),
                reserveIncrease:
                    t.reserveChange.case === "reserveIncrease" ? t.reserveChange.value : undefined,
                reserveRelease:
                    t.reserveChange.case === "reserveRelease" ? t.reserveChange.value : undefined,
                firesOnResume: t.firesOnResume,
            };
        }
        case "cancelTrigger": {
            const t = p.value;
            return {
                type: "cancel_trigger" as const,
                triggerId: formatId(t.triggerId),
                symbolId: t.symbolId,
                symbol: t.symbol,
                triggerType: enumLabel(TriggerTypeCodec.protoToOutput, t.type),
                side: side(t.side),
                quantity: t.quantity,
                triggerPrice: t.triggerPrice,
                filledQuantity: t.filledQuantity,
                slicesDone: t.slicesDone,
                sliceCount: t.sliceCount,
                levelsFilled: t.levelsFilled,
                levelCount: t.levelCount,
                cancelsOpenOrders: t.cancelsOpenOrders,
            };
        }
        case "swap": {
            const s = p.value;
            return {
                type: "swap" as const,
                sourceAsset: s.sourceAsset,
                destinationAsset: s.destinationAsset,
                amount: s.amount,
                expectedAmountOut: s.expectedAmountOut,
                minAmountOut: s.minAmountOut,
                maxSlippageBps: s.maxSlippageBps,
                legs: s.legs.map((l) => ({
                    symbol: l.symbol,
                    side: side(l.side),
                    averagePrice: l.averagePrice,
                    priceImpactBps: l.priceImpactBps,
                    takerFeeRatePercent: l.takerFeeRatePercent,
                    fee: l.fee,
                    feeAsset: l.feeAsset,
                })),
                quotedAt: tsObjToMs(s.quotedAt),
                /** Approving after this executes nothing. */
                expiresAt: tsObjToMs(s.expiresAt),
            };
        }
        default:
            return { type: "unspecified" as const };
    }
}

export type AssistantApprovalPreview = ReturnType<typeof formatApprovalPreview>;

function formatViewKind(k: Proto.View["kind"], scales: SdkScales) {
    switch (k.case) {
        case "ordersTable":
            return {
                type: "orders_table" as const,
                orders: k.value.orders.map((o) => formatOrder(scales, o)),
                truncated: k.value.truncated,
                accountId: formatId(k.value.accountId),
            };
        case "triggersTable": {
            const schema = createTriggerSchema(scales);
            return {
                type: "triggers_table" as const,
                /** subaccountId, feeAsset, selfTradePreventionMode, updatedTs, armedTs and version are not set. */
                triggers: k.value.triggers.map((t) => parse(schema, t)),
                truncated: k.value.truncated,
                accountId: formatId(k.value.accountId),
            };
        }
        case "balancesTable":
            return {
                type: "balances_table" as const,
                balances: k.value.balances.map(formatLedgerBalance),
                accountId: formatId(k.value.accountId),
            };
        case "priceChart": {
            const schema = createCandleRowSchema(scales);
            return {
                type: "price_chart" as const,
                symbolId: k.value.symbolId,
                timeframe: enumLabel(TimeframeCodec.protoToOutput, k.value.timeframe),
                candles: k.value.candles.map((c) => parse(schema, c)),
            };
        }
        case "markdownTable":
            return {
                type: "markdown_table" as const,
                columns: k.value.columns,
                /** A row may have fewer cells than columns; missing cells are empty. */
                rows: k.value.rows.map((r) => r.cells),
                truncated: k.value.truncated,
            };
        case "priceAlert":
            return { type: "price_alert" as const, alert: parse(PriceAlertSchema, k.value) };
        case "depositAddress":
            return {
                type: "deposit_address" as const,
                depositAddress: k.value.depositAddress
                    ? parse(DepositAddressSchema, k.value.depositAddress)
                    : undefined,
                assetId: k.value.assetId,
                accountId: formatId(k.value.accountId),
            };
        case "balanceHistoryChart":
            return {
                type: "balance_history_chart" as const,
                history: k.value.history
                    ? parse(createBalanceHistoryResponseSchema(), k.value.history)
                    : undefined,
                accountId: formatId(k.value.accountId),
            };
        case "equityHistoryChart":
            return {
                type: "equity_history_chart" as const,
                history: k.value.history
                    ? parse(createEquityHistoryResponseSchema(scales), k.value.history)
                    : undefined,
                accountId: formatId(k.value.accountId),
            };
        case "transfersTable":
            return {
                type: "transfers_table" as const,
                transfers: k.value.transfers.map((t) => parse(LedgerTransferSchema, t)),
                truncated: k.value.truncated,
                accountId: formatId(k.value.accountId),
            };
        default:
            return { type: "unspecified" as const };
    }
}

function formatView(view: Proto.View, scales: SdkScales) {
    try {
        return formatViewKind(view.kind, scales);
    } catch {
        // ponytail: a view this client cannot format (e.g. a market missing from its catalog)
        // is skipped like an unknown view instead of ending the whole run stream.
        return { type: "unspecified" as const };
    }
}

export type AssistantView = ReturnType<typeof formatView>;

function formatEvent(e: Proto.RunEvent["event"], scales: SdkScales) {
    switch (e.case) {
        case "textDelta":
            return { type: "text_delta" as const, text: e.value.text };
        case "discardPartial":
            /** Drop the text of every `text_delta` with `seq >= fromSeq` received before this event. */
            return { type: "discard_partial" as const, fromSeq: Number(e.value.fromSeq) };
        case "toolStarted":
            return {
                type: "tool_started" as const,
                toolCallId: e.value.toolCallId,
                name: e.value.name,
                input: e.value.input ?? {},
            };
        case "toolFinished":
            return {
                type: "tool_finished" as const,
                toolCallId: e.value.toolCallId,
                name: e.value.name,
                ok: e.value.ok,
                errorMessage: e.value.errorMessage,
            };
        case "memoriesRecalled":
            return {
                type: "memories_recalled" as const,
                toolCallId: e.value.toolCallId,
                memories: e.value.memories.map((m) => ({
                    memoryId: formatId(m.memoryId),
                    text: m.text,
                    kind: enumLabel(MemoryKindCodec.protoToOutput, m.kind),
                })),
            };
        case "destinationsSuggested":
            return {
                type: "destinations_suggested" as const,
                toolCallId: e.value.toolCallId,
                destinationIds: e.value.destinationIds,
            };
        case "skillLoaded":
            return { type: "skill_loaded" as const, name: e.value.name };
        case "subagentStarted":
            return {
                type: "subagent_started" as const,
                subagentId: e.value.subagentId,
                name: e.value.name,
            };
        case "subagentFinished":
            return {
                type: "subagent_finished" as const,
                subagentId: e.value.subagentId,
                name: e.value.name,
                ok: e.value.ok,
                summary: e.value.summary,
            };
        case "approvalRequested":
            return {
                type: "approval_requested" as const,
                approvalId: formatId(e.value.approvalId),
                summary: e.value.summary,
                expiresAt: tsObjToMs(e.value.expiresAt),
                parameters: e.value.parameters.map((p) => ({ label: p.label, value: p.value })),
                accountId: formatId(e.value.accountId),
                /** The action as typed values; `type: "unspecified"` means show the summary only. */
                preview: formatApprovalPreview(e.value.preview),
            };
        case "approvalResolved":
            return {
                type: "approval_resolved" as const,
                approvalId: formatId(e.value.approvalId),
                status: enumLabel(ApprovalStatusCodec.protoToOutput, e.value.status),
            };
        case "view":
            return { type: "view" as const, view: formatView(e.value, scales) };
        case "runCompleted":
            return { type: "run_completed" as const, usage: formatUsage(e.value.usage) };
        case "runFailed":
            return {
                type: "run_failed" as const,
                category: enumLabel(FailureCategoryCodec.protoToOutput, e.value.category),
                message: e.value.message,
                usage: formatUsage(e.value.usage),
            };
        default:
            return { type: "unspecified" as const };
    }
}

export function formatRunEvent(event: Proto.RunEvent, scales: SdkScales) {
    return {
        /** Position in the run, from 1. Pass the last one received as `afterSeq` to resume. */
        seq: Number(event.seq),
        createdAt: tsObjToMs(event.createdAt),
        ...formatEvent(event.event, scales),
    };
}

/** One run event. `type: "unspecified"` is an event this SDK build does not know: skip it. */
export type AssistantRunEvent = ReturnType<typeof formatRunEvent>;
