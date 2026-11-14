import * as Proto from "../../gen/system/v1/system_pb.js";
import type { InputToProto, ProtoToOutput } from "../../utils/types.js";

export const STATUS_EVENT_KIND_VALUES = ["maintenance", "incident"] as const;
/** `maintenance` is planned and announced ahead of its window; `incident` is unplanned. */
export type StatusEventKind = (typeof STATUS_EVENT_KIND_VALUES)[number];

export const STATUS_EVENT_STATE_VALUES = [
    "scheduled",
    "in_progress",
    "completed",
    "canceled",
] as const;
/**
 * Where an event stands at the time of the response: `scheduled` before its window,
 * `in_progress` within it, `completed` after it, and `canceled` whatever its window.
 */
export type StatusEventState = (typeof STATUS_EVENT_STATE_VALUES)[number];

export const STATUS_EVENT_IMPACT_VALUES = ["degraded", "partial_outage", "major_outage"] as const;
/** Severity of an incident. */
export type StatusEventImpact = (typeof STATUS_EVENT_IMPACT_VALUES)[number];

export const STATUS_EVENT_SERVICE_VALUES = [
    "trading",
    "market_data",
    "deposits",
    "withdrawals",
    "transfers",
    "accounts",
    "api",
    "quickswap",
    "app",
] as const;
/** A part of the platform a status event affects. */
export type StatusEventService = (typeof STATUS_EVENT_SERVICE_VALUES)[number];

export const StatusEventKindCodec = {
    inputToProto: {
        maintenance: Proto.StatusEventKind.MAINTENANCE,
        incident: Proto.StatusEventKind.INCIDENT,
    } satisfies InputToProto<StatusEventKind, Proto.StatusEventKind>,
    protoToOutput: {
        [Proto.StatusEventKind.KIND_UNSPECIFIED]: "unspecified",
        [Proto.StatusEventKind.MAINTENANCE]: "maintenance",
        [Proto.StatusEventKind.INCIDENT]: "incident",
    } satisfies ProtoToOutput<Proto.StatusEventKind, StatusEventKind>,
} as const;

export const StatusEventStateCodec = {
    inputToProto: {
        scheduled: Proto.StatusEventState.SCHEDULED,
        in_progress: Proto.StatusEventState.IN_PROGRESS,
        completed: Proto.StatusEventState.COMPLETED,
        canceled: Proto.StatusEventState.CANCELLED,
    } satisfies InputToProto<StatusEventState, Proto.StatusEventState>,
    protoToOutput: {
        [Proto.StatusEventState.STATE_UNSPECIFIED]: "unspecified",
        [Proto.StatusEventState.SCHEDULED]: "scheduled",
        [Proto.StatusEventState.IN_PROGRESS]: "in_progress",
        [Proto.StatusEventState.COMPLETED]: "completed",
        [Proto.StatusEventState.CANCELLED]: "canceled",
    } satisfies ProtoToOutput<Proto.StatusEventState, StatusEventState>,
} as const;

export const StatusEventImpactCodec = {
    protoToOutput: {
        [Proto.StatusEventImpact.IMPACT_UNSPECIFIED]: "unspecified",
        [Proto.StatusEventImpact.DEGRADED]: "degraded",
        [Proto.StatusEventImpact.PARTIAL_OUTAGE]: "partial_outage",
        [Proto.StatusEventImpact.MAJOR_OUTAGE]: "major_outage",
    } satisfies ProtoToOutput<Proto.StatusEventImpact, StatusEventImpact>,
} as const;

export const StatusEventServiceCodec = {
    protoToOutput: {
        [Proto.AffectedService.SERVICE_UNSPECIFIED]: "unspecified",
        [Proto.AffectedService.TRADING]: "trading",
        [Proto.AffectedService.MARKET_DATA]: "market_data",
        [Proto.AffectedService.DEPOSITS]: "deposits",
        [Proto.AffectedService.WITHDRAWALS]: "withdrawals",
        [Proto.AffectedService.TRANSFERS]: "transfers",
        [Proto.AffectedService.ACCOUNTS]: "accounts",
        [Proto.AffectedService.API]: "api",
        [Proto.AffectedService.QUICKSWAP]: "quickswap",
        [Proto.AffectedService.APP]: "app",
    } satisfies ProtoToOutput<Proto.AffectedService, StatusEventService>,
} as const;
