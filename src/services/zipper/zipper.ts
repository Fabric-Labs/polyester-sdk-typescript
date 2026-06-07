import * as Proto from "../../gen/chain/zipper/v1/zipper_pb.js";
import { createClient, type Client, type Transport } from "@connectrpc/connect";
import { DepositWithdrawConfigSchema, type DepositWithdrawConfig } from "./zipper.schemas.js";
import * as v from "valibot";
import {
    toConnectCallOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";

export class ZipperService {
    #client: Client<typeof Proto.ZipperService>;

    constructor(transport: Transport) {
        this.#client = createClient(Proto.ZipperService, transport);
    }

    async getDepositWithdrawConfig(
        options?: PolyesterRequestOptions,
    ): Promise<DepositWithdrawConfig> {
        const res = await this.#client.getDepositWithdrawConfig({}, toConnectCallOptions(options));
        return v.parse(DepositWithdrawConfigSchema, res);
    }
}
