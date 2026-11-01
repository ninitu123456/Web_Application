# Phase 6 – Admin APIs: Task Decomposition

Repository inspection confirms an Express 5 / ESM backend organized as routes → controllers → services → repositories, using strict Zod validation, dependency injection, MySQL transactions, safe DTOs, and `node:test`. The existing database already has all required tables. Supported values are user `account_status` (currently `ACTIVE` by default; inspect live written values before finalizing transitions), item `OPEN`, `CLAIM_PENDING`, `CLAIMED`, `RETURNED`, `CLOSED`, and report `PENDING`, `REVIEWING`, `RESOLVED`, `DISMISSED`. Categories and locations use `is_active` and unique names. Existing item and claim workflows lock Item rows and preserve match/claim invariants. The existing `/api/admin/reports` route provides list and status update; Phase 6 will extend it with detail and reporting as needed without replacing Phase 5 behavior.

Each subtask follows **implement → verify → checkpoint**. A checkpoint means inspect the focused diff and record verification before moving on; no Git commit or push will be made.

## 6.1 Dashboard statistics
- Add admin-only aggregate endpoint with stable counters for users, items, LOST/FOUND, RETURNED items, claims, matches, reports, and practical status/category breakdowns.
- Use bounded aggregate SQL, safe integer conversion, and zero-filled stable keys.
- Verify service/repository behavior and HTTP authorization/contract; checkpoint focused diff.

## 6.2 User administration
- Add paginated filtered admin list and safe detail DTOs; support only existing account statuses and no role mutation.
- Add transactional status update and audit log, preserving the ADMIN role and preventing self-demotion/lockout if appropriate to existing auth policy.
- Verify strict ID/query/body validation, pagination, DTO safety, status rules, audit behavior, and admin authorization; checkpoint.

## 6.3 Item moderation
- Add paginated/filterable admin inspection/list/detail and a moderation status operation restricted to transitions that preserve existing Claim and Item invariants.
- Reuse existing item transaction/matching facilities where safe; lock Item rows and atomically audit meaningful changes. Do not mutate claims or matches outside established workflows.
- Verify allowed/invalid transitions, claim-related protections, rollback, DTO safety, and authorization; checkpoint.

## 6.4 Category management
- Add admin list/create/update/deactivate APIs using `is_active`, unique names, FK-safe behavior, strict payloads, and transactional audit records.
- Verify duplicate, validation, foreign-key preservation, response DTOs, and audit rollback; checkpoint.

## 6.5 Location management
- Add admin list/create/update/deactivate APIs using `is_active`, unique names, FK-safe behavior, strict payloads, and transactional audit records.
- Verify duplicate, validation, foreign-key preservation, response DTOs, and audit rollback; checkpoint.

## 6.6 Report moderation integration
- Preserve Phase 5 report status machine and transaction/audit conventions; add admin detail, and any necessary query filters, without exposing claim evidence.
- Verify list/detail/status transitions, terminal/repeated rejection, audit rollback, and USER/unauthenticated denial; checkpoint.

## 6.7 Admin authorization and validation hardening
- Mount admin resources behind shared existing authentication and `authorizeRoles('ADMIN')`; validate route IDs, strict query/body schemas, enums, and safe offsets.
- Verify unauthenticated → 401, USER → 403, ADMIN → allowed for the admin surface; checkpoint.

## 6.8 Unit/backend tests
- Add focused `node:test` tests for admin validation, DTOs, services, and HTTP authorization/contracts.
- Run focused tests and record results; checkpoint.

## 6.9 Isolated MySQL integration tests
- Extend the existing `FINDIT_ISOLATED_DATADIR`-guarded suite and `database/scripts/test-isolated.js --all` runner for real HTTP/JWT/MySQL admin workflows, state transitions, foreign keys, and transaction/audit rollback.
- Never target the installed development database. Run the isolated suite and checkpoint.

## 6.10 Documentation and final regression verification
- Add `server/ADMIN.md` and update the Phase 5 Postman collection with Phase 6 routes.
- Run `npm.cmd test` and `npm.cmd run test:integration:isolated`; inspect final diff and report migration decision, files, endpoints, assumptions, results, and recommended manual commit boundaries/messages.
- No schema migration is currently anticipated; add one only if inspection proves necessary.

## Checkpoint log

- **6.1–6.7 — Implemented and verified:** aggregate dashboard, safe user administration, OPEN→CLOSED item moderation through the existing locked Item workflow, soft-deactivated categories/locations, protected report detail, and strict ADMIN auth/input validation. Focused admin/report tests pass; real HTTP/JWT/MySQL integration confirms aggregate counts, status behavior, FK preservation, audit records, and audit rollback.
- **6.8 — Implemented and verified:** six focused admin unit/backend tests cover validation, safe DTOs, zero-filled empty dashboard state, service mapping, authorization, and report privacy.
- **6.9 — Implemented and verified:** isolated suite now includes `server/tests/admin.integration.js`; `npm.cmd run test:integration:isolated` passed all 111 tests. It uses the existing temporary MySQL instance and never targets the installed development database.
- **6.10 — Implemented and verified:** `server/ADMIN.md` and the Phase 5 Postman collection include Phase 6 APIs. `npm.cmd test` passed all 78 tests (65 backend, 7 auth, 6 database). `git diff --check` is the final review step. No migration was needed.

No checkpoint creates a Git commit; manual boundaries are listed in the final report.
