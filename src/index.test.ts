import { describe, expect, it } from "vitest";

import * as sdk from "./index.js";

describe("public package entrypoint", () => {
    it("keeps root runtime exports focused on stable SDK entrypoints", () => {
        expect(sdk).toEqual(
            expect.objectContaining({
                PolyesterClient: expect.any(Function),
                PolyesterBrowserClient: expect.any(Function),
                PolyesterServerClient: expect.any(Function),
                POLYESTER_TESTNET_ENVIRONMENT: expect.any(Object),
                createCookieAuthTokenStorage: expect.any(Function),
                createMemoryAuthTokenStorage: expect.any(Function),
                createPolyesterAccountSigner: expect.any(Function),
                createPolyesterEnvironment: expect.any(Function),
                createPolyesterServerClientFromCookies: expect.any(Function),
                createPolyesterServerClientFromRequest: expect.any(Function),
                createPolyesterSmartAccount: expect.any(Function),
                createPolyesterSmartAccountClient: expect.any(Function),
            }),
        );
    });

    it("does not expose internal runtime modules from the root", () => {
        expect(sdk).not.toEqual(
            expect.objectContaining({
                AuthService: expect.any(Function),
                OrdersService: expect.any(Function),
                WhiteboardProtoService: expect.anything(),
                createTransports: expect.any(Function),
                polyesterSession: expect.anything(),
                polyesterToken: expect.anything(),
                LoginWithWalletInputSchema: expect.anything(),
                OrderSchema: expect.anything(),
                TimeframeCodec: expect.anything(),
            }),
        );
    });
});
