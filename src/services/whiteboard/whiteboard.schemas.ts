import * as Proto from "../../gen/collab/v1/whiteboard_pb.js";
import * as v from "valibot";
import {
    JsonObjectSchema,
    OptionalTimestampMsSchema,
    PublicIdSchema,
} from "../../shared/schemas.js";
import { requiredEnumLabel } from "../../shared/proto-enum-codec.js";
import {
    WHITEBOARD_ACL_SUBJECT_TYPE_VALUES,
    WHITEBOARD_AUDIENCE_VALUES,
    WHITEBOARD_RESOLVED_ROLE_VALUES,
    WHITEBOARD_WRITABLE_ROLE_VALUES,
    WhiteboardAclSubjectTypeCodec,
    WhiteboardAudienceCodec,
    WhiteboardRoleCodec,
} from "./whiteboard.codecs.js";
import { idToBigInt } from "../../utils/base58-id.js";

function requiredRoleLabelFor(value: Proto.BoardRole) {
    return requiredEnumLabel(
        WhiteboardRoleCodec.protoToOutput,
        value,
        "WhiteboardRoleSchema",
        "role",
    );
}

const WhiteboardIdSchema = v.pipe(v.string(), v.trim(), v.minLength(1));
const WhiteboardTitleSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200));
const Uint64StringSchema = v.pipe(
    v.bigint(),
    v.transform((value) => value.toString()),
);

export const WhiteboardAudienceSchema = v.picklist(WHITEBOARD_AUDIENCE_VALUES);
export type WhiteboardAudience = v.InferOutput<typeof WhiteboardAudienceSchema>;

export const WhiteboardWritableRoleSchema = v.picklist(WHITEBOARD_WRITABLE_ROLE_VALUES);
export type WhiteboardWritableRole = v.InferOutput<typeof WhiteboardWritableRoleSchema>;

export const WhiteboardResolvedRoleSchema = v.picklist(WHITEBOARD_RESOLVED_ROLE_VALUES);
export type WhiteboardResolvedRole = v.InferOutput<typeof WhiteboardResolvedRoleSchema>;

export const WhiteboardAclSubjectTypeSchema = v.picklist(WHITEBOARD_ACL_SUBJECT_TYPE_VALUES);
export type WhiteboardAclSubjectType = v.InferOutput<typeof WhiteboardAclSubjectTypeSchema>;

export const WhiteboardSnapshotSchema = JsonObjectSchema;
export type WhiteboardSnapshot = v.InferOutput<typeof WhiteboardSnapshotSchema>;

const WhiteboardAudienceInputSchema = v.pipe(
    WhiteboardAudienceSchema,
    v.transform((value) => WhiteboardAudienceCodec.inputToProto[value]),
);

const WhiteboardRoleInputSchema = v.pipe(
    WhiteboardWritableRoleSchema,
    v.transform((value) => WhiteboardRoleCodec.inputToProto[value]),
);

const WhiteboardAclSubjectTypeInputSchema = v.pipe(
    WhiteboardAclSubjectTypeSchema,
    v.transform((value) => WhiteboardAclSubjectTypeCodec.inputToProto[value]),
);

export const WhiteboardAclEntryInputSchema = v.object({
    subjectType: WhiteboardAclSubjectTypeInputSchema,
    subjectId: v.pipe(
        v.string(),
        v.trim(),
        v.minLength(1),
        v.transform((value) => idToBigInt(value, "subjectId")),
    ),
    role: WhiteboardRoleInputSchema,
});

export type WhiteboardAclEntryInput = v.InferInput<typeof WhiteboardAclEntryInputSchema>;

const WhiteboardAclEntriesInputSchema = v.pipe(
    v.array(WhiteboardAclEntryInputSchema),
    v.maxLength(256),
    v.check((entries) => {
        const keys = entries.map((entry) => `${entry.subjectType}:${entry.subjectId.toString()}`);
        return new Set(keys).size === keys.length;
    }, "aclEntries must not contain duplicate subjects"),
);

