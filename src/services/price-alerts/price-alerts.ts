import { createClient, type Client } from "@connectrpc/connect";
import * as Proto from "../../gen/alerts/v1/price_alerts_pb.js";
import {
    toConnectCallOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import type { AuthApiTransports } from "../../shared/transports.js";
import { parse } from "../../shared/validation.js";
import { removeUndefined } from "../../utils/remove-undefined.js";
import {
    CancelPriceAlertInputSchema,
    CreatePriceAlertInputSchema,
    ListPriceAlertsInputSchema,
    ListPriceAlertsResultSchema,
    PriceAlertSchema,
    UpdatePriceAlertInputSchema,
    UpdatePriceAlertResultSchema,
    type CancelPriceAlertInput,
    type CreatePriceAlertInput,
    type ListPriceAlertsInput,
    type ListPriceAlertsResult,
    type PriceAlert,
    type UpdatePriceAlertInput,
    type UpdatePriceAlertResult,
} from "./price-alerts.schemas.js";

/**
 * Manages the caller's price alerts. Alerts belong to the root account, not a trading account:
 * a session and the root account's API keys see the same alerts, and an API key scoped to a
 * subaccount is refused (`PermissionError`, detail `SUBACCOUNT_KEY_REFUSED`). An alert fires at
 * most once, only on a crossing it observes from its `referencePrice`; `update` sets a fired
 * alert again. No call changes balances, orders or account settings.
 */
export class PriceAlertsService {
    #client: Client<typeof Proto.PriceAlertService>;

    constructor(transports: AuthApiTransports) {
        this.#client = createClient(Proto.PriceAlertService, transports.authApi);
    }

    /**
     * Creates an active alert. Throws `PreconditionFailedError` when the market has no index
     * price (`PRICE_SOURCE_UNSUPPORTED`) or the active-alert limit is reached, and a retryable
     * `ServiceUnavailableError` when the market has no current price yet.
     */
    async create(
        input: CreatePriceAlertInput,
        options?: PolyesterRequestOptions,
    ): Promise<PriceAlert> {
        const request = parse(CreatePriceAlertInputSchema, input);
        const response = await this.#client.createAlert(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return parse(PriceAlertSchema, response.alert);
    }

    /** Lists the caller's alerts, newest first. */
    async list(
        input: ListPriceAlertsInput = {},
        options?: PolyesterRequestOptions,
    ): Promise<ListPriceAlertsResult> {
        const request = parse(ListPriceAlertsInputSchema, input);
        const response = await this.#client.listAlerts(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return parse(ListPriceAlertsResultSchema, response);
    }

    /**
     * Changes an alert's direction, price or channels; omitted fields stay as they are. A new
     * direction or price records a new reference price. Updating a triggered alert sets it
     * again, even with no field given. A stale `expectedRevision` throws
     * `RevisionConflictError`; a cancelled alert throws `PreconditionFailedError`.
     */
    async update(
        input: UpdatePriceAlertInput,
        options?: PolyesterRequestOptions,
    ): Promise<UpdatePriceAlertResult> {
        const request = parse(UpdatePriceAlertInputSchema, input);
        const response = await this.#client.updateAlert(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return parse(UpdatePriceAlertResultSchema, response);
    }

    /**
     * Cancels an active alert; cancelling a cancelled alert returns it unchanged. A triggered
     * alert throws `PreconditionFailedError` (`ALERT_TRIGGERED`).
     */
    async cancel(
        input: CancelPriceAlertInput,
        options?: PolyesterRequestOptions,
    ): Promise<PriceAlert> {
        const request = parse(CancelPriceAlertInputSchema, input);
        const response = await this.#client.cancelAlert(request, toConnectCallOptions(options));
        return parse(PriceAlertSchema, response.alert);
    }
}
