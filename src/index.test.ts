import { describe, expect, it } from "vitest";

import * as sdk from "./index.js";
import * as smartAccountSdk from "./smart-account/index.js";

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
                createPolyesterEnvironment: expect.any(Function),
                createPolyesterServerClientFromCookies: expect.any(Function),
                createPolyesterServerClientFromRequest: expect.any(Function),
                mergeLedgerBalances: expect.any(Function),
                compareUnsignedIntegerStrings: expect.any(Function),
                shouldApplyReconciliationUpdate: expect.any(Function),
                timestampToNanoseconds: expect.any(Function),
                RevisionConflictError: expect.any(Function),
                isRevisionConflictError: expect.any(Function),
                PolicyInUseError: expect.any(Function),
                PolicyLockedError: expect.any(Function),
                PolicyScopeMismatchError: expect.any(Function),
                isPolicyInUseError: expect.any(Function),
                isPolicyLockedError: expect.any(Function),
                isPolicyScopeMismatchError: expect.any(Function),
                getOrderErrorDetail: expect.any(Function),
            }),
        );
    });

    it("does not expose internal or specialized runtime modules from the root", () => {
        expect(sdk).not.toEqual(
            expect.objectContaining({
                AuthService: expect.any(Function),
                OrdersService: expect.any(Function),
                WhiteboardProtoService: expect.anything(),
                // moved to the ./account-signer subpath so its viem graph stays
                // out of bundles that import the root barrel
                createPolyesterAccountSigner: expect.any(Function),
                createPolyesterSmartAccount: expect.any(Function),
                createPolyesterSmartAccountClient: expect.any(Function),
                createTransports: expect.any(Function),
                polyesterSession: expect.anything(),
                polyesterToken: expect.anything(),
                LoginWithWalletInputSchema: expect.anything(),
                OrderErrorDetailSchema: expect.anything(),
                OrderSchema: expect.anything(),
                TimeframeCodec: expect.anything(),
            }),
        );
    });
});

describe("smart-account package entrypoint", () => {
    it("exposes account-abstraction helpers from the dedicated entrypoint", () => {
        expect(smartAccountSdk).toEqual(
            expect.objectContaining({
                createPolyesterSmartAccount: expect.any(Function),
                createPolyesterSmartAccountClient: expect.any(Function),
            }),
        );
    });
});