export const CreateWhiteboardBoardInputSchema = v.object({
    title: WhiteboardTitleSchema,
    audience: WhiteboardAudienceInputSchema,
    defaultRole: WhiteboardRoleInputSchema,
    aclEntries: v.optional(WhiteboardAclEntriesInputSchema, []),
    initialSnapshot: v.optional(WhiteboardSnapshotSchema),
});

export type CreateWhiteboardBoardInput = v.InferInput<typeof CreateWhiteboardBoardInputSchema>;

export const GetWhiteboardBoardInputSchema = v.object({
    boardId: WhiteboardIdSchema,
});

export type GetWhiteboardBoardInput = v.InferInput<typeof GetWhiteboardBoardInputSchema>;

export const ListWhiteboardBoardsInputSchema = v.object({
    includeArchived: v.optional(v.boolean(), false),
});

export type ListWhiteboardBoardsInput = v.InferInput<typeof ListWhiteboardBoardsInputSchema>;

export const UpdateWhiteboardBoardInputSchema = v.pipe(
    v.object({
        boardId: WhiteboardIdSchema,
        title: v.optional(WhiteboardTitleSchema),
        audience: v.optional(WhiteboardAudienceInputSchema),
        defaultRole: v.optional(WhiteboardRoleInputSchema),
        initialSnapshot: v.optional(WhiteboardSnapshotSchema),
    }),
    v.check(
        (input) =>
            input.title !== undefined ||
            input.audience !== undefined ||
            input.defaultRole !== undefined ||
            input.initialSnapshot !== undefined,
        "At least one mutable board field is required",
    ),
);

export type UpdateWhiteboardBoardInput = v.InferInput<typeof UpdateWhiteboardBoardInputSchema>;

export const UpdateWhiteboardBoardAclInputSchema = v.object({
    boardId: WhiteboardIdSchema,
    aclEntries: WhiteboardAclEntriesInputSchema,
});

export type UpdateWhiteboardBoardAclInput = v.InferInput<
    typeof UpdateWhiteboardBoardAclInputSchema
>;

export const ArchiveWhiteboardBoardInputSchema = v.object({
    boardId: WhiteboardIdSchema,
    archived: v.boolean(),
});

export type ArchiveWhiteboardBoardInput = v.InferInput<typeof ArchiveWhiteboardBoardInputSchema>;

export const MintWhiteboardJoinTokenInputSchema = v.object({
    boardId: WhiteboardIdSchema,
});

export type MintWhiteboardJoinTokenInput = v.InferInput<typeof MintWhiteboardJoinTokenInputSchema>;

export const WhiteboardPermissionsSchema = v.object({
    canView: v.boolean(),
    canEdit: v.boolean(),
    canManage: v.boolean(),
});

export type WhiteboardPermissions = v.InferOutput<typeof WhiteboardPermissionsSchema>;

export const WhiteboardAccessSchema = v.object({
    role: v.pipe(v.enum(Proto.BoardRole), v.transform(requiredRoleLabelFor)),
    permissions: v.optional(WhiteboardPermissionsSchema),
});

export type WhiteboardAccess = v.InferOutput<typeof WhiteboardAccessSchema>;

export const WhiteboardAclEntrySchema = v.object({
    subjectType: v.pipe(
        v.enum(Proto.BoardAclSubjectType),
        v.transform((value) =>
            requiredEnumLabel(
                WhiteboardAclSubjectTypeCodec.protoToOutput,
                value,
                "WhiteboardAclSubjectTypeSchema",
                "subject type",
            ),
        ),
    ),
    subjectId: PublicIdSchema,
    role: v.pipe(v.enum(Proto.BoardRole), v.transform(requiredRoleLabelFor)),
});

export type WhiteboardAclEntry = v.InferOutput<typeof WhiteboardAclEntrySchema>;

