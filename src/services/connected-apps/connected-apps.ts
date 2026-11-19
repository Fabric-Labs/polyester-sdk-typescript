import { createClient, type Client } from "@connectrpc/connect";
import * as Proto from "../../gen/auth/v1/connected_apps_pb.js";
import {
    toConnectCallOptions,
    type PolyesterMutationOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import type { AuthApiTransports } from "../../shared/transports.js";
import { parse } from "../../shared/validation.js";
import {
    AppAuthorizationInputSchema,
    AppAuthorizationRedirectSchema,
    AppAuthorizationSchema,
    ConnectedAppsSchema,
    RevokeConnectedAppInputSchema,
    type AppAuthorization,
    type AppAuthorizationInput,
    type AppAuthorizationRedirect,
    type ConnectedApp,
    type RevokeConnectedAppInput,
} from "./connected-apps.schemas.js";

/**
 * Connects outside apps, such as an AI assistant, to the account with OAuth ("Sign in with
 * Polyester"), and lists and disconnects them. Session only: the website's consent page and
 * settings call these, and API keys are refused. A connected app uses the account as the
 * signed-in website does, for the scopes granted; it never moves money out of the account or
 * changes its security settings. A connection lasts until it is disconnected or expires; signing
 * out does not end it.
 */
export class ConnectedAppsService {
    #client: Client<typeof Proto.ConnectedAppService>;

    constructor(transports: AuthApiTransports) {
        this.#client = createClient(Proto.ConnectedAppService, transports.authApi);
    }

    /**
     * Reads a pending app connection request to show the consent page. An unknown, expired or
     * already answered request throws `ResourceNotFoundError`.
     */
    async getAuthorization(
        input: AppAuthorizationInput,
        options?: PolyesterRequestOptions,
    ): Promise<AppAuthorization> {
        const request = parse(AppAuthorizationInputSchema, input);
        const response = await this.#client.getAppAuthorization(
            request,
            toConnectCallOptions(options),
        );
        return parse(AppAuthorizationSchema, response.authorization);
    }

    /**
     * Approves a pending app connection request; send the browser to the returned `redirectUrl`,
     * which carries a one-time authorization code valid for 60 seconds. Needs MFA enrolled and a
     * fresh `stepUpToken`. An unknown, expired or already answered request throws
     * `ResourceNotFoundError`; an account with 20 connected apps throws `PreconditionFailedError`
     * (`AUTH_CONNECTED_APP_LIMIT_REACHED`).
     */
    async approveAuthorization(
        input: AppAuthorizationInput,
        options?: PolyesterMutationOptions,
    ): Promise<AppAuthorizationRedirect> {
        const request = parse(AppAuthorizationInputSchema, input);
        const response = await this.#client.approveAppAuthorization(
            request,
            toConnectCallOptions(options),
        );
        return parse(AppAuthorizationRedirectSchema, response);
    }

    /**
     * Denies a pending app connection request; send the browser to the returned `redirectUrl`,
     * which carries the `access_denied` error. An unknown, expired or already answered request
     * throws `ResourceNotFoundError`.
     */
    async denyAuthorization(
        input: AppAuthorizationInput,
        options?: PolyesterRequestOptions,
    ): Promise<AppAuthorizationRedirect> {
        const request = parse(AppAuthorizationInputSchema, input);
        const response = await this.#client.denyAppAuthorization(
            request,
            toConnectCallOptions(options),
        );
        return parse(AppAuthorizationRedirectSchema, response);
    }

    /** Lists the apps connected to the account, newest first; at most 20. */
    async list(options?: PolyesterRequestOptions): Promise<ConnectedApp[]> {
        const response = await this.#client.listConnectedApps({}, toConnectCallOptions(options));
        return parse(ConnectedAppsSchema, response.apps);
    }

    /**
     * Disconnects an app; its access and refresh tokens stop working at once. Disconnecting an
     * app already disconnected or expired succeeds; an ID that is not one of the account's
     * connected apps throws `ResourceNotFoundError`.
     */
    async revoke(input: RevokeConnectedAppInput, options?: PolyesterRequestOptions): Promise<void> {
        const request = parse(RevokeConnectedAppInputSchema, input);
        await this.#client.revokeConnectedApp(request, toConnectCallOptions(options));
    }
}
