# Verification of feature/ai-production

Date: 2026-11-08 (Asia/Saigon). Base revision: `c48e6d1`.
The initial code preparation and tests below ran before the local commit on
`feature/ai-production`. No push, PR, merge, deployment, production connection,
real user data, email delivery, Cloudinary upload or paid resource was used in
that initial test run. No AGENTS.md was found in the repository or
checked ancestor paths. The working tree was clean before editing.

Read the exact [deployment configuration and rollout runbook](AI-PRODUCTION-DEPLOYMENT.md)
alongside [production backup/restore](PRODUCTION-BACKUP-RESTORE.md).

## Implemented behavior

- Explicit `AI_VISUAL_MODE=production` and service role validation; defaults remain
  AI-off. Development/test still require the verified local disposable MySQL
  identity. Production rejects an isolation datadir, wrong service role and any AI
  notification/shadow/demo flag. Configuration errors do not interpolate values.
- Express only enqueues and reads suggestions; it does not import the encoder or
  start an AI worker. The separate worker validates schema before loading the
  model, claims only the pinned revision, keeps serial CPU inference, renews leases
  and drains on shutdown with bounded fallback. Existing download/decode/retry
  limits and Cloudinary application-public-ID allowlist are retained.
- Model-independent backfill uses bounded pages and Item locks, preserves active
  leases and deduplicates jobs. Default reruns do not reprocess complete images.
  `--retry-failed` and `--rebuild` explicitly recover exhausted jobs and rebuild
  results after an AI-off interval.
- Owner eligibility, bound owner queries, active accounts, Item visibility/status,
  pinned model, complete current image embeddings and completed jobs all gate
  reads. Partial candidates are hidden even if they were persisted before a job
  failed. Reads do not alter official Matches, Claims or business notifications.
- API exposes processing/error/ready state without exposing job error details.
  UI handles loading, processing, empty, error/retry and success, refreshing queued
  results every 10 seconds and other successful responses every 30 seconds.
  Cosine remains a decimal similarity score with the existing ownership disclaimer.
- Production builds reject preview fixtures. The existing local synthetic browser
  workflow has a narrowly explicit test-mode build; provider environment markers
  disallow that exception. Final local dist was rebuilt in normal production mode
  with both UI AI flags false.

## Tests and evidence

Runtime: Windows, Node 24.22.1, npm 11.19.1. Dependencies installed from the
unchanged lockfiles. MySQL 8.0.44 portable was downloaded from Oracle's official
CDN into ignored `.cache/tools`; mysqld.exe Authenticode status was Valid, signer
Oracle America, Inc. No MySQL service was installed. Each integration runner
initialized its own temporary datadir and random non-service port, verified live
`@@datadir`/`@@port` before writes, and removed the instance afterward.

| Command (repository root unless specified) | Result |
| --- | --- |
| `npm test` | 181/181: backend 165, auth 7, database 9 |
| `node --test server/tests/ai-production.test.js server/tests/ai-visual.test.js server/tests/visual-suggestions.test.js` | 24/24 after final configuration assertions |
| `npm run test:integration:isolated` with `MYSQLD_PATH` pointing at the portable executable | Final full run: 336/336, zero skipped/cancelled/failed |
| `npm run test:integration:isolated -- --suite=ai-production.integration.js` | 9/9 targeted production regressions, also included in final full run |
| `cd client; npm test` | 63/63 on 10 files |
| `cd client; npm run typecheck` | Passed |
| `cd client; npm run test:browser` with the same portable `MYSQLD_PATH` | Final browser/Item runner: 19/19, real local HTTP/JWT/MySQL/Chrome |
| `cd client; npm run build` with `VITE_AI_VISUAL_SUGGESTIONS_ENABLED=false` and `VITE_AI_VISUAL_SUGGESTIONS_PREVIEW_FIXTURE=false` | Passed TypeScript + Vite production build, 109 modules |
| `npm run ai-visual:smoke -- .cache/ai-synthetic.png .cache/ai-synthetic.png` with workspace model cache | Real pinned CLIP inference passed; 512 dimensions; cosine 0.9999999674 |
| `npm audit --omit=dev --json` | 0 production vulnerabilities at verification time |
| `git diff --check`; syntax checks of worker/backfill entrypoints | Passed |
| `git diff --exit-code -- database package-lock.json client/package-lock.json` | No migration/schema/manifest or lockfile changes |

