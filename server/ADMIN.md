# FindIt Admin APIs – Phase 6

All `/api/admin/...` routes require a valid JWT for an active account with role `ADMIN`. Missing or invalid authentication returns 401; an authenticated `USER` receives 403. Responses use `{ success: true, data: ... }`; paginated endpoints also return `pagination` with `page`, `limit`, `total`, and `totalPages`. Lists default to page 1 and limit 10, with a maximum limit of 100. Unknown query/body fields, malformed IDs, unsupported enums, and unsafe offsets return 400. Admin responses set `Cache-Control: no-store`.

## Dashboard

| Method | Endpoint | Behavior |
| --- | --- | --- |
| GET | `/api/admin/dashboard` | Aggregate users, items, claims, matches, reports, item/claim/report statuses, top 20 item categories, and daily activity for the last 30 days |

Counters are SQL aggregates. Empty status buckets return zero. `users` includes `total`, `active`, and `suspended`; `items` includes `total`, `lost`, `found`, `returned`, and `byStatus`; `claims` and `reports` include `total` and `byStatus`; `matches` includes `total`. Recent activity rows have `date` and `count`.

## Users

| Method | Endpoint | Behavior |
| --- | --- | --- |
| GET | `/api/admin/users?page=1&limit=10&accountStatus=ACTIVE&role=USER` | Paginated list; optional filters are `accountStatus` (`ACTIVE`, `SUSPENDED`) and role (`USER`, `ADMIN`) |
| GET | `/api/admin/users/:id` | Safe admin detail |
| PATCH | `/api/admin/users/:id/status` | Body `{ "status": "ACTIVE" }` or `{ "status": "SUSPENDED" }` |

The user DTO contains `id`, `fullName`, `email`, `role`, `accountStatus`, `createdAt`, and `updatedAt`. It never contains password hashes, contact details, tokens, or arbitrary database fields. Roles cannot be changed. An administrator cannot suspend their own account. Status changes are audited as `USER_STATUS_CHANGED` in the same transaction.

## Items

| Method | Endpoint | Behavior |
| --- | --- | --- |
| GET | `/api/admin/items?page=1&limit=10&type=FOUND&status=OPEN` | Paginated item inspection; filters use existing Item types/states |
| GET | `/api/admin/items/:id` | Item detail using the existing safe Item DTO |
| PATCH | `/api/admin/items/:id/status` | Body `{ "status": "CLOSED" }`; only an `OPEN` item can be closed |

This supported legacy `/status` operation reuses the existing Item service's row lock and matching synchronization. `CLAIM_PENDING`, `CLAIMED`, `RETURNED`, and already `CLOSED` items cannot be closed through this operation (400). Claim and Match rows are not modified. A close is audited as `ITEM_MODERATED_CLOSED` in the same transaction; historical/legacy logs have no fabricated reason. No removal date is scheduled. `/api/items/:id/close` also keeps its existing OPEN-only behavior and response.

## Canonical moderation and disputes

| Method | Endpoint | Input / result |
| --- | --- | --- |
| GET | `/api/admin/claims` | Optional `status=PENDING\|APPROVED\|REJECTED\|COMPLETED`, `itemId`, `claimantId`, `page`, `limit`, `sort=newest\|oldest` |
| PATCH | `/api/admin/claims/:id/resolve` | `{ "decision": "APPROVE" or "REJECT", "reason": "..." }`; data: `{ claim: ClaimSummary, item: { id, status }, autoRejectedClaimCount }` |
| GET | `/api/admin/activity-logs` | Optional `action`, `entityType`, `entityId`, `actorId`, `dateFrom`, `dateTo`, `page`, `limit`, `sort=newest\|oldest` |
| PATCH | `/api/admin/items/:id/close` | `{ "reason": "..." }`; data: `{ item: ItemDto, rejectedClaimCount }` |

All four APIs check ACTIVE ADMIN both in middleware and inside the service transaction. Authorization precedes schema validation. IDs are positive safe integers; unknown fields are rejected. Reasons are trimmed, 1–1,000 Unicode code points and at most 4,000 UTF-8 bytes. Lists default to newest; ordering breaks timestamp ties with the record ID. Empty lists return 200 with `data: []` and top-level pagination. UTC dates use real `YYYY-MM-DD` calendar dates (years 1000–9999), inclusive through 23:59:59 on `dateTo`; reversed date ranges return 400.

ClaimSummary contains only `id`, `itemId`, `claimantId`, `status`, `submittedAt`, `reviewedAt`, `completedAt`. List entries add `item: { id, userId, title, type, status }`. Evidence, email, student identifiers and contacts are neither selected nor returned. Authorized evidence inspection continues through `/api/items/:id/claims`.

Resolve accepts only PENDING Claims on consistent FOUND/CLAIM_PENDING Items. APPROVE sets the selected Claim APPROVED, Item CLAIMED and all competing PENDING Claims REJECTED. REJECT keeps CLAIM_PENDING while another pending Claim exists, otherwise reopens OPEN. It preserves uniqueness and never completes handover. APPROVED, REJECTED and COMPLETED cannot be reversed; resolve returns 409. Owner approve/reject/complete still require ownership; ADMIN privilege does not bypass these endpoints.

