import { PolyesterCore } from "./core-client.js";
import { accountsService } from "./services/accounts/service.js";
import { addressBookService } from "./services/address-book/service.js";
import { apiKeysService } from "./services/api-keys/service.js";
import { balancesService } from "./services/balances/service.js";
import { candlesService } from "./services/candles/service.js";
import { chainAnalyticsService } from "./services/chain-analytics/service.js";
import { claimsService } from "./services/claims/service.js";
import { depositService } from "./services/deposit/service.js";
import { feesService } from "./services/fees/service.js";
import { guardSignerService } from "./services/guard-signer/service.js";
import { heatmapService } from "./services/heatmap/service.js";
import { internalTransfersService } from "./services/internal-transfers/service.js";
import { lifecycleService } from "./services/lifecycle/service.js";
import { marketDataService } from "./services/market-data/service.js";
import { marketOverviewService } from "./services/market-overview/service.js";
import { mfaService } from "./services/mfa/service.js";
import { orderbookService } from "./services/orderbook/service.js";
import { ordersService } from "./services/orders/service.js";
import { tradingRateLimitsService } from "./services/rate-limits/service.js";
import { rewardsService } from "./services/rewards/service.js";
import { socialVerificationService } from "./services/social-verification/service.js";
import { subaccountsService } from "./services/subaccounts/service.js";
import { tradesService } from "./services/trades/service.js";
import { tradingWithdrawsService } from "./services/trading-withdraws/service.js";
import { transfersService } from "./services/transfers/service.js";
import { triggersService } from "./services/triggers/service.js";
import { vipService } from "./services/vip/service.js";
import { whiteboardService } from "./services/whiteboard/service.js";
import { zipperService } from "./services/zipper/service.js";

/** Every service accessor, keyed by its getter name on the full clients. */
export const POLYESTER_SERVICES = {
    accounts: accountsService,
    apiKeys: apiKeysService,
    subaccounts: subaccountsService,
    candles: candlesService,
    chainAnalytics: chainAnalyticsService,
    marketData: marketDataService,
    marketOverview: marketOverviewService,
    orderbook: orderbookService,
    heatmap: heatmapService,
    lifecycle: lifecycleService,
    trades: tradesService,
    orders: ordersService,
    triggers: triggersService,
    balances: balancesService,
    transfers: transfersService,
    internalTransfers: internalTransfersService,
    tradingWithdraws: tradingWithdrawsService,
    deposit: depositService,
    addressBook: addressBookService,
    guardSigner: guardSignerService,
    socialVerification: socialVerificationService,
    whiteboard: whiteboardService,
    zipper: zipperService,
    mfa: mfaService,
    claims: claimsService,
    rewards: rewardsService,
    vip: vipService,
    fees: feesService,
    tradingRateLimits: tradingRateLimitsService,
};

/** Service getters shared by the full clients; each returns the same instance as its accessor. */
export type PolyesterServices = {
    readonly [K in keyof typeof POLYESTER_SERVICES]: ReturnType<(typeof POLYESTER_SERVICES)[K]>;
};

/** Defines a lazy getter per service, so the full clients stay in sync with the accessors. */
export function installServiceGetters(target: abstract new (...args: never[]) => PolyesterCore) {
    for (const [name, service] of Object.entries(POLYESTER_SERVICES)) {
        Object.defineProperty(target.prototype, name, {
            configurable: true,
            get(this: PolyesterCore) {
                return service(this);
            },
        });
    }
}

// oxlint-disable-next-line typescript/no-unsafe-declaration-merging -- getters are installed below
export interface PolyesterClient extends PolyesterServices {}

/**
 * Base SDK client with a lazy getter for every public service. Bundles that only
 * need a few services can use `PolyesterCore` with `@polyester/sdk/services/*` instead.
 */
// oxlint-disable-next-line typescript/no-unsafe-declaration-merging -- getters are installed below
export class PolyesterClient extends PolyesterCore {
    static {
        installServiceGetters(this);
    }
}
