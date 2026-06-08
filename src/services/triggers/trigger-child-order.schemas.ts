import * as Proto from "../../gen/triggers/v1/triggers_pb.js";
import * as ProtoOrders from "../../gen/orders/v1/orders_pb.js";
import * as v from "valibot";
import type { CatalogReader } from "../../catalogs/index.js";
import { parsePriceTicks } from "../../utils/numbers.js";
import { idToBigInt } from "../../utils/base58-id.js";
import {
    FEE_SOURCE_VALUES,
    ORDER_TYPE_VALUES,
    OrderTypeCodec,
    STP_MODE_VALUES,
    TIF_VALUES,
    TifCodec,
    FeeSourceCodec,
    StpModeCodec,
    TRIGGER_SIDE_VALUES,
    TriggerSideCodec,
} from "./triggers.codecs.js";

const OrderTypeSchema = v.picklist(ORDER_TYPE_VALUES);
const TIFSchema = v.picklist(TIF_VALUES);
const FeeSourceSchema = v.picklist(FEE_SOURCE_VALUES);
const STPSchema = v.picklist(STP_MODE_VALUES);
const SideInputSchema = v.picklist(TRIGGER_SIDE_VALUES);

export type TrailingDistanceOneof = Proto.CreateTriggerRequest["trailingDistance"];
export type MaxSlippageOneof = Proto.CreateTriggerRequest["maxSlippage"];

export const BaseChildOrderFieldsSchema = v.object({
    subaccountId: v.pipe(
        v.optional(v.pipe(v.string(), v.trim())),
        v.transform((v) => (v ? idToBigInt(v, "subaccountId") : 0n)),
    ),
    symbol: v.pipe(v.string(), v.trim(), v.minLength(1)),
    clientTriggerId: v.optional(v.pipe(v.string(), v.trim()), () => crypto.randomUUID()),
    side: v.pipe(
        SideInputSchema,
        v.transform((v) => TriggerSideCodec.inputToProto[v]),
    ),
    orderType: v.pipe(
        OrderTypeSchema,
        v.transform((v) => OrderTypeCodec.inputToProto[v]),
    ),
    tif: v.pipe(
        TIFSchema,
        v.transform((v) => TifCodec.inputToProto[v]),
    ),
    qty: v.pipe(v.string(), v.trim(), v.minLength(1)),
    limitPrice: v.optional(v.pipe(v.string(), v.trim())),
    feeSource: v.pipe(
        v.optional(FeeSourceSchema),
        v.transform((v) => (v ? FeeSourceCodec.inputToProto[v] : ProtoOrders.FeeSource.QUOTE)),
    ),
    stpMode: v.pipe(
        v.optional(STPSchema),
        v.transform((v) => (v ? StpModeCodec.inputToProto[v] : ProtoOrders.STPMode.EXPIRE_MAKER)),
    ),
    postOnly: v.optional(v.boolean(), false),
});

export const UNSET_TRAILING_DISTANCE: TrailingDistanceOneof = {
    case: undefined,
    value: undefined,
};
export const UNSET_MAX_SLIPPAGE: MaxSlippageOneof = { case: undefined, value: undefined };

export function buildTriggerDefaults(): Pick<
    Proto.CreateTriggerRequest,
    | "triggerPriceTicks"
    | "activationPriceTicks"
    | "twapDurationMs"
    | "twapSliceIntervalMs"
    | "ladderPriceMinTicks"
    | "ladderPriceMaxTicks"
    | "ladderLevels"
    | "ladderDistribution"
    | "trailingDistance"
    | "maxSlippage"
> {
    return {
        triggerPriceTicks: 0n,
        activationPriceTicks: 0n,
        twapDurationMs: 0n,
        twapSliceIntervalMs: 0n,
        ladderPriceMinTicks: 0n,
        ladderPriceMaxTicks: 0n,
        ladderLevels: 2,
        ladderDistribution: Proto.LadderDistribution.LADDER_DISTRIBUTION_UNSPECIFIED,
        trailingDistance: UNSET_TRAILING_DISTANCE,
        maxSlippage: UNSET_MAX_SLIPPAGE,
    };
}

type BaseChildOrderInput = v.InferOutput<typeof BaseChildOrderFieldsSchema>;

type CreateTriggerBase = ReturnType<typeof buildTriggerDefaults> &
    Pick<
        Proto.CreateTriggerRequest,
        | "subaccountId"
        | "symbol"
        | "side"
        | "orderType"
        | "tif"
        | "qtyScaled"
        | "limitPriceTicks"
        | "feeSource"
        | "stpMode"
        | "postOnly"
        | "clientTriggerId"
    >;

export function buildCreateTriggerBase(
    reader: CatalogReader,
    input: BaseChildOrderInput,
): CreateTriggerBase {
    reader.orders.validateOrderInput({
        pair: input.symbol,
        quantity: input.qty,
        price: input.orderType === ProtoOrders.OrderType.LIMIT ? input.limitPrice : undefined,
    });

    return {
        ...buildTriggerDefaults(),
        subaccountId: input.subaccountId,
        symbol: input.symbol,
        side: input.side,
        orderType: input.orderType,
        tif: input.tif,
        qtyScaled: reader.orders.parseQuantity(input.qty, input.symbol).value,
        limitPriceTicks:
            input.orderType === ProtoOrders.OrderType.LIMIT && input.limitPrice
                ? parsePriceTicks(input.limitPrice, "limitPrice")
                : 0n,
        feeSource: input.feeSource ?? ProtoOrders.FeeSource.QUOTE,
        stpMode: input.stpMode ?? ProtoOrders.STPMode.EXPIRE_MAKER,
        postOnly: input.postOnly ?? false,
        clientTriggerId: input.clientTriggerId ?? crypto.randomUUID(),
    };
}
