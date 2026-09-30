import { describe, expect, it } from "vitest";
import { PolyesterBrowserClient } from "./browser-client.js";
import { PolyesterBrowserCore } from "./browser-core.js";
import { POLYESTER_SERVICES, PolyesterClient } from "./client.js";
import { PolyesterCore } from "./core-client.js";
import { POLYESTER_DEVNET_ENVIRONMENT } from "./environment.js";
import { PolyesterServerClient } from "./server-client.js";
import { PolyesterServerCore } from "./server-core.js";
import { ordersService } from "./services/orders/service.js";
import { ConfigurationError } from "./shared/errors.js";

const config = { environment: POLYESTER_DEVNET_ENVIRONMENT };
const serviceNames = Object.keys(POLYESTER_SERVICES) as (keyof typeof POLYESTER_SERVICES)[];

describe("service accessors", () => {
    it.each([
        ["PolyesterClient", () => new PolyesterClient(config)],
        ["PolyesterBrowserClient", () => new PolyesterBrowserClient(config)],
        ["PolyesterServerClient", () => new PolyesterServerClient(config)],
    ] as const)("%s getters return the accessor's instance", (_name, createClient) => {
        const client = createClient();
        for (const name of serviceNames) {
            expect(client[name], name).toBe(POLYESTER_SERVICES[name](client));
            expect(client[name], name).toBe(client[name]);
        }
    });

    it.each([
        ["PolyesterCore", () => new PolyesterCore(config)],
        ["PolyesterBrowserCore", () => new PolyesterBrowserCore(config)],
        ["PolyesterServerCore", () => new PolyesterServerCore(config)],
    ] as const)("%s exposes services only through accessors", (_name, createCore) => {
        const core = createCore();
        for (const name of serviceNames) expect(name in core, name).toBe(false);
        expect(ordersService(core)).toBe(ordersService(core));
    });

    it("keeps one service instance per client", () => {
        const first = new PolyesterBrowserCore(config);
        const second = new PolyesterBrowserCore(config);
        expect(ordersService(first)).not.toBe(ordersService(second));
    });

    it("rejects values that are not Polyester clients", () => {
        expect(() => ordersService({} as PolyesterCore)).toThrow(ConfigurationError);
    });
});
