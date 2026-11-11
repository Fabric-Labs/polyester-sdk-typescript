---
"@polyester/sdk": patch
---

The API-key `recvWindow` docs now give the backend default of 5000 ms, down from 10000. The backend also refuses timestamps more than 1000 ms ahead of its clock, so keep the client clock synchronized. Signing is unchanged: HTTP requests never sent `X-API-NONCE`.
