import type { CatalogReader } from "../../catalogs/index.js";
import { createCatalogSchemaCache } from "../catalog-schema-cache.js";
import { createCreateTriggerInputSchemaForReader } from "./trigger-input.schemas.js";
import {
    createTriggerEventSchemaForReader,
    createTriggerSchemaForReader,
} from "./triggers-output.schemas.js";

export {
    CancelTriggerInputSchema,
    GetTriggerInputSchema,
    ListTriggerEventsInputSchema,
    ListTriggersInputSchema,
    ModifyTriggerInputSchema,
    PauseTriggerInputSchema,
    createCreateTriggerInputSchema,
} from "./trigger-input.schemas.js";
export type {
    CancelTriggerInput,
    CreateTriggerInput,
    GetTriggerInput,
    ListTriggerEventsInput,
    ListTriggersInput,
    ModifyTriggerInput,
    PauseTriggerInput,
    ResumeTriggerInput,
} from "./trigger-input.schemas.js";

export {
    CancelTriggerResultSchema,
    CreateTriggerResultSchema,
    ModifyTriggerResultSchema,
    PauseTriggerResultSchema,
    createTriggerEventSchema,
    createTriggerSchema,
} from "./triggers-output.schemas.js";
export type {
    CancelTriggerResult,
    CreateTriggerResult,
    LadderDetailsOutput,
    ListTriggerEventsResult,
    ModifyTriggerResult,
    PauseTriggerResult,
    ResumeTriggerResult,
    StopDetailsOutput,
    TrailingDetailsOutput,
    Trigger,
    TriggerDetailsOutput,
    TriggerEvent,
    TwapDetailsOutput,
} from "./triggers-output.schemas.js";

export function createTriggersSchemas(catalog: CatalogReader) {
    return createCatalogSchemaCache(catalog, (reader) => ({
        createTriggerInput: createCreateTriggerInputSchemaForReader(reader),
        trigger: createTriggerSchemaForReader(reader),
        triggerEvent: createTriggerEventSchemaForReader(reader),
    }));
}
