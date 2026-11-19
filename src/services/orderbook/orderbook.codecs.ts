/**
 * Depths for which the backend publishes `public:spot:orderbook:deltas:depth:{depth}:{symbolId}:proto`
 * channels. Narrower than the depth tiers the REST snapshot serves (`DEPTH_TIER_VALUES`):
 * subscribing to a depth outside this set succeeds and then never delivers a publication, so the book
 * silently stays empty.
 */
export const ORDERBOOK_WS_DEPTHS = [1, 20, 50, 200, 500] as const;

export type OrderbookWsDepth = (typeof ORDERBOOK_WS_DEPTHS)[number];

/**
 * Smallest published channel depth that covers `depth`, so a request for an unpublished depth rides a
 * deeper feed and is sliced back down locally instead of subscribing to a channel with no publisher.
 */
export function orderbookWsChannelDepth(depth: number): OrderbookWsDepth {
    for (const d of ORDERBOOK_WS_DEPTHS) if (d >= depth) return d;
    return 500;
}
