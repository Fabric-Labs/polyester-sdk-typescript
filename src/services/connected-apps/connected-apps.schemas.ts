import * as v from "valibot";
import { OptionalTimestampMsSchema, PublicIdSchema, idInputSchema } from "../../shared/schemas.js";
import { PositiveStringInputSchema } from "../shared.js";

/** Selects a pending app connection request. */
export const AppConnectionRequestInputSchema = v.strictObject({
    /** The `request` query parameter the authorization endpoint gave the consent page. */
    requestId: PositiveStringInputSchema,
});

export type AppConnectionRequestInput = v.InferInput<typeof AppConnectionRequestInputSchema>;

export const RevokeConnectedAppInputSchema = v.strictObject({
    /** `connectedAppId` from `connectedApps.list`. */
    connectedAppId: idInputSchema("connectedAppId"),
});

export type RevokeConnectedAppInput = v.InferInput<typeof RevokeConnectedAppInputSchema>;

/** The OAuth client of an app, as it presents itself on the consent page. */
export const ConnectedAppClientSchema = v.object({
    clientId: v.string(),
    name: v.string(),
});

export type ConnectedAppClient = v.InferOutput<typeof ConnectedAppClientSchema>;

const ClientSchema = v.optional(ConnectedAppClientSchema, { clientId: "", name: "" });

/** A pending request from an app to connect to the account. Times are epoch milliseconds. */
export const AppConnectionRequestSchema = v.pipe(
    v.object({
        client: ClientSchema,
        scopes: v.array(v.string()),
        resource: v.string(),
        redirectHost: v.string(),
        expiresAt: OptionalTimestampMsSchema,
    }),
    v.transform((request) => ({
        client: request.client,
        /** OAuth scopes the app asks for, e.g. `"account:read"`. */
        scopes: request.scopes,
        /** Absolute URL of the server the app will use the account through. */
        resource: request.resource,
        /** Host the app receives the answer on. */
        redirectHost: request.redirectHost,
        /** After this the request can no longer be approved or denied. */
        expiresAt: request.expiresAt ?? null,
    })),
);

export type AppConnectionRequest = v.InferOutput<typeof AppConnectionRequestSchema>;

/** An app connected to the account. Times are epoch milliseconds. */
export const ConnectedAppSchema = v.pipe(
    v.object({
        connectedAppId: PublicIdSchema,
        client: ClientSchema,
        scopes: v.array(v.string()),
        resource: v.string(),
        connectedAt: OptionalTimestampMsSchema,
        lastUsedAt: OptionalTimestampMsSchema,
        expiresAt: OptionalTimestampMsSchema,
    }),
    v.transform((app) => ({
        /** Pass to `connectedApps.revoke`. */
        connectedAppId: app.connectedAppId,
        client: app.client,
        /** OAuth scopes the account granted the app. */
        scopes: app.scopes,
        /** Absolute URL of the server the app uses the account through. */
        resource: app.resource,
        connectedAt: app.connectedAt ?? null,
        /** Last use or refresh, at minute precision; null until the app first uses its access. */
        lastUsedAt: app.lastUsedAt ?? null,
        /** The connection ends then unless it is disconnected first. */
        expiresAt: app.expiresAt ?? null,
    })),
);

export type ConnectedApp = v.InferOutput<typeof ConnectedAppSchema>;

export const ConnectedAppsSchema = v.array(ConnectedAppSchema);

/** Where to send the browser to hand the app its answer. */
export const AppConnectionRequestRedirectSchema = v.object({ redirectUrl: v.string() });

export type AppConnectionRequestRedirect = v.InferOutput<typeof AppConnectionRequestRedirectSchema>;
