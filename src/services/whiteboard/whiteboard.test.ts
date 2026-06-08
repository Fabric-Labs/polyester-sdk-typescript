import type { Transport } from "@connectrpc/connect";
import { describe, expect, it, vi } from "vitest";
import * as v from "valibot";
import * as Proto from "../../gen/collab/v1/whiteboard_pb.js";
import { AUTH_STEP_UP_HEADER_NAME } from "../../shared/request-options.js";
import { formatId } from "../../utils/base58-id.js";
import { WhiteboardService } from "./whiteboard.js";
import {
    CreateWhiteboardBoardInputSchema,
    UpdateWhiteboardBoardAclInputSchema,
    UpdateWhiteboardBoardInputSchema,
    WhiteboardJoinTokenResultSchema,
} from "./whiteboard.schemas.js";

type CapturedCall = {
    message: Record<string, unknown>;
    signal: AbortSignal | undefined;
    headers: HeadersInit | undefined;
};

function transportWithMessages(
    messages: Record<string, unknown>[],
    calls: CapturedCall[] = [],
): Transport {
    return {
        unary: vi.fn(async (...args: unknown[]) => {
            calls.push({
                signal: args[1] as AbortSignal | undefined,
                headers: args[3] as HeadersInit | undefined,
                message: args[4] as Record<string, unknown>,
            });
            return {
                message: messages.shift() ?? {},
                header: new Headers(),
                trailer: new Headers(),
                stream: false,
                service: undefined,
                method: undefined,
            };
        }),
        stream: vi.fn(),
    } as unknown as Transport;
}

function board(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
    return {
        boardId: "board-1",
        ownerAccountId: 42n,
        title: "Roadmap",
        audience: Proto.BoardAudience.PUBLIC,
        defaultRole: Proto.BoardRole.EDITOR,
        accessVersion: 7n,
        initialSnapshot: { nodes: [] },
        createdAt: { seconds: 1n, nanos: 0 },
        updatedAt: { seconds: 2n, nanos: 0 },
        ...overrides,
    };
}

function aclEntry(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
    return {
        subjectType: Proto.BoardAclSubjectType.USER_SUBJECT,
        subjectId: 99n,
        role: Proto.BoardRole.VIEWER,
        ...overrides,
    };
}

function access(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
    return {
        role: Proto.BoardRole.OWNER,
        permissions: {
            canView: true,
            canEdit: true,
            canManage: true,
        },
        ...overrides,
    };
}

function boardDetails(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
    return {
        board: board(),
        aclEntries: [aclEntry()],
        access: access(),
        ...overrides,
    };
}

function joinToken(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
    return {
        boardId: "board-1",
        access: access({ role: Proto.BoardRole.EDITOR }),
        expiresAt: { seconds: 5n, nanos: 0 },
        token: "token-1",
        roomId: "board-1",
        connectionId: "conn-1",
        socketPath: "/rooms/board-1",
        presence: {
            accountId: 42n,
            role: Proto.BoardRole.EDITOR,
        },
        accessVersion: 8n,
        ...overrides,
    };
}

function stepUpHeader(call: CapturedCall | undefined): string | null {
    return new Headers(call?.headers).get(AUTH_STEP_UP_HEADER_NAME);
}

