import { describe, expect, it } from "vitest";
import { unaryTransport } from "../../testing/service-harness.js";
import * as Proto from "../../gen/system/v1/system_pb.js";
import { formatId } from "../../utils/base58-id.js";
import { SystemService } from "./system.js";

describe("SystemService", () => {
    it("returns the build version on the public API", async () => {
        const publicApi = unaryTransport({
            version: "0.10.0-12-g4e21a2f09670",
            commit: "4e21a2f0967000000000000000000000000000ab",
            environment: "devnet",
        });
        const service = new SystemService({ publicApi: publicApi.transport });

        await expect(service.getVersion()).resolves.toEqual({
            version: "0.10.0-12-g4e21a2f09670",
            commit: "4e21a2f0967000000000000000000000000000ab",
            environment: "devnet",
        });
        expect(publicApi.lastCall()?.method.name).toBe("GetVersion");
    });

    it("lists status events with mapped filters and nullable optional fields", async () => {
        const publicApi = unaryTransport({
            events: [
                {
                    id: 42n,
                    kind: Proto.StatusEventKind.INCIDENT,
                    state: Proto.StatusEventState.CANCELLED,
                    title: "Deposits delayed",
                    message: "SOL deposits are delayed.",
                    startTime: { seconds: 1_700_000_000n, nanos: 0 },
                    services: [Proto.AffectedService.DEPOSITS, 99],
                    markets: [],
                    updatedAt: { seconds: 1_700_000_100n, nanos: 0 },
                    impact: Proto.StatusEventImpact.PARTIAL_OUTAGE,
                    assets: ["SOL"],
                    cancelledAt: { seconds: 1_700_000_100n, nanos: 0 },
                    updates: [
                        { id: 1, message: "Investigating", createdAt: { seconds: 1_700_000_050n } },
                    ],
                },
                {
                    id: 43n,
                    kind: Proto.StatusEventKind.MAINTENANCE,
                    state: Proto.StatusEventState.SCHEDULED,
                    title: "Upgrade",
                    message: "",
                    services: [Proto.AffectedService.TRADING],
                    markets: ["BTC-USDT"],
                    impact: Proto.StatusEventImpact.IMPACT_UNSPECIFIED,
                    assets: [],
                    updates: [],
                    detailsUrl: "https://example.com/upgrade",
                },
            ],
            nextPageToken: "next",
        });
        const service = new SystemService({ publicApi: publicApi.transport });

        const result = await service.listStatusEvents({
            states: ["canceled", "in_progress"],
            kinds: ["incident"],
            limit: 10,
        });

        expect(publicApi.lastCall()?.method.name).toBe("ListStatusEvents");
        expect(publicApi.lastCall()?.message).toEqual({
            states: [Proto.StatusEventState.CANCELLED, Proto.StatusEventState.IN_PROGRESS],
            kinds: [Proto.StatusEventKind.INCIDENT],
            limit: 10,
        });
        expect(result.nextPageToken).toBe("next");
        expect(result.events[0]).toEqual({
            id: formatId(42n),
            kind: "incident",
            state: "canceled",
            title: "Deposits delayed",
            message: "SOL deposits are delayed.",
            startTime: 1_700_000_000_000,
            endTime: null,
            services: ["deposits", "unspecified"],
            markets: [],
            assets: ["SOL"],
            impact: "partial_outage",
            updatedAt: 1_700_000_100_000,
            canceledAt: 1_700_000_100_000,
            updates: [{ id: 1, message: "Investigating", createdAt: 1_700_000_050_000 }],
            detailsUrl: null,
        });
        expect(result.events[1]).toMatchObject({
            kind: "maintenance",
            state: "scheduled",
            impact: null,
            canceledAt: null,
            detailsUrl: "https://example.com/upgrade",
        });
    });

    it("rejects a limit over 200 before sending", async () => {
        const publicApi = unaryTransport({});
        const service = new SystemService({ publicApi: publicApi.transport });

        await expect(service.listStatusEvents({ limit: 201 })).rejects.toThrow();
        expect(publicApi.calls).toHaveLength(0);
    });
});
