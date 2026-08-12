import { createClient, type Client, type Transport } from "@connectrpc/connect";
import * as Proto from "../../gen/collab/v1/whiteboard_pb.js";
import { removeUndefined } from "../../utils/remove-undefined.js";
import * as v from "../../shared/validation.js";
import {
    toConnectCallOptions,
    type PolyesterMutationOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
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

/**
 * Manages collaborative whiteboards, ACLs, archive state, and join tokens.
 */
export class WhiteboardService {
    #client: Client<typeof Proto.WhiteboardService>;

    constructor(transport: Transport) {
        this.#client = createClient(Proto.WhiteboardService, transport);
    }

    /**
     * Creates a whiteboard and returns the parsed whiteboard record.
     */
    async create(
        input: CreateWhiteboardBoardInput,
        options?: PolyesterMutationOptions,
    ): Promise<CreateWhiteboardBoardResult> {
        const validatedInput = v.parse(CreateWhiteboardBoardInputSchema, input);
        const res = await this.#client.createBoard(validatedInput, toConnectCallOptions(options));
        return v.parse(CreateWhiteboardBoardResultSchema, res);
    }

    /**
     * Fetches a whiteboard by id and returns null when no whiteboard is present in the response.
     */
    async get(
        input: GetWhiteboardBoardInput | string,
        options?: PolyesterRequestOptions,
    ): Promise<GetWhiteboardBoardResult> {
        const validatedInput = v.parse(
            GetWhiteboardBoardInputSchema,
            typeof input === "string" ? { boardId: input } : input,
        );
        const res = await this.#client.getBoard(validatedInput, toConnectCallOptions(options));
        return v.parse(GetWhiteboardBoardResultSchema, res);
    }

    /**
     * Returns whiteboards matching the requested filters.
     */
    async list(
        input: ListWhiteboardBoardsInput = {},
        options?: PolyesterRequestOptions,
    ): Promise<ListWhiteboardBoardsResult> {
        const validatedInput = v.parse(ListWhiteboardBoardsInputSchema, input);
        const res = await this.#client.listBoards(validatedInput, toConnectCallOptions(options));
        return v.parse(ListWhiteboardBoardsResultSchema, res);
    }

    /**
     * Updates whiteboard metadata such as title or archive-related fields.
     */
    async update(
        input: UpdateWhiteboardBoardInput,
        options?: PolyesterMutationOptions,
    ): Promise<UpdateWhiteboardBoardResult> {
        const validatedInput = v.parse(UpdateWhiteboardBoardInputSchema, input);
        const res = await this.#client.updateBoard(
            removeUndefined({ ...validatedInput }) as Proto.UpdateBoardRequest,
            toConnectCallOptions(options),
        );
        return v.parse(UpdateWhiteboardBoardResultSchema, res);
    }

    /**
     * Updates whiteboard access-control entries.
     */
    async updateAcl(
        input: UpdateWhiteboardBoardAclInput,
        options?: PolyesterMutationOptions,
    ): Promise<UpdateWhiteboardBoardAclResult> {
        const validatedInput = v.parse(UpdateWhiteboardBoardAclInputSchema, input);
        const res = await this.#client.updateBoardAcl(
            validatedInput,
            toConnectCallOptions(options),
        );
        return v.parse(UpdateWhiteboardBoardAclResultSchema, res);
    }

    /**
     * Archives a whiteboard by id.
     */
    async archive(
        input: ArchiveWhiteboardBoardInput,
        options?: PolyesterMutationOptions,
    ): Promise<ArchiveWhiteboardBoardResult> {
        const validatedInput = v.parse(ArchiveWhiteboardBoardInputSchema, input);
        const res = await this.#client.archiveBoard(validatedInput, toConnectCallOptions(options));
        return v.parse(ArchiveWhiteboardBoardResultSchema, res);
    }

    /**
     * Creates a join token that can grant access to a whiteboard.
     */
    async mintJoinToken(
        input: MintWhiteboardJoinTokenInput | string,
        options?: PolyesterMutationOptions,
    ): Promise<WhiteboardJoinTokenResult> {
        const validatedInput = v.parse(
            MintWhiteboardJoinTokenInputSchema,
            typeof input === "string" ? { boardId: input } : input,
        );
        const res = await this.#client.mintJoinToken(validatedInput, toConnectCallOptions(options));
        return v.parse(WhiteboardJoinTokenResultSchema, res);
    }
}
