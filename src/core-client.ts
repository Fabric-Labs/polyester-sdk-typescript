import type { Interceptor } from "@connectrpc/connect";
import {
    createTransports,
    type Transports,
    type JwtAuthProvider,
    type ApiKeyEd25519AuthProvider,
} from "./shared/transports.js";
import type { PolyesterEnvironment } from "./environment.js";
import { AccountsService } from "./services/accounts/index.js";
import { ApiKeysService } from "./services/api-keys/index.js";
import { AuthService, type AuthServiceTransports } from "./services/auth/auth.js";
import { SubaccountsService } from "./services/subaccounts/index.js";
import { CandlesService } from "./services/candles/index.js";
import { MarketDataService } from "./services/market-data/index.js";
import { MarketOverviewService } from "./services/market-overview/index.js";
import { OrderbookService } from "./services/orderbook/index.js";
import { HeatmapService } from "./services/heatmap/index.js";
import { LifecycleService } from "./services/lifecycle/index.js";
import { TradesService } from "./services/trades/index.js";
import { OrdersService } from "./services/orders/index.js";
import { TriggersService } from "./services/triggers/index.js";
import { BalancesService } from "./services/balances/index.js";
import { TransfersService } from "./services/transfers/index.js";
import { InternalTransfersService } from "./services/internal-transfers/index.js";
import { TradingWithdrawsService } from "./services/trading-withdraws/index.js";
import { DepositService } from "./services/deposit/index.js";
import { AddressBookService } from "./services/address-book/index.js";
import { GuardSignerService } from "./services/guard-signer/index.js";
import { SocialVerificationService } from "./services/social-verification/index.js";
import { WhiteboardService } from "./services/whiteboard/index.js";
import { ZipperService } from "./services/zipper/index.js";
import { MfaService } from "./services/mfa/index.js";
import type { SubaccountResolver } from "./services/subaccount-resolver.js";
import { setAssetCatalog, setEnrichedPairCatalog } from "./catalogs/market-data-catalog.js";
import { ASSET_CATALOG, PAIR_CATALOG } from "./catalogs/market-data-catalog.generated.js";
import {
    setZipperAssetsCatalog,
    setZipperChainsCatalog,
    setZipperContractsCatalog,
} from "./catalogs/zipper-catalog.js";
import {
    ZIPPER_ASSET_CATALOG,
    ZIPPER_CHAIN_CATALOG,
    ZIPPER_CONTRACTS_CATALOG,
} from "./catalogs/zipper-catalog.generated.js";
import {
    refreshCatalogs as refreshCatalogsFromApi,
    refreshCatalogsInBackground,
} from "./catalogs/catalog-refresh.js";
import { RealtimeClient, type RealtimeConfig } from "./realtime/index.js";

let generatedCatalogsInitialized = false;

function initializeGeneratedCatalogs(): void {
    if (generatedCatalogsInitialized) return;

    setAssetCatalog(ASSET_CATALOG);
    setEnrichedPairCatalog(PAIR_CATALOG);
    setZipperChainsCatalog(ZIPPER_CHAIN_CATALOG);
    setZipperAssetsCatalog(ZIPPER_ASSET_CATALOG);
    setZipperContractsCatalog(ZIPPER_CONTRACTS_CATALOG);
    generatedCatalogsInitialized = true;
}

function realtimeAuthFromProvider(
    auth: JwtAuthProvider | ApiKeyEd25519AuthProvider | undefined,
): Pick<RealtimeConfig, "getAuthHeaders" | "hasAuth"> {
    if (!auth || auth.kind !== "jwt") return {};
    return {
        getAuthHeaders: async () => {
            const token = await auth.getToken();
            const headers: Record<string, string> = {};
            if (token) headers.authorization = `Bearer ${token}`;
            return headers;
        },
        hasAuth: () => true,
    };
}

export type PolyesterRealtimeAuthConfig = Pick<RealtimeConfig, "getAuthHeaders" | "hasAuth">;

export interface PolyesterClientBaseConfig {
    environment: PolyesterEnvironment;
    interceptors?: Interceptor[];
    auth?: JwtAuthProvider | ApiKeyEd25519AuthProvider;
    realtime?: PolyesterRealtimeAuthConfig;
    /**
     * Connect wire format. Defaults to binary for production performance.
     * Use `json` for the API Playground visualization.
     */
    wireFormat?: "binary" | "json";
    /**
     * Refresh runtime catalogs from the API after construction. Defaults to true.
     */
    refreshCatalogs?: boolean;
}

export interface PolyesterClientConfig extends PolyesterClientBaseConfig {}

interface AuthServiceFactoryContext {
    transports: AuthServiceTransports;
    realtime: RealtimeClient;
    subaccounts: SubaccountsService;
    environment: PolyesterEnvironment;
}