export const WhiteboardBoardSchema = v.pipe(
    v.object({
        boardId: v.string(),
        ownerAccountId: PublicIdSchema,
        title: v.string(),
        audience: v.pipe(
            v.enum(Proto.BoardAudience),
            v.transform((value) =>
                requiredEnumLabel(
                    WhiteboardAudienceCodec.protoToOutput,
                    value,
                    "WhiteboardAudienceSchema",
                    "audience",
                ),
            ),
        ),
        defaultRole: v.pipe(v.enum(Proto.BoardRole), v.transform(requiredRoleLabelFor)),
        accessVersion: Uint64StringSchema,
        initialSnapshot: v.optional(WhiteboardSnapshotSchema),
        createdAt: OptionalTimestampMsSchema,
        updatedAt: OptionalTimestampMsSchema,
        archivedAt: OptionalTimestampMsSchema,
    }),
    v.transform(({ createdAt, updatedAt, archivedAt, ...board }) => ({
        ...board,
        createdAtMs: createdAt,
        updatedAtMs: updatedAt,
        archivedAtMs: archivedAt,
    })),
);

export type WhiteboardBoard = v.InferOutput<typeof WhiteboardBoardSchema>;

export const WhiteboardBoardListItemSchema = v.object({
    board: WhiteboardBoardSchema,
    access: v.optional(WhiteboardAccessSchema),
});

export type WhiteboardBoardListItem = v.InferOutput<typeof WhiteboardBoardListItemSchema>;

export const WhiteboardBoardDetailsSchema = v.object({
    board: WhiteboardBoardSchema,
    aclEntries: v.optional(v.array(WhiteboardAclEntrySchema), []),
    access: v.optional(WhiteboardAccessSchema),
});

export type WhiteboardBoardDetails = v.InferOutput<typeof WhiteboardBoardDetailsSchema>;

export const CreateWhiteboardBoardResultSchema = WhiteboardBoardDetailsSchema;
export type CreateWhiteboardBoardResult = v.InferOutput<typeof CreateWhiteboardBoardResultSchema>;

export const GetWhiteboardBoardResultSchema = WhiteboardBoardDetailsSchema;
export type GetWhiteboardBoardResult = v.InferOutput<typeof GetWhiteboardBoardResultSchema>;

export const UpdateWhiteboardBoardResultSchema = WhiteboardBoardDetailsSchema;
export type UpdateWhiteboardBoardResult = v.InferOutput<typeof UpdateWhiteboardBoardResultSchema>;

export const UpdateWhiteboardBoardAclResultSchema = WhiteboardBoardDetailsSchema;
export type UpdateWhiteboardBoardAclResult = v.InferOutput<
    typeof UpdateWhiteboardBoardAclResultSchema
>;

export const ListWhiteboardBoardsResultSchema = v.object({
    boards: v.optional(v.array(WhiteboardBoardListItemSchema), []),
});

export type ListWhiteboardBoardsResult = v.InferOutput<typeof ListWhiteboardBoardsResultSchema>;

export const ArchiveWhiteboardBoardResultSchema = v.object({
    board: v.optional(WhiteboardBoardSchema),
    access: v.optional(WhiteboardAccessSchema),
});

export type ArchiveWhiteboardBoardResult = v.InferOutput<typeof ArchiveWhiteboardBoardResultSchema>;

export const WhiteboardPresencePayloadSchema = v.object({
    accountId: PublicIdSchema,
    role: v.pipe(v.enum(Proto.BoardRole), v.transform(requiredRoleLabelFor)),
});

export type WhiteboardPresencePayload = v.InferOutput<typeof WhiteboardPresencePayloadSchema>;

export const WhiteboardJoinTokenResultSchema = v.pipe(
    v.object({
        boardId: v.string(),
        access: v.optional(WhiteboardAccessSchema),
        expiresAt: OptionalTimestampMsSchema,
        token: v.string(),
        roomId: v.string(),
        connectionId: v.string(),
        socketPath: v.string(),
        presence: v.optional(WhiteboardPresencePayloadSchema),
        accessVersion: Uint64StringSchema,
    }),
    v.transform(({ expiresAt, ...rest }) => ({
        ...rest,
        expiresAtMs: expiresAt,
    })),
);

export type WhiteboardJoinTokenResult = v.InferOutput<typeof WhiteboardJoinTokenResultSchema>;