Canonical close supports OPEN without active Claims and FOUND/CLAIM_PENDING with pending Claims. It rejects all PENDING Claims, sets reviewed timestamps and closes the Item in one transaction. Historical rejected Claims, evidence, Match rows and Reports remain intact. Inconsistent states, active winners, CLAIMED, RETURNED, CLOSED and repeated decisions return 409. Missing Item/Claim returns 404; invalid input returns 400. ADMIN who owns the Item or has any Claim on it receives 403 for either privileged mutation, including OPEN close; another ADMIN must handle it. Ordinary owner permissions remain available.

Every decision, each actual Claim transition, Item update and notification commits or rolls back together on one scoped connection. Child audit entries link to the decision log ID. Reason is stored only in the decision audit and can be read by ADMIN; it is absent from public DTOs and notifications. Free text can contain PII entered by an ADMIN. Report creation is not required and Report status is never automatically changed. No functional migration is required: existing states, audit JSON and notification VARCHAR/event keys suffice.

**CLOSED does not hide or remove public content.** Public detail remains readable and unfiltered search can include CLOSED Items. Visibility/moderation takedown and disputes after approval or handover require a separate design.

## Business activity log

Log DTO: `id`, nullable `actorId`, `action`, `entityType`, nullable `entityId`, `createdAt`, `details`. Entity types: ITEM, CLAIM, USER, CATEGORY, LOCATION, REPORT. Actions: ITEM_MODERATED_CLOSED, CLAIM_ADMIN_RESOLVED, CLAIM_APPROVED, CLAIM_REJECTED, CLAIM_COMPLETED, USER_STATUS_CHANGED, REPORT_STATUS_CHANGED, CATEGORY_CREATED/UPDATED/DISABLED and LOCATION_CREATED/UPDATED/DISABLED. Other actions, including IMAGE_OPERATION_* and IMAGE_CLEANUP_*, are excluded before both counting and pagination.

Details are mapped per action: valid previous/current statuses, Item/decision log IDs, automatic flag, approved operation source, decision, reason and affected counts where applicable. Lookup events currently expose empty details. Raw JSON, proof, credentials, Cloudinary public IDs, operation/event keys and cleanup cursors are never returned. Legacy missing/null reason remains absent. Reads create no logs or notifications.

## Lock ordering and regression

Before adding moderation, all related paths were compared: Matching Item create/update/close acquires its advisory lock before BEGIN; owner Claim operations lock Item then Claims; image writes and per-operation cleanup lock Item without waiting for Matching; cleanup cursor transactions are separate; lookup administration locks only the lookup; report administration locks only the Report. F07 status writers take the ADMIN role exclusively before locking users in ID order.

Canonical close preserves Matching advisory lock before BEGIN, then shares the ADMIN role lock, shares the current actor row, locks Item and then all Claims in ascending claim ID. Resolve and list APIs take role/actor locks without the Matching lock. Notifications use recipient ID order over the complete batch. FK user locks are shared and compatible with the actor lock. F07 cannot acquire its exclusive role lock until moderation commits; suspension committed first makes moderation return 403. No path holds role/user while waiting for Matching. Close leaves Matching history untouched; existing status filters exclude CLOSED.

`admin-moderation.integration.js` covers failure injection in Item/Claim/decision and child audit/notification writes, 120-Claim batches, real HTTP/JWT privacy, terminal and inconsistent states, recusal, stale actors, and repeated races with barriers and observed InnoDB waits. Existing F01/F02/F03/F06/F07 suites remain unchanged. Transaction deadlines, destroy/release handling and COMMIT-unknown no-replay behavior use existing helpers; after an uncertain commit, read state before deciding on a new request.

## Categories and locations

| Method | Endpoint | Behavior |
| --- | --- | --- |
| GET | `/api/admin/categories` or `/api/admin/locations` | List all records, including inactive records |
| POST | `/api/admin/categories` or `/api/admin/locations` | Create with body `{ "name": "..." }` |
| PATCH | `/api/admin/categories/:id` or `/api/admin/locations/:id` | Update with `{ "name": "..." }`, `{ "isActive": false }`, or both |
| DELETE | `/api/admin/categories/:id` or `/api/admin/locations/:id` | Set `is_active` false; historical Item references remain intact |

Names are trimmed and limited to the existing database column length (100 characters for categories, 150 for locations). Names must be unique under the database collation; duplicates return 409. Lookup DTOs contain only `id`, `name`, and `isActive`. Mutations and audit entries are transactional. Audit actions are `CATEGORY_CREATED`, `CATEGORY_UPDATED`, `CATEGORY_DISABLED`, and corresponding `LOCATION_*` actions.

## Reports

| Method | Endpoint | Behavior |
| --- | --- | --- |
| GET | `/api/admin/reports?page=1&limit=10&status=PENDING` | Existing admin report list; optional status is `PENDING`, `REVIEWING`, `RESOLVED`, or `DISMISSED` |
| GET | `/api/admin/reports/:id` | Admin report detail |
| PATCH | `/api/admin/reports/:id` | Existing status workflow: `PENDING → REVIEWING → RESOLVED` or `DISMISSED` |

Report content is admin-only, except users can read their own reports through the existing `/api/reports/mine` route. Report DTOs do not include Claim proof/evidence. Processing locks the report, validates the current state, and writes its status and audit record atomically as `REPORT_STATUS_CHANGED`. Terminal/repeated transitions return 409.
