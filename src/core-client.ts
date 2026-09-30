import type { Interceptor } from "@connectrpc/connect";
import { ConfigurationError } from "./shared/errors.js";
import {
    createApiKeyEd25519AuthHeaders,
    createTransports,
    resolveJwtToken,
    type AuthAndPublicApiTransports,
    type Transports,
    type JwtAuthProvider,
    type ApiKeyEd25519AuthProvider,
} from "./shared/transports.js";
import { parsePolyesterEnvironment, type PolyesterEnvironment } from "./environment.js";
import { AuthService } from "./services/auth/auth.js";
import type { SubaccountsService } from "./services/subaccounts/subaccounts.js";
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
                const token = await resolveJwtToken(auth);
                const headers: Record<string, string> = {};
                if (token) headers.authorization = `Bearer ${token}`;
                return headers;
            },
            hasAuth: () => {
                try {
                    const token = auth.getToken();
                    if (token !== null && typeof token !== "string") {
                        // Async credentials are validated by the token request.
                        void token.catch(() => {});
                        return true;
                    }
                    return token !== null && token.length > 0;
                } catch {
                    // Let the token request report provider failures as AuthenticationError.
                    return true;
                }
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

interface PolyesterClientCommonConfig {
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

type PolyesterCatalogConfig =
    | {
          /** Client-owned catalog store. */
          catalog: ClientCatalog;
          catalogSnapshot?: never;
          catalogCell?: never;
      }
    | {
          catalog?: never;
          /**
           * Explicit initial catalog snapshot, commonly hydrated from server-rendered data.
           * Combines with `catalogCell` as the cell's initial value without clobbering a
           * pre-populated cell.
           */
          catalogSnapshot?: CatalogSnapshot;
          /**
           * External snapshot storage for the client-built catalog. A cell backed by a
           * reactive source makes every catalog read reactive.
           */
          catalogCell?: CatalogSnapshotCell;
      };

/** Configuration shared by every Polyester client. */
export type PolyesterClientBaseConfig = PolyesterClientCommonConfig & PolyesterCatalogConfig;

/** Configuration for the base Polyester client. */
export type PolyesterClientConfig = PolyesterClientBaseConfig;

/** Preserves the exclusive catalog configuration while projecting client config fields. */
export function pickPolyesterCatalogConfig(
    config: PolyesterClientBaseConfig,
): PolyesterCatalogConfig {
    return config.catalog === undefined
        ? {
              catalogSnapshot: config.catalogSnapshot,
              catalogCell: config.catalogCell,
          }
        : { catalog: config.catalog };
}

interface AuthServiceFactoryContext {
    transports: AuthAndPublicApiTransports;
    realtime: PolyesterRealtime;
    environment: PolyesterEnvironment;
    /** Loads this client's subaccounts service on demand, keeping it out of the core bundle. */
    loadSubaccounts: () => Promise<SubaccountsService>;
}

interface PolyesterClientRuntimeConfig {
    createAuth?: (context: AuthServiceFactoryContext) => AuthService;
}

/**
 * Parses the configuration shared by every public client constructor.
 */
export function parsePolyesterClientConfig<TConfig extends PolyesterClientBaseConfig>(
    config: TConfig,
): TConfig {
    if (typeof config !== "object" || config === null || Array.isArray(config)) {
        throw new ConfigurationError("Client configuration must be an object.");
    }
    const environment = parsePolyesterEnvironment(config.environment);
    if (
        config.wireFormat !== undefined &&
        config.wireFormat !== "binary" &&
        config.wireFormat !== "json"
    ) {
        throw new ConfigurationError('wireFormat must be either "binary" or "json".');
    }
    if (config.catalog && config.catalogSnapshot) {
        throw new ConfigurationError("Provide either catalog or catalogSnapshot, not both.");
    }
    if (config.catalog && config.catalogCell) {
        throw new ConfigurationError("Provide either catalog or catalogCell, not both.");
    }

    return Object.assign({}, config, { environment });
}

/** Client internals handed to service factories created with {@link defineService}. */
export interface ServiceContext {
    readonly transports: Transports;
    readonly environment: PolyesterEnvironment;
    readonly realtime: PolyesterRealtime;
    readonly catalog: ClientCatalog;
    readonly scales: SdkScales;
    readonly resolver: SubaccountResolver | undefined;
}

const serviceContexts = new WeakMap<PolyesterCore, ServiceContext>();

/**
 * Defines a service accessor that lazily creates one service instance per client.
 * Accessors live in their own modules, so bundles only include the services they call.
 */
export function defineService<TService>(
    create: (context: ServiceContext) => TService,
): (client: PolyesterCore) => TService {
    const instances = new WeakMap<PolyesterCore, TService>();
    return (client) => {
        let service = instances.get(client);
        if (service === undefined) {
            const context = serviceContexts.get(client);
            if (!context) throw new ConfigurationError("Expected a Polyester client.");
            service = create(context);
            instances.set(client, service);
        }
        return service;
    };
}

/**
 * Tree-shakable SDK client core: wires transports, realtime, catalogs, and auth
 * for a Polyester environment. Other services are reached through their
 * `@polyester/sdk/services/*` accessors, e.g. `ordersService(core)`, so bundles
 * only include the services they use. `PolyesterClient` adds a getter for every service.
 *
 * Everything is constructed lazily on first access (and memoized) so that creating a
 * client — which happens for every SSR request in server hooks — stays cheap.
 */
export class PolyesterCore {
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

    constructor(config: PolyesterClientConfig, runtime: PolyesterClientRuntimeConfig = {}) {
        const parsedConfig = parsePolyesterClientConfig(config);
        config = parsedConfig;
        const interceptors = config.interceptors ?? [];
        const { environment } = config;

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

        // Getters keep realtime, catalog, and scales lazy until a service needs them.
        const context = { transports: this.transports, environment } as ServiceContext;
        serviceContexts.set(
            this,
            Object.defineProperties(context, {
                realtime: { get: () => this.realtime },
                catalog: { get: () => this.catalog },
                scales: { get: () => this.#getScales() },
                resolver: { get: () => this.#getResolver() },
            }),
        );
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
                // Refresh is async and rare, so its services load on demand rather
                // than pinning market data and zipper into every bundle.
                this.#catalog = createPolyesterCatalog({
                    snapshot: this.#configCatalogSnapshot,
                    cell: this.#configCatalogCell,
                    refresh: {
                        market: async () => {
                            const { marketDataService } =
                                await import("./services/market-data/service.js");
                            return marketDataService(this).getSpotConfig();
                        },
                        zipper: async () => {
                            const { zipperService } = await import("./services/zipper/service.js");
                            return zipperService(this).getDepositWithdrawConfig();
                        },
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
            this.#auth =
                this.#createAuth?.({
                    transports: this.transports,
                    realtime: this.realtime,
                    environment: this.#environment,
                    loadSubaccounts: async () => {
                        const { subaccountsService } =
                            await import("./services/subaccounts/service.js");
                        return subaccountsService(this);
                    },
                }) ?? new AuthService(this.transports, this.realtime);
        }
        return this.#auth;
    }

    /**
     * Override in subclasses to provide a subaccount resolver.
     * The resolver is called lazily when service methods are invoked.
     */
    protected createSubaccountResolver(): SubaccountResolver | undefined {
        return undefined;
    }
}