All MySQL integration and browser inference/download adapters are **mocks**, with
synthetic fixtures; database locking, leases, authorization and lifecycle services
are real. The separate CLIP smoke is **real inference**, on a locally generated
224×224 solid-color PNG, with no database or Cloudinary request. That smoke observed
initialization about 5.73 seconds, inference about 40.8/22.7 ms and final RSS about
300 MB. This is a Windows smoke, not peak-memory or Railway Linux evidence.

The first integration run exposed an old regression asserting that incomplete
candidates should stay visible. It was updated to test the newly required hiding
and subsequent recovery, not skipped. A new HTTP startup test initially selected a
test-named database, which the existing health contract correctly rejected; the
test now uses the disposable instance's seeded findit_db for startup and its own
test database for candidate fixtures. Final runs above supersede those failures.
Dependency/bootstrap failures caused by sandbox network/native-tool permissions
were resolved locally before verification. No runtime guards were weakened.

Detailed ignored local logs:

- `.cache/ai-production-unit-final.log`
- `.cache/ai-production-all-final.log`
- `.cache/ai-production-regression-final.log`
- `.cache/ai-production-browser-final.log`
- `.cache/ai-production-inference.log`
- `.cache/ai-production-audit.json`

## Subsequent local backup and LF verification

The separately supplied backup was restored locally on a fresh MySQL 8.4.13
instance outside the repository/OneDrive, with live datadir/loopback port identity
verified before writes. Restore exited 0: 16 InnoDB tables and 18 applied entries.
The first upgrade attempt correctly refused CRLF working-tree checksum drift;
all 18 backup ledger checksums matched the immutable Git blobs.

The repository now pins `database/migrations/*.sql text eol=lf`. All 30 working-tree
migration files have LF bytes identical to their Git blobs. After restoring again,
the unchanged migration runner applied 12 migrations, verified all 30 applied
checksums and the complete 27-table InnoDB schema. Typed row hashes over all
original columns proved that the 15 business tables and all 18 original ledger
entries were preserved. A second migrate applied 0 migrations, with data and the
full ledger unchanged. No setup, application seed or seed-based verifier ran.
The disposable instance/data were removed and the original backup hash remained
unchanged. Aggregate evidence is in ignored
`.cache/backup-verification-20261108-lf.json`; no dump or user data is committed.
This local rehearsal does not verify provider backup provenance, retention or RPO.

## Changed files

Production config, process boundaries and backfill:

- `.gitattributes`, `.env.example`, `package.json`
- `server/config/env.js`, `server/server.js`
- `server/ai-visual/config.js`, `server/ai-visual/production-config.js`
- `server/ai-visual/schema-check.js`, `server/ai-visual/main.js`
- `server/ai-visual/clip-encoder.js`, `server/ai-visual/repository.js`
- `server/ai-visual/backfill.js`, `server/ai-visual/backfill-main.js`

Suggestions API and UI:

- `server/controllers/visual-suggestions.controller.js`
- `server/repositories/visual-suggestions.repository.js`
- `server/services/visual-suggestions.service.js`
- `client/.env.example`, `client/vite.config.ts`
- `client/src/lib/types.ts`, `client/src/components/VisualSuggestions.tsx`
- `client/scripts/test-browser.mjs`

Regression tests:

- `server/tests/ai-production.test.js`, `server/tests/ai-production.integration.js`
- `server/tests/ai-visual.integration.js`
- `server/tests/visual-suggestions.test.js`, `server/tests/visual-suggestions.integration.js`
- `client/src/lib/ai-build-config.test.ts`
- `client/src/components/VisualSuggestions.test.tsx`
- `client/src/pages/ItemDetailPage.test.tsx`

Documentation:

- `server/AI-VISUAL-MATCHING.md`, `docs/RELEASE-FINDIT-AI-UI.md`
- `docs/AI-PRODUCTION-DEPLOYMENT.md`, `docs/AI-PRODUCTION-VERIFICATION.md`

## Still unverified before deployment

No production-ready verdict is given. Still required: provider backup/recovery
readiness and a fresh deployment-time migration ledger check; Linux
CI on the final reviewed SHA; Railway API/worker source/env/private-network scope;
cold/warm model volume, resource limits and SIGTERM/forced-kill measurements on
Linux; approved synthetic Cloudinary E2E; Vercel CORS/auth/build scopes and provider
branch/deploy triggers. The repository cannot establish any of these from unit
test results. AI automatic notifications remain out of scope and forbidden.
