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

Moderation reuses the existing Item service's row lock and matching synchronization. `CLAIM_PENDING`, `CLAIMED`, `RETURNED`, and already `CLOSED` items cannot be closed through this operation. Claim and Match rows are not modified. A close is audited as `ITEM_MODERATED_CLOSED` in the same transaction.

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
