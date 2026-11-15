---
"@polyester/sdk": patch
---

`addressBook.listTransferCounterparties` and the recent destinations in `addressBook.getView` return an empty `addressBookEntryId` for unsaved rows instead of `"1"`, the public ID of entry 0.
