---
"@polyester/sdk": minor
---

Breaking: activity events from `subaccounts.listEvents` and `accountActivity.list` drop `actorAccountId` and `payloadJson`. Read `actor` for who acted (its `kind`, base58 `accountId` and `username`; for an API key its `apiKeyId`, `apiKeyKind` and `apiKeyLabel`; for Polyester itself its `systemReason`), `item` for what the event affected, tagged by `type` (such as `{ type: "subaccount", id, name }`), and `details` for what it changed, tagged by `type`, with before and after values as `{ from, to }`. Events Polyester records by itself have the new `"system"` source.
