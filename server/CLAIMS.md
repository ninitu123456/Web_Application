# Claim workflow

All Claim routes require a valid JWT for an active `USER` or `ADMIN` account. The
Claimant must use a `USER` account to submit a Claim. Authentication rejects
disabled accounts before route handling.

## Endpoints

| Method and path | Access | Behavior |
| --- | --- | --- |
| `POST /api/items/:id/claims` | Authenticated USER, except the Item owner | Create one Claim for a FOUND Item |
| `GET /api/claims/mine` | Authenticated USER or ADMIN | Return the current account's Claims and public Item details |
| `GET /api/items/:id/claims` | FOUND Item owner; ADMIN may inspect | Return Claims and private evidence for that Item |
| `PATCH /api/claims/:id/approve` | Related Item owner only | Approve one pending Claim and reject other pending Claims |
| `PATCH /api/claims/:id/reject` | Related Item owner only | Reject a pending Claim and reopen Item when no pending/approved Claim remains |
| `PATCH /api/claims/:id/complete` | Related Item owner only | Confirm handover and complete the Item return |

Creation accepts exactly this JSON body:

```json
{ "proofDescription": "Private evidence proving ownership" }
```

The description is trimmed and must not be empty. Clients cannot choose Claim
status. The unique `(claimant_id, item_id)` key prevents a claimant from
submitting again after rejection.

## State transitions

```text
Item OPEN -> CLAIM_PENDING when its first Claim is created
Claim PENDING -> APPROVED; competing PENDING Claims -> REJECTED
Claim PENDING -> REJECTED; Item -> OPEN if no PENDING or APPROVED Claims remain
Claim APPROVED -> COMPLETED and Item CLAIM_PENDING -> RETURNED
```

An Item accepts Claims while it is `OPEN` or `CLAIM_PENDING`, provided it is a
FOUND Item and has no APPROVED or COMPLETED Claim. Rejected Claims remain
historical and still prevent the same claimant from retrying. Unsupported and
repeat transitions return `409`.

## Privacy and transactions

Claim evidence is included only in `/api/claims/mine` for the Claimant and the
authorized received-Claims endpoint for the Item owner or inspecting ADMIN.
Public Item, Search, and Matching DTOs do not select or expose evidence. Claim
responses use `Cache-Control: no-store`. Activity log details contain Item IDs
and transition metadata only, never proof text or credentials.

Every write locks the Item row with `SELECT ... FOR UPDATE` inside a MySQL
transaction. Claim, Item, competing-Claim, and audit updates commit or roll back
together. The same Item lock serializes Claim creation with the existing Item
close/update paths and serializes competing approvals.