describe("WhiteboardService", () => {
    it("normalizes create payloads and parses board details", async () => {
        const calls: CapturedCall[] = [];
        const signal = new AbortController().signal;
        const service = new WhiteboardService(transportWithMessages([boardDetails()], calls));

        await expect(
            service.create(
                {
                    title: " Roadmap ",
                    audience: "public",
                    defaultRole: "viewer",
                    aclEntries: [
                        {
                            subjectType: "user",
                            subjectId: " 99 ",
                            role: "editor",
                        },
                    ],
                    initialSnapshot: { nodes: [] },
                },
                { signal, stepUpToken: " fresh-token " },
            ),
        ).resolves.toMatchObject({
            board: {
                boardId: "board-1",
                ownerAccountId: formatId(42n),
                title: "Roadmap",
                audience: "public",
                defaultRole: "editor",
                accessVersion: "7",
                createdAtMs: 1000,
                updatedAtMs: 2000,
            },
            aclEntries: [
                {
                    subjectType: "user",
                    subjectId: formatId(99n),
                    role: "viewer",
                },
            ],
            access: {
                role: "owner",
                permissions: {
                    canView: true,
                    canEdit: true,
                    canManage: true,
                },
            },
        });

        expect(calls[0]?.message).toMatchObject({
            title: "Roadmap",
            audience: Proto.BoardAudience.PUBLIC,
            defaultRole: Proto.BoardRole.VIEWER,
            aclEntries: [
                {
                    subjectType: Proto.BoardAclSubjectType.USER_SUBJECT,
                    subjectId: 99n,
                    role: Proto.BoardRole.EDITOR,
                },
            ],
            initialSnapshot: { nodes: [] },
        });
        expect(calls[0]?.message).not.toHaveProperty("stepUpToken");
        expect(calls[0]?.signal).toBe(signal);
        expect(stepUpHeader(calls[0])).toBe("fresh-token");
    });

    it("normalizes get and list inputs and preserves empty list responses", async () => {
        const calls: CapturedCall[] = [];
        const signal = new AbortController().signal;
        const service = new WhiteboardService(
            transportWithMessages(
                [boardDetails(), {}, { boards: [{ board: board(), access: access() }] }],
                calls,
            ),
        );

        await expect(service.get(" board-1 ", { signal })).resolves.toMatchObject({
            board: {
                boardId: "board-1",
            },
        });
        await expect(service.list()).resolves.toEqual({ boards: [] });
        await expect(service.list({ includeArchived: true }, { signal })).resolves.toMatchObject({
            boards: [
                {
                    board: {
                        boardId: "board-1",
                    },
                    access: {
                        role: "owner",
                    },
                },
            ],
        });

        expect(calls[0]?.message).toEqual({ boardId: "board-1" });
        expect(calls[0]?.signal).toBe(signal);
        expect(calls[1]?.message).toEqual({ includeArchived: false });
        expect(calls[2]?.message).toEqual({ includeArchived: true });
        expect(calls[2]?.signal).toBe(signal);
    });

    it("normalizes update and ACL replacement requests", async () => {
        const calls: CapturedCall[] = [];
        const service = new WhiteboardService(
            transportWithMessages([boardDetails(), boardDetails()], calls),
        );

        await service.update(
            {
                boardId: " board-1 ",
                title: " New title ",
                audience: "private",
            },
            { stepUpToken: " update-token " },
        );
        await service.updateAcl(
            {
                boardId: " board-1 ",
                aclEntries: [
                    {
                        subjectType: "group",
                        subjectId: "123",
                        role: "viewer",
                    },
                ],
            },
            { stepUpToken: " acl-token " },
        );

        expect(calls[0]?.message).toMatchObject({
            boardId: "board-1",
            title: "New title",
            audience: Proto.BoardAudience.PRIVATE,
        });
        expect(calls[0]?.message).not.toHaveProperty("defaultRole");
        expect(calls[0]?.message).not.toHaveProperty("initialSnapshot");
        expect(stepUpHeader(calls[0])).toBe("update-token");
        expect(calls[1]?.message).toMatchObject({
            boardId: "board-1",
            aclEntries: [
                {
                    subjectType: Proto.BoardAclSubjectType.GROUP_SUBJECT,
                    subjectId: 123n,
                    role: Proto.BoardRole.VIEWER,
                },
            ],
        });
        expect(stepUpHeader(calls[1])).toBe("acl-token");
    });

    it("normalizes archive and mint join token requests", async () => {
        const calls: CapturedCall[] = [];
        const service = new WhiteboardService(transportWithMessages([{}, joinToken()], calls));

        const archiveResult = await service.archive(
            { boardId: " board-1 ", archived: false },
            { stepUpToken: " archive-token " },
        );
        await expect(
            service.mintJoinToken(" board-1 ", { stepUpToken: " mint-token " }),
        ).resolves.toMatchObject({
            boardId: "board-1",
            access: {
                role: "editor",
            },
            expiresAtMs: 5000,
            token: "token-1",
            roomId: "board-1",
            connectionId: "conn-1",
            socketPath: "/rooms/board-1",
            presence: {
                accountId: formatId(42n),
                role: "editor",
            },
            accessVersion: "8",
        });

        expect(archiveResult.board).toBeUndefined();
        expect(calls[0]?.message).toEqual({ boardId: "board-1", archived: false });
        expect(stepUpHeader(calls[0])).toBe("archive-token");
        expect(calls[1]?.message).toEqual({ boardId: "board-1" });
        expect(stepUpHeader(calls[1])).toBe("mint-token");
    });

    it("rejects invalid inputs and malformed backend responses before exposing them", async () => {
        const calls: CapturedCall[] = [];
        const service = new WhiteboardService(
            transportWithMessages(
                [
                    boardDetails({
                        board: board({ audience: Proto.BoardAudience.AUDIENCE_UNSPECIFIED }),
                    }),
                    { aclEntries: [] },
                ],
                calls,
            ),
        );

        await expect(
            service.update({ boardId: "board-1" } as Parameters<WhiteboardService["update"]>[0]),
        ).rejects.toThrow("At least one mutable board field is required");
        await expect(
            service.updateAcl({
                boardId: "board-1",
                aclEntries: [
                    { subjectType: "user", subjectId: "1", role: "viewer" },
                    { subjectType: "user", subjectId: "1", role: "editor" },
                ],
            }),
        ).rejects.toThrow("aclEntries must not contain duplicate subjects");
        expect(calls).toHaveLength(0);

        await expect(service.get("board-1")).rejects.toThrow("invalid audience 0");
        await expect(service.get("board-1")).rejects.toThrow();
    });
});

