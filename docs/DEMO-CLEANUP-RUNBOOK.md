# FindIt — demo cleanup and release runbook

Prepared locally on 2026-11-14. This document is not authorization to read or mutate production. Production demo data has NOT been removed. Every ADMIN account must survive, including seed, ACTIVE and SUSPENDED accounts, with identical ID, role, password hash, account status, session version and other fields. There is no ADMIN deletion override.

## Tools and default behavior

- `npm run db:purge-demo`: default read-only dry-run. Outside a verified disposable MySQL instance it refuses access unless explicit production-read arguments and the production environment are supplied by an authorized operator.
- `database/scripts/demo-purge.js`: pure manifest builder plus read/transaction engine. No provider/network connection at import time.
- `npm run db:purge-demo:assets`: a separate metadata dry-run and separately confirmed Cloudinary operation. DB cleanup never calls Cloudinary.
- Demo seed/setup refuses NODE_ENV=production or Vercel/Railway environment markers, both at CLI credential validation and the seed function. There is no production override. Existing migrations and schema are unchanged.

The tool scans at most 10,000 rows per table, refuses unknown/incomplete schema, and checks all 30 migration names/checksums. It reads the full bounded dataset to detect related rows, not only counts. Execute locks that dataset in a transaction; plan a maintenance window with all writers, AI/email/image-cleanup workers paused by the authorized operator. Do not run the execute mode on a busy site or increase limits casually.

## Classification and protected data

1. CONFIRMED DEMO: exact published seed private marker on an Item; seed USER contact marker plus exact fixture identity; or a valid UUID run in ai_visual_demo_entities with matching item owner/type or explicit synthetic owner role.
2. POSSIBLE DEMO: sample-like titles (including AI UI synthetic/BrowserPaging), sample names or reserved email domains without strong evidence. These are retained. Domain/name/date alone never authorizes deletion.
3. PROTECTED ADMIN: every account whose verified role is ADMIN, regardless of markers or status. Reported separately with masked email and full-row checksum. Demo Items owned by ADMIN can be selected independently; their owner account and credentials are never selected.
4. REAL/UNRELATED: no independent demo evidence; retained.

The manifest lists table/ID, reason, root entity, related IDs and full-row checksums. Token-hash primary keys are represented by another hash in reports. Password hashes, claim proof, message bodies, raw contact/private identifiers, embeddings and full emails are not printed. Keep manifests/backup evidence private and out of PRs. Do not put personal data or secrets in manually written approval reasons.

All roles, categories, locations, migration history and the catalog singleton are protected. Foreign keys are never disabled; CASCADE is not used. Exact FK metadata plus semantic references in logs, notification/email event keys and AI snapshot manifests determine dependency order.

