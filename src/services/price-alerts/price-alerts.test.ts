import { create } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import { describe, expect, it } from "vitest";
import * as Proto from "../../gen/alerts/v1/price_alerts_pb.js";
import { createErrorMappingTransport } from "../../shared/connect-error-mapping.js";
import {
    PermissionError,
    PreconditionFailedError,
    RevisionConflictError,
    ServiceUnavailableError,
    ValidationError,
} from "../../shared/errors.js";
import { rejectingUnaryTransport, unaryTransport } from "../../testing/service-harness.js";
import { formatId } from "../../utils/base58-id.js";
import { PriceAlertsService } from "./price-alerts.js";

const E9 = 1_000_000_000n;
const ALERT_ID = 77n;
const ts = (seconds: number) => ({ seconds: BigInt(seconds), nanos: 0 });

function rawAlert(overrides: Record<string, unknown> = {}) {
    return {
        alertId: ALERT_ID,
        symbolId: 3,
        direction: Proto.AlertDirection.ABOVE,
        priceSource: Proto.AlertPriceSource.INDEX_PRICE,
        priceTicks: 90_000n * E9,
        referencePriceTicks: 85_000_500_000_000n,
        armed: true,
        status: Proto.AlertStatus.ACTIVE,
        channels: [Proto.AlertChannel.IN_APP, Proto.AlertChannel.TELEGRAM],
        revision: 4n,
        createdAt: ts(1_700_000_000),
        updatedAt: ts(1_700_000_060),
        triggeredPriceTicks: 0n,
        ...overrides,
    };
}

function serviceWith(response: Record<string, unknown> = { alert: rawAlert() }) {
    const transport = unaryTransport(response);
    return { transport, service: new PriceAlertsService({ authApi: transport.transport }) };
}

function rejectingService(code: Code, alertCode: Proto.ErrorCode) {
    const error = new ConnectError("rejected", code, undefined, [
        {
            desc: Proto.ErrorDetailSchema,
            value: create(Proto.ErrorDetailSchema, { code: alertCode }),
        },
    ]);
    return new PriceAlertsService({
        authApi: createErrorMappingTransport(rejectingUnaryTransport(error)),
    });
}

