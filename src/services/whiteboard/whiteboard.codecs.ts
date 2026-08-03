import * as Proto from "../../gen/collab/v1/whiteboard_pb.js";
import type { InputToProto, ProtoToOutput } from "../../utils/types.js";

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
    } satisfies InputToProto<WhiteboardAudience, Proto.BoardAudience>,
    protoToOutput: {
        [Proto.BoardAudience.AUDIENCE_UNSPECIFIED]: "unspecified",
        [Proto.BoardAudience.PRIVATE]: "private",
        [Proto.BoardAudience.PUBLIC]: "public",
        [Proto.BoardAudience.FOLLOWERS]: "followers",
    } satisfies ProtoToOutput<Proto.BoardAudience, WhiteboardAudience>,
} as const;

export const WhiteboardRoleCodec = {
    inputToProto: {
        viewer: Proto.BoardRole.VIEWER,
        editor: Proto.BoardRole.EDITOR,
    } satisfies InputToProto<WhiteboardWritableRole, Proto.BoardRole>,
    protoToOutput: {
        [Proto.BoardRole.ROLE_UNSPECIFIED]: "unspecified",
        [Proto.BoardRole.VIEWER]: "viewer",
        [Proto.BoardRole.EDITOR]: "editor",
        [Proto.BoardRole.OWNER]: "owner",
    } satisfies ProtoToOutput<Proto.BoardRole, WhiteboardResolvedRole>,
} as const;

export const WhiteboardAclSubjectTypeCodec = {
    inputToProto: {
        user: Proto.BoardAclSubjectType.USER_SUBJECT,
        group: Proto.BoardAclSubjectType.GROUP_SUBJECT,
    } satisfies InputToProto<WhiteboardAclSubjectType, Proto.BoardAclSubjectType>,
    protoToOutput: {
        [Proto.BoardAclSubjectType.SUBJECT_TYPE_UNSPECIFIED]: "unspecified",
        [Proto.BoardAclSubjectType.USER_SUBJECT]: "user",
        [Proto.BoardAclSubjectType.GROUP_SUBJECT]: "group",
    } satisfies ProtoToOutput<Proto.BoardAclSubjectType, WhiteboardAclSubjectType>,
} as const;
