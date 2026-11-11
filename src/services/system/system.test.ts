import { describe, expect, it } from "vitest";
import { unaryTransport } from "../../testing/service-harness.js";
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
});
