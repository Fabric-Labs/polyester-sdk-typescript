import * as Proto from "../../gen/collab/v1/whiteboard_pb.js";

export const WHITEBOARD_AUDIENCE_VALUES = ["private", "public", "followers"] as const;
export type WhiteboardAudience = (typeof WHITEBOARD_AUDIENCE_VALUES)[number];

export const WHITEBOARD_WRITABLE_ROLE_VALUES = ["viewer", "editor"] as const;
export type WhiteboardWritableRole = (typeof WHITEBOARD_WRITABLE_ROLE_VALUES)[number];

export const WHITEBOARD_RESOLVED_ROLE_VALUES = ["none", "viewer", "editor", "owner"] as const;
export type WhiteboardResolvedRole = (typeof WHITEBOARD_RESOLVED_ROLE_VALUES)[number];

export const WHITEBOARD_ACL_SUBJECT_TYPE_VALUES = ["user", "group"] as const;
export type WhiteboardAclSubjectType = (typeof WHITEBOARD_ACL_SUBJECT_TYPE_VALUES)[number];

export const WhiteboardAudienceCodec = {
    inputToProto: {
        private: Proto.BoardAudience.PRIVATE,
        public: Proto.BoardAudience.PUBLIC,
        followers: Proto.BoardAudience.FOLLOWERS,
    } satisfies Record<WhiteboardAudience, Proto.BoardAudience>,
    protoToOutput: {
        [Proto.BoardAudience.PRIVATE]: "private",
        [Proto.BoardAudience.PUBLIC]: "public",
        [Proto.BoardAudience.FOLLOWERS]: "followers",
    } as Record<number, WhiteboardAudience | undefined>,
} as const;

export const WhiteboardRoleCodec = {
    inputToProto: {
        viewer: Proto.BoardRole.VIEWER,
        editor: Proto.BoardRole.EDITOR,
    } satisfies Record<WhiteboardWritableRole, Proto.BoardRole>,
    protoToOutput: {
        [Proto.BoardRole.ROLE_UNSPECIFIED]: "none",
        [Proto.BoardRole.VIEWER]: "viewer",
        [Proto.BoardRole.EDITOR]: "editor",
        [Proto.BoardRole.OWNER]: "owner",
    } as Record<number, WhiteboardResolvedRole | undefined>,
} as const;

export const WhiteboardAclSubjectTypeCodec = {
    inputToProto: {
        user: Proto.BoardAclSubjectType.USER_SUBJECT,
        group: Proto.BoardAclSubjectType.GROUP_SUBJECT,
    } satisfies Record<WhiteboardAclSubjectType, Proto.BoardAclSubjectType>,
    protoToOutput: {
        [Proto.BoardAclSubjectType.USER_SUBJECT]: "user",
        [Proto.BoardAclSubjectType.GROUP_SUBJECT]: "group",
    } as Record<number, WhiteboardAclSubjectType | undefined>,
} as const;
