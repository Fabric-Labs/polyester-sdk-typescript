import { createClient, type Client, type Transport } from "@connectrpc/connect";
import type { JsonObject } from "@bufbuild/protobuf";
import * as Proto from "../../gen/collab/v1/whiteboard_pb.js";
import { removeUndefined } from "../../utils/remove-undefined.js";

export type WhiteboardBoard = Proto.Board;
export type WhiteboardBoardAccess = Proto.BoardAccess;
export type WhiteboardBoardAclEntry = Proto.BoardAclEntry;
export type WhiteboardBoardListItem = Proto.BoardListItem;
export type WhiteboardMintJoinTokenResponse = Proto.MintJoinTokenResponse;
export type WhiteboardPresencePayload = Proto.PresencePayload;

export interface CreateWhiteboardBoardInput {
	title: string;
	audience: Proto.BoardAudience;
	defaultRole: Proto.BoardRole;
	aclEntries?: Proto.BoardAclEntry[];
	initialSnapshot?: JsonObject;
}

export interface GetWhiteboardBoardInput {
	boardId: string;
}

export interface ListWhiteboardBoardsInput {
	includeArchived?: boolean;
}

export interface UpdateWhiteboardBoardInput {
	boardId: string;
	title?: string;
	audience?: Proto.BoardAudience;
	defaultRole?: Proto.BoardRole;
	initialSnapshot?: JsonObject;
}

export interface UpdateWhiteboardBoardAclInput {
	boardId: string;
	aclEntries: Proto.BoardAclEntry[];
}

export interface ArchiveWhiteboardBoardInput {
	boardId: string;
	archived: boolean;
}

export interface MintWhiteboardJoinTokenInput {
	boardId: string;
}

export class WhiteboardService {
	#client: Client<typeof Proto.WhiteboardService>;

	constructor(transport: Transport) {
		this.#client = createClient(Proto.WhiteboardService, transport);
	}

	async create(input: CreateWhiteboardBoardInput): Promise<Proto.CreateBoardResponse> {
		return await this.#client.createBoard({
			title: input.title,
			audience: input.audience,
			defaultRole: input.defaultRole,
			aclEntries: input.aclEntries ?? [],
			initialSnapshot: input.initialSnapshot,
		});
	}

	async get(input: GetWhiteboardBoardInput | string): Promise<Proto.GetBoardResponse> {
		const boardId = typeof input === "string" ? input : input.boardId;
		return await this.#client.getBoard({ boardId });
	}

	async list(input: ListWhiteboardBoardsInput = {}): Promise<Proto.ListBoardsResponse> {
		return await this.#client.listBoards({
			includeArchived: input.includeArchived ?? false,
		});
	}

	async update(input: UpdateWhiteboardBoardInput): Promise<Proto.UpdateBoardResponse> {
		return await this.#client.updateBoard(
			removeUndefined({ ...input }) as Proto.UpdateBoardRequest
		);
	}

	async updateAcl(input: UpdateWhiteboardBoardAclInput): Promise<Proto.UpdateBoardAclResponse> {
		return await this.#client.updateBoardAcl({
			boardId: input.boardId,
			aclEntries: input.aclEntries,
		});
	}

	async archive(input: ArchiveWhiteboardBoardInput): Promise<Proto.ArchiveBoardResponse> {
		return await this.#client.archiveBoard(input);
	}

	async mintJoinToken(
		input: MintWhiteboardJoinTokenInput | string
	): Promise<Proto.MintJoinTokenResponse> {
		const boardId = typeof input === "string" ? input : input.boardId;
		return await this.#client.mintJoinToken({ boardId });
	}
}
