import { defineService } from "../../core-client.js";
import { TradingWithdrawsService } from "./trading-withdraws.js";

/** Returns the client's TradingWithdrawsService, creating it on first use. */
export const tradingWithdrawsService = defineService(
    (context) =>
        new TradingWithdrawsService(
            context.transports,
            context.resolver,
            {
                chainId: context.environment.chain.id,
                tradingGatewayAddress: context.environment.contracts.tradingGatewayAddress,
            },
            context.scales,
            context.catalog,
        ),
);
