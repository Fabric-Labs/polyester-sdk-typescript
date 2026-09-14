import * as v from "valibot";
import { PROTOBUF_UINT32_MAX } from "../../shared/wire-bounds.js";
import { PublicIdSchema } from "../../shared/schemas.js";

/** Logical order identity and its one-based replacement generation. */
export const OrderLineageSchema = v.object({
    id: PublicIdSchema,
    generation: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(PROTOBUF_UINT32_MAX)),
});

export type OrderLineage = v.InferOutput<typeof OrderLineageSchema>;
