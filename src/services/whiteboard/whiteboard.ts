import { createClient, type Client, type Transport } from "@connectrpc/connect";
import * as Proto from "../../gen/collab/v1/whiteboard_pb.js";
import { removeUndefined } from "../../utils/remove-undefined.js";
import * as v from "valibot";
import {
    ArchiveWhiteboardBoardInputSchema,
    ArchiveWhiteboardBoardResultSchema,
    CreateWhiteboardBoardInputSchema,
    CreateWhiteboardBoardResultSchema,
    GetWhiteboardBoardInputSchema,
    GetWhiteboardBoardResultSchema,
    ListWhiteboardBoardsInputSchema,
    ListWhiteboardBoardsResultSchema,
    MintWhiteboardJoinTokenInputSchema,
    UpdateWhiteboardBoardAclInputSchema,
    UpdateWhiteboardBoardAclResultSchema,
    UpdateWhiteboardBoardInputSchema,
    UpdateWhiteboardBoardResultSchema,
    WhiteboardJoinTokenResultSchema,
    type ArchiveWhiteboardBoardInput,
    type ArchiveWhiteboardBoardResult,
    type CreateWhiteboardBoardInput,
    type CreateWhiteboardBoardResult,
    type GetWhiteboardBoardInput,
    type GetWhiteboardBoardResult,
    type ListWhiteboardBoardsInput,
    type ListWhiteboardBoardsResult,
    type MintWhiteboardJoinTokenInput,
    type UpdateWhiteboardBoardAclInput,
    type UpdateWhiteboardBoardAclResult,
    type UpdateWhiteboardBoardInput,
    type UpdateWhiteboardBoardResult,
    type WhiteboardJoinTokenResult,
} from "./whiteboard.schemas.js";

export class WhiteboardService {
    #client: Client<typeof Proto.WhiteboardService>;

    constructor(transport: Transport) {
        this.#client = createClient(Proto.WhiteboardService, transport);
    }

    async create(input: CreateWhiteboardBoardInput): Promise<CreateWhiteboardBoardResult> {
        const validatedInput = v.parse(CreateWhiteboardBoardInputSchema, input);
        const res = await this.#client.createBoard(validatedInput);
        return v.parse(CreateWhiteboardBoardResultSchema, res);
    }

    async get(input: GetWhiteboardBoardInput | string): Promise<GetWhiteboardBoardResult> {
        const validatedInput = v.parse(
            GetWhiteboardBoardInputSchema,
            typeof input === "string" ? { boardId: input } : input,
        );
        const res = await this.#client.getBoard(validatedInput);
        return v.parse(GetWhiteboardBoardResultSchema, res);
    }

    async list(input: ListWhiteboardBoardsInput = {}): Promise<ListWhiteboardBoardsResult> {
        const validatedInput = v.parse(ListWhiteboardBoardsInputSchema, input);
        const res = await this.#client.listBoards(validatedInput);
        return v.parse(ListWhiteboardBoardsResultSchema, res);
    }

    async update(input: UpdateWhiteboardBoardInput): Promise<UpdateWhiteboardBoardResult> {
        const validatedInput = v.parse(UpdateWhiteboardBoardInputSchema, input);
        const res = await this.#client.updateBoard(
            removeUndefined({ ...validatedInput }) as Proto.UpdateBoardRequest,
        );
        return v.parse(UpdateWhiteboardBoardResultSchema, res);
    }

    async updateAcl(input: UpdateWhiteboardBoardAclInput): Promise<UpdateWhiteboardBoardAclResult> {
        const validatedInput = v.parse(UpdateWhiteboardBoardAclInputSchema, input);
        const res = await this.#client.updateBoardAcl(validatedInput);
        return v.parse(UpdateWhiteboardBoardAclResultSchema, res);
    }

    async archive(input: ArchiveWhiteboardBoardInput): Promise<ArchiveWhiteboardBoardResult> {
        const validatedInput = v.parse(ArchiveWhiteboardBoardInputSchema, input);
        const res = await this.#client.archiveBoard(validatedInput);
        return v.parse(ArchiveWhiteboardBoardResultSchema, res);
    }

    async mintJoinToken(
        input: MintWhiteboardJoinTokenInput | string,
    ): Promise<WhiteboardJoinTokenResult> {
        const validatedInput = v.parse(
            MintWhiteboardJoinTokenInputSchema,
            typeof input === "string" ? { boardId: input } : input,
        );
        const res = await this.#client.mintJoinToken(validatedInput);
        return v.parse(WhiteboardJoinTokenResultSchema, res);
    }
}
