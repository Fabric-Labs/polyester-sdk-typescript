import type { CatalogReader } from "../../catalogs/index.js";
import { createCatalogSchemaCache } from "../catalog-schema-cache.js";
import { createNewOrderInputSchemaForReader } from "./orders-input.schemas.js";
import { createModifyOrderInputSchemaForReader } from "./orders-modify.schemas.js";
import {
    createOrderDetailsSchemaForReader,
    createOrderSchemaForReader,
} from "./orders-output.schemas.js";

export {
    BaseOrdersFilterInputSchema,
    CancelAllOrdersInputSchema,
    CancelAllOrdersResponseSchema,
    CancelOrderInputSchema,
    CancelOrderResultSchema,
    CreateOrderResultSchema,
    GetOrderDetailsInputSchema,
    NewOrderInputSchema,
    OpenOrdersInputSchema,
    OrderHistoryInputSchema,
    createNewOrderInputSchema,
} from "./orders-input.schemas.js";
export type {
    CancelAllOrdersInput,
    CancelAllOrdersResponse,
    CancelOrderInput,
    CancelOrderResult,
    CreateOrderResult,
    GetOrderDetailsInput,
    NewOrderInput,
    OpenOrdersInput,
    OrderHistoryInput,
} from "./orders-input.schemas.js";

export {
    ModifyOrderInputSchema,
    ModifyOrderResultSchema,
    createModifyOrderInputSchema,
} from "./orders-modify.schemas.js";
export type { ModifyOrderInput, ModifyOrderResult } from "./orders-modify.schemas.js";

export {
    OrderDetailsSchema,
    OrderSchema,
    createOrderDetailsSchema,
    createOrderSchema,
    createOrderTransferSchema,
} from "./orders-output.schemas.js";
export type { Order, OrderDetails, OrderTransfer } from "./orders-output.schemas.js";

export { RiskPolicyInputSchema } from "./orders-risk.schemas.js";
export type {
    RiskPolicyInput,
    StopLossInput,
    TakeProfitInput,
    TrailingStopInput,
} from "./orders-risk.schemas.js";

export function createOrdersSchemas(catalog: CatalogReader) {
    return createCatalogSchemaCache(catalog, (reader) => ({
        newOrderInput: createNewOrderInputSchemaForReader(reader),
        order: createOrderSchemaForReader(reader),
        modifyOrderInput: createModifyOrderInputSchemaForReader(reader),
        orderDetails: createOrderDetailsSchemaForReader(reader),
    }));
}
