---
"@polyester/sdk": patch
---

Attached take-profit, stop-loss and trailing stop exits never trade with the order they protect. Order `cancelReason` adds `attached_exit_fired`: the exit fired while the order still rested, so its unfilled remainder was canceled first. Fills before the cancel stand. Trigger failure reasons add `self_trade_prevented`, reported only as a `"fire_refused"` event's `fireRefusalReason`: self-trade prevention expired the exit's order against another of the account's resting orders, and the trigger stays live and fires again. That event's `childSeq` names the expired child order.