describe("whiteboard schemas", () => {
    it("maps input enums, rejects invalid mutations, and parses join tokens", () => {
        expect(
            v.parse(CreateWhiteboardBoardInputSchema, {
                title: " Roadmap ",
                audience: "followers",
                defaultRole: "editor",
                aclEntries: [{ subjectType: "group", subjectId: "4", role: "viewer" }],
            }),
        ).toMatchObject({
            title: "Roadmap",
            audience: Proto.BoardAudience.FOLLOWERS,
            defaultRole: Proto.BoardRole.EDITOR,
            aclEntries: [
                {
                    subjectType: Proto.BoardAclSubjectType.GROUP_SUBJECT,
                    subjectId: 4n,
                    role: Proto.BoardRole.VIEWER,
                },
            ],
        });

        expect(() => v.parse(UpdateWhiteboardBoardInputSchema, { boardId: "board-1" })).toThrow(
            "At least one mutable board field is required",
        );
        expect(() =>
            v.parse(UpdateWhiteboardBoardAclInputSchema, {
                boardId: "board-1",
                aclEntries: [
                    { subjectType: "user", subjectId: "1", role: "viewer" },
                    { subjectType: "user", subjectId: "1", role: "editor" },
                ],
            }),
        ).toThrow("aclEntries must not contain duplicate subjects");

        expect(v.parse(WhiteboardJoinTokenResultSchema, joinToken())).toMatchObject({
            accessVersion: "8",
            expiresAtMs: 5000,
            presence: {
                accountId: formatId(42n),
                role: "editor",
            },
        });
        expect(() =>
            v.parse(
                WhiteboardJoinTokenResultSchema,
                joinToken({
                    presence: {
                        accountId: 42n,
                        role: Proto.BoardRole.ROLE_UNSPECIFIED,
                    },
                }),
            ),
        ).toThrow("invalid role 0");
    });
});
