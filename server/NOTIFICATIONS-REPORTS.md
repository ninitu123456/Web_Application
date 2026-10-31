# Phase 5 — Notifications and Reports

All endpoints require a JWT for an active USER or ADMIN. Responses use
`Cache-Control: no-store`. Lists accept positive integer `page` (default 1) and
`limit` (default 10, maximum 100). Responses follow the existing envelope:
`{ success: true, data: [...], pagination: { page, limit, total, totalPages } }`.
Unknown input fields and invalid IDs/body/query parameters return 400.

## Notifications

| Method | Endpoint | Behavior |
| --- | --- | --- |
| GET | `/api/notifications` | Current account's notifications, newest first |
| GET | `/api/notifications/unread-count` | `{ success: true, data: { unreadCount: 3 } }` |
| PATCH | `/api/notifications/:id/read` | Mark an owned notification read; repeated calls return 200 |
| PATCH | `/api/notifications/read-all` | Mark the current account's existing notifications read |

Notification DTO: `id`, `type`, `message`, `isRead`, `createdAt` (UTC).
Another account's notification returns 403; a nonexistent ID returns 404.
USER and ADMIN have the same ownership restrictions; ADMIN cannot read another
user's notifications. Read-all is one scoped UPDATE; a later notification stays
unread. No API allows clients to create notifications or choose their recipients.

| Event type | Recipient |
| --- | --- |
| NEW_MATCH | Owners of LOST and FOUND Items, once if both belong to the same account |
| NEW_CLAIM | Owner of the FOUND Item |
| CLAIM_APPROVED | Approved claimant |
| CLAIM_REJECTED | Rejected claimant, including automatic competitor rejections |
| CLAIM_COMPLETED | Claimant whose handover completed |

Matching uses Phase 3's existing rounded-score persistence threshold (`>= 50`).
Notifications are emitted only for a newly inserted Match. Recompute, a score
drop and later recovery, or retries do not repeat the event. Historical events
are not backfilled. Messages contain event/resource IDs, never Claim evidence.

Event inserts share the caller's Match/Claim connection and transaction. Any
notification failure rolls back the related business updates, notifications and
audit. UNIQUE `(user_id, event_key)` prevents duplicates without resetting an
existing notification's message or read state. The internal event key is not
included in API DTOs. Only a duplicate of this specific UNIQUE key is ignored;
other database failures propagate to the global error handler.

## Reports

| Method | Endpoint | Access / input |
| --- | --- | --- |
| POST | `/api/reports` | USER/ADMIN; body below; returns 201 PENDING |
| GET | `/api/reports/mine` | Current account's Reports, paginated |
| GET | `/api/admin/reports` | ADMIN; optional `status`, `page`, `limit` |
| PATCH | `/api/admin/reports/:id` | ADMIN; body `{ "status": "REVIEWING" }`, `RESOLVED` or `DISMISSED` |

```json
{
  "targetType": "ITEM",
  "targetId": 12,
  "reason": "Thông tin không chính xác",
  "description": "Nội dung cần quản trị viên xem xét."
}
```

`targetType` is ITEM, USER or CLAIM; `targetId` is a positive safe JSON integer.
`reason` is trimmed, nonempty, maximum 50 Unicode characters. Optional description
must be a nonempty trimmed string, maximum 65,535 UTF-8 bytes. Clients cannot set
reporter/reviewer IDs, timestamps or initial status. A missing target returns 404.
For CLAIM targets, only its claimant, FOUND Item owner or ADMIN may report it;
unrelated accounts receive 403. ITEM/USER targets must exist. No additional
self-report prohibition is imposed.

Only one PENDING/REVIEWING Report per reporter and `(targetType, targetId)` may
exist; duplicate requests return 409, regardless of reason. RESOLVED/DISMISSED
Reports remain historical and do not prevent resubmission. A stored generated
key and UNIQUE constraint enforce this rule under concurrent requests.

```text
PENDING -> REVIEWING -> RESOLVED | DISMISSED
```

Reject means DISMISSED, not REJECTED. Skipping REVIEWING, repeating a transition
or reopening a terminal Report returns 409. ADMIN can continue another ADMIN's
review. Each transition locks the Report and updates status, reviewedBy,
reviewedAt and a REPORT_STATUS_CHANGED audit entry in one transaction. Audit
failure rolls everything back. Resolving/dismissing a Report does not itself
close Items, suspend accounts or change Claims.

Report DTO: `id`, `reporterId`, `targetType`, `targetId`, `reason`, `description`,
`status`, `reviewedBy`, `reviewedAt`, `createdAt`. DTOs do not join or expose Claim
proof, passwords or private Item identifiers. USER requests to ADMIN routes
return 403 before validation/processing; missing/invalid JWT returns 401.

## Schema and local testing

Migration 013 is append-only; 001–012 and their checksums stay unchanged. It adds
notification event uniqueness, active Report uniqueness and list/count indexes.
Each affected table uses one atomic MySQL 8 ALTER. A rerun accepts only the exact
before/after table definition. Unexpected schema stops migration; existing open
duplicate Reports stop before the ALTERs without deleting or merging data.
MySQL DDL has implicit commits; no all-migration rollback guarantee is made.

Use `npm.cmd test` and `npm.cmd run test:integration:isolated` with MYSQLD_PATH as
described in [database setup](../database/README.md). The isolated runner creates
its own datadir/port/credentials and verifies instance identity before writes.
It covers migration upgrade/recovery, notification SQL failure rollback and
Report concurrency. Do not run setup/migrations against production for testing.

Import `postman/FindIt-Phase5.postman_collection.json`. Set `baseUrl`, `userToken`,
`adminToken` and an existing `itemId`. Create Match/Claim activity first to obtain
notifications; the collection captures a notification ID from the list and a
Report ID from creation. Tokens are intentionally empty in the exported file.
The collection demonstrates both resolve and dismiss through REVIEWING.
