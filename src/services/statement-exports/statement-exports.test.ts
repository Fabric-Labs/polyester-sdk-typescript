import { create } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import { describe, expect, it } from "vitest";
import { ErrorCode, ErrorDetailSchema } from "../../gen/ledger/read/v1/ledger_read_pb.js";
import * as Proto from "../../gen/ledger/read/v1/statement_export_pb.js";
import { createErrorMappingTransport } from "../../shared/connect-error-mapping.js";
import {
    PermissionError,
    PreconditionFailedError,
    ResourceNotFoundError,
    ValidationError,
} from "../../shared/errors.js";
import {
    rejectingUnaryTransport,
    subaccountResolverStub,
    unaryTransport,
} from "../../testing/service-harness.js";
import { formatId } from "../../utils/base58-id.js";
import { StatementExportsService } from "./statement-exports.js";

const EXPORT_ID = 991n;
const ts = (seconds: number) => ({ seconds: BigInt(seconds), nanos: 0 });

function rawExport(overrides: Record<string, unknown> = {}) {
    return {
        exportId: EXPORT_ID,
        subaccountId: 7n,
        startTime: ts(1_700_000_000),
        endTime: ts(1_710_000_000),
        assetId: 2,
        idempotencyKey: "q1-2026",
        status: Proto.StatementExportStatus.READY,
        completeThrough: ts(1_705_000_000),
        movements: 18_446_744_073_709_551_615n,
        bytes: 4_096n,
        createdAt: ts(1_705_000_000),
        readyAt: ts(1_705_000_060),
        expiresAt: ts(1_705_604_860),
        failureReason: Proto.StatementExportFailureReason.UNSPECIFIED,
        ...overrides,
    };
}

function serviceWith(response: Record<string, unknown>, resolverDefault: string | null = null) {
    const transport = unaryTransport(response);
    const service = new StatementExportsService(
        { authApi: transport.transport },
        subaccountResolverStub(resolverDefault),
    );
    return { transport, service };
}

const createInput = { startTime: 1_000, endTime: 2_500, idempotencyKey: "k" };

describe("StatementExportsService", () => {
    it("creates an export for the resolved account and surfaces every field", async () => {
        const { transport, service } = serviceWith({ export: rawExport() }, formatId(7n));
        const result = await service.create({
            ...createInput,
            assetId: 2,
            idempotencyKey: "q:1",
        });

        const call = transport.lastCall();
        expect(call?.method.name).toBe("CreateStatementExport");
        expect(call?.message).toEqual({
            subaccountId: 7n,
            startTime: { seconds: 1n, nanos: 0 },
            endTime: { seconds: 2n, nanos: 500_000_000 },
            assetId: 2,
            idempotencyKey: "q:1",
        });
        expect(result).toEqual({
            exportId: formatId(EXPORT_ID),
            subaccountId: formatId(7n),
            startTime: 1_700_000_000_000,
            endTime: 1_710_000_000_000,
            assetId: 2,
            idempotencyKey: "q1-2026",
            status: "ready",
            completeThrough: 1_705_000_000_000,
            movements: "18446744073709551615",
            bytes: "4096",
            createdAt: 1_705_000_000_000,
            readyAt: 1_705_000_060_000,
            expiresAt: 1_705_604_860_000,
            failureReason: "unspecified",
        });
    });

    it("reports a root-account export still queued with null subaccount and times", async () => {
        const { transport, service } = serviceWith({
            export: rawExport({
                subaccountId: undefined,
                status: Proto.StatementExportStatus.QUEUED,
                readyAt: undefined,
                expiresAt: undefined,
            }),
        });
        const result = await service.create({ ...createInput, account: "main" });
        expect(transport.lastCall()?.message).toMatchObject({
            subaccountId: undefined,
            assetId: 0,
        });
        expect(result).toMatchObject({
            subaccountId: null,
            status: "queued",
            readyAt: null,
            expiresAt: null,
        });
    });

    it("gets an export by its public ID and decodes a failure reason", async () => {
        const { transport, service } = serviceWith({
            export: rawExport({
                status: Proto.StatementExportStatus.FAILED,
                failureReason: Proto.StatementExportFailureReason.TOO_LARGE,
            }),
        });
        const result = await service.get({ exportId: formatId(EXPORT_ID) });
        expect(transport.lastCall()?.message).toEqual({ exportId: EXPORT_ID });
        expect(result).toMatchObject({ status: "failed", failureReason: "too_large" });
    });

    it("lists the resolved account's exports with a page token", async () => {
        const { transport, service } = serviceWith(
            { exports: [rawExport({ status: 99 })], nextPageToken: "n" },
            formatId(7n),
        );
        const page = await service.list({ limit: 100, pageToken: " p " });
        expect(transport.lastCall()?.message).toEqual({
            subaccountId: 7n,
            limit: 100,
            pageToken: "p",
        });
        expect(page.nextPageToken).toBe("n");
        expect(page.exports[0]?.status).toBe("unspecified");
    });

    it.each([
        ["an idempotency key over 64 characters", { idempotencyKey: "k".repeat(65) }],
        ["an empty idempotency key", { idempotencyKey: "  " }],
        ["a padded idempotency key", { idempotencyKey: " q:1 " }],
        ["a slash in the idempotency key", { idempotencyKey: "a/b" }],
        ["a start at the epoch", { startTime: 0 }],
        ["an empty period", { startTime: 2_500 }],
        ["an end after 2262-04-11T23:47:16Z", { endTime: Date.UTC(2262, 3, 11, 23, 47, 17) }],
        ["an asset ID over uint32", { assetId: 2 ** 32 }],
    ])("rejects %s before sending", async (_name, overrides) => {
        const { transport, service } = serviceWith({});
        await expect(service.create({ ...createInput, ...overrides })).rejects.toBeInstanceOf(
            ValidationError,
        );
        expect(transport.calls).toHaveLength(0);
    });

    it("accepts the widest bounds the proto allows", async () => {
        const { transport, service } = serviceWith({ export: rawExport() });
        await service.create({
            startTime: 1,
            endTime: Date.UTC(2262, 3, 11, 23, 47, 16),
            idempotencyKey: `Aa0._:-${"k".repeat(57)}`,
        });
        expect(transport.calls).toHaveLength(1);
    });

    it("rejects a list limit over 100 before sending", async () => {
        const { transport, service } = serviceWith({});
        await expect(service.list({ limit: 101 })).rejects.toBeInstanceOf(ValidationError);
        expect(transport.calls).toHaveLength(0);
    });

    it.each([
        [Code.FailedPrecondition, ErrorCode.IDEMPOTENCY_KEY_REUSED, PreconditionFailedError],
        [Code.ResourceExhausted, ErrorCode.STATEMENT_EXPORT_LIMIT_REACHED, PreconditionFailedError],
        [Code.PermissionDenied, ErrorCode.PERMISSION_DENIED, PermissionError],
        [Code.NotFound, ErrorCode.NOT_FOUND, ResourceNotFoundError],
    ])("maps %s %s to its typed error with the ledger detail", async (code, ledgerCode, type) => {
        const error = new ConnectError("rejected", code, undefined, [
            { desc: ErrorDetailSchema, value: create(ErrorDetailSchema, { code: ledgerCode }) },
        ]);
        const service = new StatementExportsService({
            authApi: createErrorMappingTransport(rejectingUnaryTransport(error)),
        });
        const rejected = service.create(createInput);
        await expect(rejected).rejects.toBeInstanceOf(type);
        await expect(rejected).rejects.toMatchObject({
            retryable: false,
            detail: { service: "ledger", code: ErrorCode[ledgerCode] },
        });
    });
});