Mixed relations (for example a real person's Claim/chat/notification/report relating to demo) require independent review. A demo USER with an unmarked real Item cannot be purged by silently deleting that contribution. Exclude that account from the root scope or resolve the classification with the owner. Do not automatically approve the entire reviewRequired array in production.

## Local verification

Use the existing disposable runner only:

```text
node database/scripts/test-isolated.js --all --suite=purge-demo.integration.js
npm run db:test
node database/scripts/test-isolated.js --all --suite=email-concurrency.integration.js
npm run test:browser:runtime
```

The cleanup integration fixture contains seed USER/ADMIN, retained USER, retained ACTIVE and SUSPENDED ADMIN, reserved-domain-only USER, demo Items owned by USER/ADMIN, retained Items, mixed Match/Claim/chat/email/notifications/reports/logs, AI embeddings/jobs/candidates/snapshot/outbox/registry, reset tokens and a shared Cloudinary ID. Exact approvals are synthesized only because all of this integration fixture's records are independently known synthetic.

It verifies read-only dry-run, masked reports, no ADMIN targets, wrong confirmation/target, forged same-count manifest, new relations/changed row, retained real contribution, injected rollback, shared asset exclusion, ACTIVE ADMIN login, unchanged suspended ADMIN hash/status, zero confirmed roots in processed scope after purge, and harmless empty rerun. Cloudinary tests use an in-memory provider and verify replacement/reference refusal, partial failure/retry and already absent reconciliation. No real email/provider deletion is used.

## Approval gate 1 — merge and release

Before asking to merge:

- Review the Draft PR and exact commit SHA, GitHub Actions results and Vercel Preview.
- Verify a compatible backend for Preview; a static Preview build alone does not verify the new owner-only API.
- Resolve blocking review findings; email's previously observed intermittent deadlock remains UNVERIFIED if the controlled tests do not reproduce it. Do not claim it was fixed.
- Confirm API and worker use the same reviewed SHA and schema; no new migration is required by this change.
- Review production deploy triggers first. Do not merge or promote production without the user's explicit instruction.

Deploy compatible API first, confirm readiness/new endpoint authorization, then promote the frontend. The new frontend requires `/api/items/:id/suggestions`. Existing `/matches` and `/visual-suggestions` remain compatible. Enable AI flags only within an already approved release scope. AI automatic notification processing/shadow/demo stays false. Keep preview fixture false. Check API and `/socket.io/` proxy/WebSocket routing, CORS and JWT. Do not infer these from Vercel's SPA fallback.

Rollback application code by selecting the previously reviewed provider deployment/SHA with separate authorization. Do not drop tables, decrement migration history or restore a live database blindly.

## Hosting inventory — evidence boundary

GitHub main deployment metadata on 2026-11-14 links Vercel `tu-21f5/findit-campus` and Railway `awake-illumination`, API `Web_Application`, worker `ai-visual-worker`, and environments named production/ai-staging. This is historical integration metadata, not a live inventory or proof of current flags, branch triggers, resource limits, TLS/private DB networking, volumes or backups. `db-backup`, `/backup`, MySQL backup retention and the mapping of findit.io.vn require an authorized provider inspection. Never delete/reconfigure a service or volume to complete this checklist.

## Production access and backup/restore — separate authorization

Before production dry-run, obtain explicit authorization for read access to the exact Railway project/environment/MySQL service and reviewed endpoint/server UUID. Use a verified container execution mechanism; `railway run` can run locally with production variables and is not the default substitute. Do not copy production credentials into this checkout or tool arguments.

Before any deletion:

1. Verify the actual backup method, service/volume and persistent storage, including db-backup and /backup if still used. A BACKUP_OK log is insufficient.
2. Pause/drain writes and relevant workers in a reviewed maintenance window, then create a fresh consistent backup. Record UTC timestamp, object ID/path, byte size, SHA-256, encryption/access/retention and durable storage proof.
3. Restore to a separate disposable environment with its own target identity/credentials. Validate complete schema/ledger, row checksums, all ADMIN rows/roles/status/session/credential hashes and retained real data. Test authorized ACTIVE ADMIN login against the isolated restore. Do not export decrypted dumps, private keys or personal records to GitHub artifacts.
4. Record restore duration/RPO/RTO and recovery owner. If backup integrity, durable storage or restore fails: STOP, no deletion.
5. Keep writes paused until the reviewed cleanup checkpoint is complete. If the dataset changes, obtain a new dry-run/review and a backup/restore evidence set that actually covers the new data.

See PRODUCTION-BACKUP-RESTORE.md for the existing detailed procedure. Its prior local exercise is not evidence that today's production backup can restore.

## Production dry-run (read only)

After authorized target verification, on the approved runtime, with credentials supplied privately through its environment:

```text
npm run db:purge-demo -- --production-read --expect-host=VERIFIED_PRIVATE_HOST --expect-port=VERIFIED_PORT --expect-server=VERIFIED_SERVER_UUID --expect-database=findit_db --output=NEW_PRIVATE_DRYRUN_PATH
```

NODE_ENV must already be production; FINDIT_ISOLATED_DATADIR must be absent. The live server UUID/database must match and the configured host/port must be exact. The output file is created exclusively, never overwriting another artifact. A default local invocation refuses the production target.

Review separately: demo USER count, protected ADMIN list/count, demo Item count and ADMIN-owned demo Items, per-table related/AI counts, confirmed/possible/real classifications, protected/shared assets and exact manifest fingerprint/target fingerprint.

To narrow roots or add independently verified related demo records, create a private scope JSON with `roots: [{table,id}]` and/or `approvedRelated: [{table,id,rowChecksum,reason}]`, then pass `--scope=PRIVATE_SCOPE_PATH` to a NEW dry-run. Unconfirmed real Items/Users and ADMIN accounts cannot be approved as dependency deletions. The new fingerprint must be reviewed again.

## Approval gate 2 — exact database delete manifest

Present the exact manifest privately to the user after backup/restore verification. Approval is for that fingerprint and target, not for a count or an earlier scope. Any row change, new relationship, ADMIN change or dataset change invalidates execution. Checksums are integrity checks, not proof of human consent or proof that an operator's backup is valid.

Execute also requires a private operator backup receipt:

```json
{
  "manifestFingerprint": "REVIEWED_MANIFEST_SHA256",
  "targetFingerprint": "REVIEWED_TARGET_SHA256",
  "verifiedAt": "UTC_ISO_TIMESTAMP_WITHIN_24_HOURS",
  "restoreVerified": true,
  "backupSha256": "ACTUAL_BACKUP_SHA256",
  "restoreEvidenceSha256": "ACTUAL_RESTORE_EVIDENCE_SHA256"
}
```

This file is an attestation referencing separately reviewed evidence; setting restoreVerified=true does NOT perform a restore or replace reviewing it.

Only after explicit user approval of that exact DB manifest:

```text
npm run db:purge-demo -- --production-execute --execute --expect-host=VERIFIED_PRIVATE_HOST --expect-port=VERIFIED_PORT --expect-server=VERIFIED_SERVER_UUID --expect-database=findit_db --manifest=APPROVED_MANIFEST_PATH --confirm=APPROVED_MANIFEST_SHA256 --target-fingerprint=APPROVED_TARGET_SHA256 --maintenance-window --backup-receipt=VERIFIED_BACKUP_RECEIPT_PATH --receipt-output=NEW_PRIVATE_DB_RECEIPT_PATH
```

The transaction rechecks the full dataset and all ADMIN rows, refuses reviewRequired entries, deletes only exact approved PKs in FK/semantic order, compares every retained row before COMMIT and verifies approved roots are absent. On pre-COMMIT error it rolls back. A lost COMMIT response is explicitly UNCERTAIN: do not repeat execute or delete assets. Reconcile read-only against the approved manifest and verify ADMIN/data first. The receipt remains PENDING if success was not durably recorded.

After a confirmed COMMIT, re-run dry-run, verify zero confirmed roots in the approved scope and check all ADMIN IDs/roles/status/credential/session hashes. Verify authorized ACTIVE ADMIN login; SUSPENDED ADMIN must remain SUSPENDED. Do not change a seed ADMIN's password, role or session to make a check pass. If a known weak seed credential is identified, warn and arrange a separate credential procedure; there is no default seed password in this repository.

## Approval gate 3 — Cloudinary public IDs

DB success does not delete Cloudinary. Shared/unverified IDs remain protected. Asset discovery uses only IDs from a verified committed DB receipt; never list/delete a folder. After approved metadata read access:

```text
npm run db:purge-demo:assets -- --production-access --receipt=COMMITTED_DB_RECEIPT_PATH --expected-target=APPROVED_TARGET_SHA256 --output=NEW_PRIVATE_ASSET_DRYRUN_PATH
```

The plan verifies current DB references, cloud name, exact public_id, upload/image type, resource asset_id/version, original URL checksum and creation time. Review the exact resulting public_id + asset_id + version list and its NEW asset fingerprint with the user. Metadata read is not delete authorization.

Only after separate asset-list approval:

```text
npm run db:purge-demo:assets -- --production-access --execute --manifest=APPROVED_ASSET_MANIFEST_PATH --confirm=APPROVED_ASSET_SHA256 --expected-target=APPROVED_TARGET_SHA256 --maintenance-window --output=NEW_PRIVATE_ASSET_RESULTS_PATH
```

All assets are preflighted before deletion. New references/replacements stop execution; no new ID is added. Per-asset results are recorded. Retry requires the same reviewed manifest and `--retry-results=PRIOR_RESULTS_PATH` with a new output path; successful IDs are not deleted again. A replacement requires a NEW dry-run and approval. Reconcile absent/failed assets using metadata before another attempt. Restoring database rows does not recreate Cloudinary images: retain a separately verified asset recovery/export strategy before approving deletion.

## Post-cleanup and smoke test

- Confirm scoped DB demo count 0; report possible/out-of-scope records and protected/shared assets honestly.
- Confirm every ADMIN and retained real record remains intact, no FK violation, no unexpected notification/email or seed recreation.
- Verify API/worker SHA, health, Socket.IO, Home/Explore/Item Detail/search, unified owner suggestions, Claim/return, chat, notifications, Admin, footer and responsive UI on the approved production domain.
- AI notification flags remain in their approved state (default false). Do not send real email merely to complete regression.
- Propose removal of SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_USER_EMAIL, SEED_USER_PASSWORD only if obsolete. Environment changes need separate approval; never change ADMIN credentials through cleanup.
- Preserve backup service, volumes and backup objects according to retention; no automatic provider resource removal.

No production read, backup, restore, deletion, Cloudinary deletion, merge or production deployment has been performed by the local development work described here.