interface PolyesterClientRuntimeConfig {
    createAuth?: (context: AuthServiceFactoryContext) => AuthService;
}

/**
 * Base SDK client that wires transports, realtime, catalogs, and all public service clients for a Polyester environment.
 */
export class PolyesterClient {
    readonly auth: AuthService;
    readonly accounts: AccountsService;
    readonly apiKeys: ApiKeysService;
    readonly subaccounts: SubaccountsService;
    readonly candles: CandlesService;
    readonly marketData: MarketDataService;
    readonly marketOverview: MarketOverviewService;
    readonly orderbook: OrderbookService;
    readonly heatmap: HeatmapService;
    readonly lifecycle: LifecycleService;
    readonly trades: TradesService;
    readonly orders: OrdersService;
    readonly triggers: TriggersService;
    readonly balances: BalancesService;
    readonly transfers: TransfersService;
    readonly internalTransfers: InternalTransfersService;
    readonly tradingWithdraws: TradingWithdrawsService;
    readonly deposit: DepositService;
    readonly addressBook: AddressBookService;
    readonly guardSigner: GuardSignerService;
    readonly socialVerification: SocialVerificationService;
    readonly whiteboard: WhiteboardService;
    readonly zipper: ZipperService;
    readonly mfa: MfaService;
    readonly realtime: RealtimeClient;

    protected readonly transports: Transports;

    constructor(config: PolyesterClientConfig, runtime: PolyesterClientRuntimeConfig = {}) {
        initializeGeneratedCatalogs();
        const interceptors = config.interceptors ?? [];
        const { environment } = config;

        this.transports = createTransports({
            apiUrl: environment.apiUrl,
            interceptors,
            auth: config.auth,
            wireFormat: config.wireFormat,
        });

        const { authApi, publicApi } = this.transports;
        const realtimeAuth = realtimeAuthFromProvider(config.auth);

        this.realtime = new RealtimeClient({
            wsUrl: environment.websocketUrl,
            tokenEndpoint: `${environment.apiUrl}/v1/rt/token`,
            subscribeEndpoint: `${environment.apiUrl}/v1/rt/subscribe`,
            getAuthHeaders: config.realtime?.getAuthHeaders ?? realtimeAuth.getAuthHeaders,
            hasAuth: config.realtime?.hasAuth ?? realtimeAuth.hasAuth,
        });

        this.subaccounts = new SubaccountsService(authApi, this.realtime);
        this.auth =
            runtime.createAuth?.({
                transports: { publicApi, authApi },
                realtime: this.realtime,
                subaccounts: this.subaccounts,
                environment,
            }) ?? new AuthService({ publicApi, authApi }, this.realtime);

        const resolver = this.createSubaccountResolver();

        this.accounts = new AccountsService(authApi);
        this.apiKeys = new ApiKeysService(authApi, this.realtime, resolver);
        this.candles = new CandlesService(publicApi, this.realtime);
        this.marketData = new MarketDataService(publicApi, this.realtime);
        this.marketOverview = new MarketOverviewService(publicApi, this.realtime);
        this.orderbook = new OrderbookService(publicApi, this.realtime);
        this.heatmap = new HeatmapService(publicApi, this.realtime);
        this.lifecycle = new LifecycleService(publicApi, this.realtime);
        this.trades = new TradesService(authApi, this.realtime, resolver);
        this.orders = new OrdersService(authApi, this.realtime, resolver);
        this.triggers = new TriggersService(authApi, this.realtime, resolver);
        this.balances = new BalancesService(authApi, this.realtime, resolver);
        this.transfers = new TransfersService(authApi, this.realtime, resolver);
        this.internalTransfers = new InternalTransfersService(authApi, resolver);
        this.tradingWithdraws = new TradingWithdrawsService(authApi, resolver, {
            chainId: environment.chain.id,
            tradingGatewayAddress: environment.contracts.tradingGatewayAddress,
        });
        this.deposit = new DepositService(authApi, resolver);
        this.addressBook = new AddressBookService(authApi, resolver);
        this.guardSigner = new GuardSignerService(authApi, resolver);
        this.socialVerification = new SocialVerificationService(authApi);
        this.whiteboard = new WhiteboardService(authApi);
        this.zipper = new ZipperService(publicApi);
        this.mfa = new MfaService(authApi);

        if (config.refreshCatalogs !== false) {
            refreshCatalogsInBackground(this);
        }
    }

    /**
     * Refreshes SDK catalogs used by catalog lookup helpers.
     */
    async refreshCatalogs(): Promise<void> {
        await refreshCatalogsFromApi(this);
    }

    /**
     * Override in subclasses to provide a subaccount resolver.
     * The resolver is called lazily when service methods are invoked.
     */
    protected createSubaccountResolver(): SubaccountResolver | undefined {
        return undefined;
    }
}
