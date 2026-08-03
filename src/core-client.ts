import type { Interceptor } from "@connectrpc/connect";
import { ConfigurationError } from "./shared/errors.js";
import {
    createApiKeyEd25519AuthHeaders,
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
import { ChainAnalyticsService } from "./services/chain-analytics/index.js";
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
import {
    createPolyesterCatalog,
    type CatalogSnapshot,
    type CatalogSnapshotCell,
    type ClientCatalog,
} from "./catalogs/index.js";
import { createCatalogSdkScales, type SdkScales } from "./shared/decimal-surface.js";
import { RealtimeClient, type PolyesterRealtime, type RealtimeConfig } from "./realtime/index.js";

function realtimeAuthFromProvider(
    auth: JwtAuthProvider | ApiKeyEd25519AuthProvider | undefined,
): Pick<RealtimeConfig, "getAuthHeaders" | "hasAuth"> {
    if (!auth) return {};
    if (auth.kind === "jwt") {
        return {
            getAuthHeaders: async () => {
                const token = await auth.getToken();
                const headers: Record<string, string> = {};
                if (token) headers.authorization = `Bearer ${token}`;
                return headers;
            },
            hasAuth: () => {
                // Only token getters that resolve synchronously can be checked here;
                // async getters are assumed authenticated and fail at token fetch.
                const token = auth.getToken();
                if (token instanceof Promise) return true;
                return typeof token === "string" && token.length > 0;
            },
        };
    }
    return {
        getAuthHeaders: (request) =>
            createApiKeyEd25519AuthHeaders(auth, {
                url: request.url,
                method: request.method,
            }),
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
     * Use `json` for human-readable debugging.
     */
    wireFormat?: "binary" | "json";
    /**
     * Client-owned catalog store. Advanced callers can inject a fully managed catalog instance.
     */
    catalog?: ClientCatalog;
    /**
     * Explicit initial catalog snapshot, commonly hydrated from server-rendered data.
     * Combines with `catalogCell` as the cell's initial value (never clobbers a
     * pre-populated cell).
     */
    catalogSnapshot?: CatalogSnapshot;
    /**
     * External snapshot storage for the client-built catalog (mutually exclusive with
     * `catalog`). A cell backed by a reactive source makes every catalog read reactive.
     */
    catalogCell?: CatalogSnapshotCell;
    /**
     * Advanced: inject pre-built Connect transports (in-memory mocks, custom
     * stacks). When provided, the SDK does not build its own transports and the
     * built-in auth/error-mapping interceptors are NOT applied — the injected
     * transports own their full interceptor chain.
     */
    transports?: Transports;
    /**
     * Advanced: inject a realtime implementation (in-memory mocks, custom
     * stacks). When provided, the SDK skips constructing its Centrifuge-backed
     * realtime client and the `realtime` auth config is ignored.
     */
    realtimeClient?: PolyesterRealtime;
}

export interface PolyesterClientConfig extends PolyesterClientBaseConfig {}

interface AuthServiceFactoryContext {
    transports: AuthServiceTransports;
    realtime: PolyesterRealtime;
    subaccounts: SubaccountsService;
    environment: PolyesterEnvironment;
}

interface PolyesterClientRuntimeConfig {
    createAuth?: (context: AuthServiceFactoryContext) => AuthService;
}

/**
 * Base SDK client that wires transports, realtime, catalogs, and all public service clients for a Polyester environment.
 *
 * Services are constructed lazily on first property access (and memoized) so
 * that creating a client — which happens for every SSR request in server
 * hooks — only pays for the services the caller actually touches.
 */
export class PolyesterClient {
    protected readonly transports: Transports;

    readonly #environment: PolyesterEnvironment;
    readonly #authProvider: JwtAuthProvider | ApiKeyEd25519AuthProvider | undefined;
    readonly #realtimeConfig: PolyesterRealtimeAuthConfig | undefined;
    readonly #configRealtimeClient: PolyesterRealtime | undefined;
    readonly #configCatalog: ClientCatalog | undefined;
    readonly #configCatalogSnapshot: CatalogSnapshot | undefined;
    readonly #configCatalogCell: CatalogSnapshotCell | undefined;
    readonly #createAuth: PolyesterClientRuntimeConfig["createAuth"];

    #realtime: PolyesterRealtime | undefined;
    #catalog: ClientCatalog | undefined;
    #scales: SdkScales | undefined;
    #resolver: SubaccountResolver | undefined;
    #resolverInitialized = false;

    #auth: AuthService | undefined;
    #accounts: AccountsService | undefined;
    #apiKeys: ApiKeysService | undefined;
    #subaccounts: SubaccountsService | undefined;
    #candles: CandlesService | undefined;
    #chainAnalytics: ChainAnalyticsService | undefined;
    #marketData: MarketDataService | undefined;
    #marketOverview: MarketOverviewService | undefined;
    #orderbook: OrderbookService | undefined;
    #heatmap: HeatmapService | undefined;
    #lifecycle: LifecycleService | undefined;
    #trades: TradesService | undefined;
    #orders: OrdersService | undefined;
    #triggers: TriggersService | undefined;
    #balances: BalancesService | undefined;
    #transfers: TransfersService | undefined;
    #internalTransfers: InternalTransfersService | undefined;
    #tradingWithdraws: TradingWithdrawsService | undefined;
    #deposit: DepositService | undefined;
    #addressBook: AddressBookService | undefined;
    #guardSigner: GuardSignerService | undefined;
    #socialVerification: SocialVerificationService | undefined;
    #whiteboard: WhiteboardService | undefined;
    #zipper: ZipperService | undefined;
    #mfa: MfaService | undefined;

    constructor(config: PolyesterClientConfig, runtime: PolyesterClientRuntimeConfig = {}) {
        const interceptors = config.interceptors ?? [];
        const { environment } = config;
        if (config.catalog && config.catalogSnapshot) {
            throw new ConfigurationError("Provide either catalog or catalogSnapshot, not both.");
        }
        if (config.catalog && config.catalogCell) {
            throw new ConfigurationError("Provide either catalog or catalogCell, not both.");
        }

        this.transports =
            config.transports ??
            createTransports({
                apiUrl: environment.apiUrl,
                interceptors,
                auth: config.auth,
                wireFormat: config.wireFormat,
            });

        this.#environment = environment;
        this.#authProvider = config.auth;
        this.#realtimeConfig = config.realtime;
        this.#configRealtimeClient = config.realtimeClient;
        this.#configCatalog = config.catalog;
        this.#configCatalogSnapshot = config.catalogSnapshot;
        this.#configCatalogCell = config.catalogCell;
        this.#createAuth = runtime.createAuth;
    }

    get realtime(): PolyesterRealtime {
        if (!this.#realtime) {
            if (this.#configRealtimeClient) {
                this.#realtime = this.#configRealtimeClient;
            } else {
                const environment = this.#environment;
                const realtimeAuth = realtimeAuthFromProvider(this.#authProvider);
                this.#realtime = new RealtimeClient({
                    wsUrl: environment.websocketUrl,
                    tokenEndpoint: `${environment.apiUrl}/v1/rt/token`,
                    subscribeEndpoint: `${environment.apiUrl}/v1/rt/subscribe`,
                    getAuthHeaders:
                        this.#realtimeConfig?.getAuthHeaders ?? realtimeAuth.getAuthHeaders,
                    hasAuth: this.#realtimeConfig?.hasAuth ?? realtimeAuth.hasAuth,
                });
            }
        }
        return this.#realtime;
    }

    get catalog(): ClientCatalog {
        if (!this.#catalog) {
            if (this.#configCatalog) {
                this.#catalog = this.#configCatalog;
            } else {
                const catalogRefreshMarketData = new MarketDataService(
                    this.transports.publicApi,
                    this.realtime,
                    this.#getScales(),
                );
                const catalogRefreshZipper = new ZipperService(this.transports.publicApi);
                this.#catalog = createPolyesterCatalog({
                    snapshot: this.#configCatalogSnapshot,
                    cell: this.#configCatalogCell,
                    refresh: {
                        market: () => catalogRefreshMarketData.getSpotConfig(),
                        zipper: () => catalogRefreshZipper.getDepositWithdrawConfig(),
                    },
                });
            }
        }
        return this.#catalog;
    }

    #getScales(): SdkScales {
        // Lazy catalog binding: the resolver only dereferences `this.catalog` at
        // call time. getSpotConfig() (the catalog's own refresh source) never
        // awaits scale readiness.
        this.#scales ??= createCatalogSdkScales(() => this.catalog);
        return this.#scales;
    }

    #getResolver(): SubaccountResolver | undefined {
        if (!this.#resolverInitialized) {
            this.#resolverInitialized = true;
            this.#resolver = this.createSubaccountResolver();
        }
        return this.#resolver;
    }

    get auth(): AuthService {
        if (!this.#auth) {
            const { authApi, publicApi } = this.transports;
            this.#auth =
                this.#createAuth?.({
                    transports: { publicApi, authApi },
                    realtime: this.realtime,
                    subaccounts: this.subaccounts,
                    environment: this.#environment,
                }) ?? new AuthService({ publicApi, authApi }, this.realtime);
        }
        return this.#auth;
    }

    get accounts(): AccountsService {
        return (this.#accounts ??= new AccountsService(this.transports.authApi));
    }

    get apiKeys(): ApiKeysService {
        return (this.#apiKeys ??= new ApiKeysService(
            this.transports.authApi,
            this.realtime,
            this.#getResolver(),
        ));
    }

    get subaccounts(): SubaccountsService {
        return (this.#subaccounts ??= new SubaccountsService(
            this.transports.authApi,
            this.realtime,
            this.#getResolver(),
        ));
    }

    get candles(): CandlesService {
        return (this.#candles ??= new CandlesService(
            this.transports.publicApi,
            this.realtime,
            this.#getScales(),
        ));
    }

    get chainAnalytics(): ChainAnalyticsService {
        return (this.#chainAnalytics ??= new ChainAnalyticsService(
            this.transports.publicApi,
            this.#getScales(),
        ));
    }

    get marketData(): MarketDataService {
        return (this.#marketData ??= new MarketDataService(
            this.transports.publicApi,
            this.realtime,
            this.#getScales(),
        ));
    }

    get marketOverview(): MarketOverviewService {
        return (this.#marketOverview ??= new MarketOverviewService(
            this.transports.publicApi,
            this.realtime,
            this.#getScales(),
        ));
    }

    get orderbook(): OrderbookService {
        return (this.#orderbook ??= new OrderbookService(
            this.transports.publicApi,
            this.realtime,
            this.#getScales(),
        ));
    }

    get heatmap(): HeatmapService {
        return (this.#heatmap ??= new HeatmapService(
            this.transports.publicApi,
            this.realtime,
            this.#getScales(),
        ));
    }

    get lifecycle(): LifecycleService {
        return (this.#lifecycle ??= new LifecycleService(this.transports.publicApi, this.realtime));
    }

    get trades(): TradesService {
        return (this.#trades ??= new TradesService(
            this.transports.authApi,
            this.realtime,
            this.#getResolver(),
            this.#getScales(),
        ));
    }

    get orders(): OrdersService {
        return (this.#orders ??= new OrdersService(
            this.transports.authApi,
            this.realtime,
            this.#getResolver(),
            this.#getScales(),
        ));
    }

    get triggers(): TriggersService {
        return (this.#triggers ??= new TriggersService(
            this.transports.authApi,
            this.realtime,
            this.#getResolver(),
            this.#getScales(),
        ));
    }

    get balances(): BalancesService {
        return (this.#balances ??= new BalancesService(
            this.transports.authApi,
            this.realtime,
            this.#getResolver(),
            this.#getScales(),
        ));
    }

    get transfers(): TransfersService {
        return (this.#transfers ??= new TransfersService(
            this.transports.authApi,
            this.realtime,
            this.#getResolver(),
            this.#getScales(),
        ));
    }

    get internalTransfers(): InternalTransfersService {
        return (this.#internalTransfers ??= new InternalTransfersService(
            this.transports.authApi,
            this.#getResolver(),
            this.#getScales(),
        ));
    }

    get tradingWithdraws(): TradingWithdrawsService {
        return (this.#tradingWithdraws ??= new TradingWithdrawsService(
            this.transports.authApi,
            this.#getResolver(),
            {
                chainId: this.#environment.chain.id,
                tradingGatewayAddress: this.#environment.contracts.tradingGatewayAddress,
            },
            this.#getScales(),
            this.catalog,
        ));
    }

    get deposit(): DepositService {
        return (this.#deposit ??= new DepositService(this.transports.authApi, this.#getResolver()));
    }

    get addressBook(): AddressBookService {
        return (this.#addressBook ??= new AddressBookService(
            this.transports.authApi,
            this.realtime,
            this.#getResolver(),
        ));
    }

    get guardSigner(): GuardSignerService {
        return (this.#guardSigner ??= new GuardSignerService(
            this.transports.authApi,
            this.#getResolver(),
        ));
    }

    get socialVerification(): SocialVerificationService {
        return (this.#socialVerification ??= new SocialVerificationService(
            this.transports.authApi,
        ));
    }

    get whiteboard(): WhiteboardService {
        return (this.#whiteboard ??= new WhiteboardService(this.transports.authApi));
    }

    get zipper(): ZipperService {
        return (this.#zipper ??= new ZipperService(
            this.transports.publicApi,
            this.realtime,
            this.#getScales(),
        ));
    }

    get mfa(): MfaService {
        return (this.#mfa ??= new MfaService(this.transports.authApi));
    }

    /**
     * Override in subclasses to provide a subaccount resolver.
     * The resolver is called lazily when service methods are invoked.
     */
    protected createSubaccountResolver(): SubaccountResolver | undefined {
        return undefined;
    }
}