describe("PriceAlertsService", () => {
    it("creates an alert with a decimal price and sorted channels", async () => {
        const { transport, service } = serviceWith();
        const alert = await service.create({
            symbolId: 3,
            direction: "above",
            price: "90000",
            channels: ["telegram", "in_app"],
            idempotencyKey: " key-1 ",
        });

        expect(transport.lastCall()?.message).toEqual({
            symbolId: 3,
            direction: Proto.AlertDirection.ABOVE,
            priceTicks: 90_000n * E9,
            channels: [Proto.AlertChannel.IN_APP, Proto.AlertChannel.TELEGRAM],
            idempotencyKey: "key-1",
        });
        expect(alert).toEqual({
            alertId: formatId(ALERT_ID),
            symbolId: 3,
            direction: "above",
            priceSource: "index_price",
            price: "90000",
            referencePrice: "85000.5",
            armed: true,
            status: "active",
            channels: ["in_app", "telegram"],
            revision: "4",
            createdAt: 1_700_000_000_000,
            updatedAt: 1_700_000_060_000,
            triggeredAt: null,
            triggeredPrice: null,
        });
    });

    it("reports the firing price only on a triggered alert", async () => {
        const { service } = serviceWith({
            alert: rawAlert({
                status: Proto.AlertStatus.TRIGGERED,
                triggeredAt: ts(1_700_000_120),
                triggeredPriceTicks: 90_001n * E9,
            }),
        });
        const alert = await service.cancel({ alertId: formatId(ALERT_ID) });
        expect(alert).toMatchObject({
            status: "triggered",
            triggeredAt: 1_700_000_120_000,
            triggeredPrice: "90001",
        });
    });

    it.each([
        ["no channel", { channels: [] }],
        ["three channels", { channels: ["in_app", "telegram", "in_app"] }],
        ["a repeated channel", { channels: ["in_app", "in_app"] }],
        ["a zero price", { price: "0" }],
        ["a negative price", { price: "-1" }],
        ["more than 9 decimals", { price: "1.0000000001" }],
        ["symbol 0", { symbolId: 0 }],
        ["an unknown direction", { direction: "sideways" }],
    ])("rejects %s before sending", async (_name, overrides) => {
        const { transport, service } = serviceWith();
        await expect(
            service.create({
                symbolId: 3,
                direction: "below",
                price: "1",
                channels: ["in_app"],
                ...(overrides as object),
            }),
        ).rejects.toBeInstanceOf(ValidationError);
        expect(transport.calls).toHaveLength(0);
    });

    it("lists alerts with filters and page token", async () => {
        const { transport, service } = serviceWith({ alerts: [rawAlert()], nextPageToken: "n" });
        const page = await service.list({
            statuses: ["active", "triggered"],
            symbolId: 3,
            limit: 200,
            pageToken: "p",
        });
        expect(transport.lastCall()?.message).toEqual({
            statuses: [Proto.AlertStatus.ACTIVE, Proto.AlertStatus.TRIGGERED],
            symbolId: 3,
            limit: 200,
            pageToken: "p",
        });
        expect(page.nextPageToken).toBe("n");
        expect(page.alerts).toHaveLength(1);
        await expect(service.list({ limit: 201 })).rejects.toBeInstanceOf(ValidationError);
    });

    it("degrades unknown enum values to unspecified", async () => {
        const { service } = serviceWith({ alerts: [rawAlert({ status: 99, channels: [9] })] });
        const { alerts } = await service.list();
        expect(alerts[0]).toMatchObject({ status: "unspecified", channels: ["unspecified"] });
    });

    it("sends only the given fields in the update mask", async () => {
        const { transport, service } = serviceWith({
            alert: rawAlert(),
            outcome: Proto.UpdateOutcome.APPLIED,
        });
        const result = await service.update({
            alertId: formatId(ALERT_ID),
            expectedRevision: "4",
            price: "91000.25",
            channels: ["in_app"],
        });
        expect(transport.lastCall()?.message).toEqual({
            alertId: ALERT_ID,
            expectedRevision: 4n,
            update: { priceTicks: 91_000_250_000_000n, channels: [Proto.AlertChannel.IN_APP] },
            updateMask: { paths: ["price_ticks", "channels"] },
        });
        expect(result.outcome).toBe("applied");
    });

    it("sends an empty mask to set a triggered alert again", async () => {
        const { transport, service } = serviceWith({
            alert: rawAlert(),
            outcome: Proto.UpdateOutcome.REPLAYED,
        });
        const result = await service.update({
            alertId: formatId(ALERT_ID),
            expectedRevision: "4",
            idempotencyKey: "rearm",
        });
        expect(transport.lastCall()?.message).toMatchObject({
            update: {},
            updateMask: { paths: [] },
            idempotencyKey: "rearm",
        });
        expect(result.outcome).toBe("replayed");
    });

    it("rejects a revision outside 1..uint64 before sending", async () => {
        const { transport, service } = serviceWith();
        for (const expectedRevision of ["0", "18446744073709551616", "1.5"]) {
            await expect(
                service.update({ alertId: formatId(ALERT_ID), expectedRevision }),
            ).rejects.toBeInstanceOf(ValidationError);
        }
        expect(transport.calls).toHaveLength(0);
    });

    it.each([
        [Code.Aborted, Proto.ErrorCode.REVISION_CONFLICT, RevisionConflictError],
        [Code.FailedPrecondition, Proto.ErrorCode.ALERT_TRIGGERED, PreconditionFailedError],
        [Code.Unavailable, Proto.ErrorCode.PRICE_UNAVAILABLE, ServiceUnavailableError],
        [Code.PermissionDenied, Proto.ErrorCode.SUBACCOUNT_KEY_REFUSED, PermissionError],
    ])("maps %s %s to its typed error with the alerts detail", async (code, alertCode, type) => {
        const rejected = rejectingService(code, alertCode).cancel({ alertId: formatId(ALERT_ID) });
        await expect(rejected).rejects.toBeInstanceOf(type);
        await expect(rejected).rejects.toMatchObject({
            detail: { service: "alerts", code: Proto.ErrorCode[alertCode] },
        });
    });
});
