# AI visual suggestions: production preparation

This runbook supersedes the development-only AI enablement restriction in the
earlier release notes. It authorizes no deployment or production access. AI stays
off unless explicitly enabled. Official Match, Claim, business notifications,
email and chat keep their existing workflows. No automatic AI notifications are
approved, including shadow and demo processing.

## What blocked the starting revision c48e6d1

- API suggestions and image enqueue config rejected production; both startup
  paths unconditionally required a verified disposable MySQL instance.
- No supported way to enqueue existing images after enabling AI.
- UI could not distinguish queued/failed analysis from an empty result.
- Production builds did not reject synthetic preview flags.
- Infrastructure evidence was incomplete: verified backup/restore, actual schema
  ledger, provider branch triggers, Linux resource measurements and end-to-end
  Cloudinary access. Repository tests do not resolve those infrastructure gaps.

The implementation adds an explicit production mode alongside the unchanged
development/test live-instance guard. Never spoof FINDIT_ISOLATED_DATADIR or set
NODE_ENV=development on Railway. Production errors name variables, never values.

## Service commands

Paths below assume the Git repository root is `Web_Application`. If the provider
checkout contains a parent directory, select `Web_Application` as its root first.
Use the same reviewed SHA for API and worker. Node 24 is the locally tested major;
pin and test the selected patch on Linux before deployment.

| Setting | Railway API | Railway worker | Vercel |
| --- | --- | --- | --- |
| Root | repository root | repository root | `client` |
| Install/build | `npm ci --omit=dev` (no compilation) | `npm ci --omit=dev` (no compilation) | install `npm ci`; build `npm run build` |
| Start | `npm start` | `npm run worker:ai-visual` | static output `dist` |
| Replicas/concurrency | retain reviewed API topology | initially one replica, serial inference 1 | static |
| Public listener | `HOST=0.0.0.0`, provider `PORT` | none; no HTTP healthcheck | HTTPS site |
| Volume | none for AI | mount `/data`; cache `/data/findit-ai/model-cache` | none |

Neither build nor start runs migrations or backfill. Express never imports the
encoder or starts the AI worker. Do not put CLIP in the API process. The worker
does not need JWT, email, seed or Cloudinary write secrets; do not copy the full
API variable set into it. Existing API email configuration stays unchanged.

## Variables and scopes

Values marked `true` describe the later approved enablement, not repository
defaults. Initially deploy with all feature booleans false and the worker stopped.

| Variable | Railway API | Railway worker / one-off backfill | Vercel production build |
| --- | --- | --- | --- |
| `NODE_ENV` | `production` | `production` | normal production build |
| `AI_VISUAL_MODE` | `production` | `production` | absent |
| `AI_VISUAL_SERVICE_ROLE` | `api` | `worker` | absent |
| `AI_VISUAL_MATCHING_ENABLED` | `true` to enqueue new images | `true` to process/backfill | absent |
| `AI_VISUAL_SUGGESTIONS_ENABLED` | `true` to expose owner endpoint | absent/`false` | absent |
| `DB_HOST`, `DB_PORT` | explicit reviewed private MySQL endpoint/port | same DB/endpoint | absent |
| `DB_NAME` | `findit_db` | `findit_db` | absent |
| `DB_USER`, `DB_PASSWORD` | API credentials | separate scoped worker credentials recommended | absent |
| `CLOUDINARY_CLOUD_NAME` | existing application cloud | absent | absent |
| `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | existing upload/delete credentials | absent | absent |
| `AI_VISUAL_MATCHING_CLOUD_NAME` | exact `CLOUDINARY_CLOUD_NAME` | same application cloud name as API | absent |
| `AI_VISUAL_MATCHING_CACHE_DIR` | absent | required absolute `/data/findit-ai/model-cache` | absent |
| `AI_VISUAL_MATCHING_CONCURRENCY` | absent/`1` | `1` (other values rejected) | absent |
| `AI_VISUAL_MATCHING_POLL_MS` | default `1000` | `1000` (250–60000) | absent |
| `AI_VISUAL_MATCHING_MAX_ATTEMPTS` | default `3` | `3` (1–10) | absent |
| `AI_VISUAL_MATCHING_JOB_TIMEOUT_MS` | default `120000` | `120000` (1000–600000) | absent |
| `AI_VISUAL_NOTIFICATION_PROCESSING_ENABLED` | `false` | `false` | absent |
| `AI_VISUAL_NOTIFICATION_SHADOW_MODE` | `false` | `false` | absent |
| `AI_VISUAL_NOTIFICATION_DEMO_ENABLED` | `false` | `false` | absent |
| `FINDIT_ISOLATED_DATADIR` | absent, rejected in production mode | absent, rejected | absent |
| `VITE_API_BASE_URL` | absent | absent | reviewed HTTPS API URL ending `/api` |
| `VITE_AI_VISUAL_SUGGESTIONS_ENABLED` | absent | absent | `true` only at approved UI enablement |
| `VITE_AI_VISUAL_SUGGESTIONS_PREVIEW_FIXTURE` | absent | absent | `false`; deployed builds reject `true` |

Retain existing API `JWT_SECRET`, `JWT_EXPIRES_IN`, `CORS_ORIGINS`,
`FRONTEND_URL`, rate limits and reviewed proxy/WebSocket configuration. No secret
belongs in VITE variables. The production mode demands explicit DB coordinates
and nonempty credentials, but cannot prove provider service identity, private
network isolation or TLS from a hostname: operator verification remains required.
Application DB configuration supports the existing host/port credentials, not
`DATABASE_URL`; do not assume a provider URL is consumed automatically.

## Model and limits

Pinned Xenova/clip-vit-base-patch32 revision
`4c1807b705b1d015fb032789cc4d221b23025a6f`, Transformers.js 3.8.1, q8, CPU,
512 dimensions. Worker claims only jobs for that model/revision. Cache artifacts
survive restarts through the mounted volume. Validate directory ownership, free
space, cold downloads and warm startup in the target image. The worker requires
only public image read access to the application cloud.

ONNX intra/inter-op threads are both fixed at 1. Set build variable
`ONNXRUNTIME_NODE_INSTALL_CUDA=skip` on the worker to avoid downloading unused
CUDA libraries during Linux `npm ci`. No GPU/provider API is needed.
See [automatic matching audit and measurements](AI-AUTO-MATCHING-PRODUCTION.md)
for this branch's tests, measured cold/warm CPU/RAM and approval gates.

Only `findit/items/<UUID>` public IDs are accepted. Image URLs from DB are never
fetched; the downloader constructs Cloudinary HTTPS URLs with no redirects, a
10-second request timeout and 5 MiB cap. JPEG/PNG/WebP decode is capped at 40MP,
single frame, 1024×1024 RGB and 10 seconds libvips processing. These are not an OS
memory sandbox. Benchmark peak RSS, CPU and backlog on Linux under the intended
container limits. The approved staging proposal tests 1 vCPU / 1 GiB first;
stop on OOM/instability and report measurements rather than increasing limits.
See [the staging approval plan](AI-STAGING-APPROVAL.md) before creating resources.

Default retries: 3; backoff capped at 300 seconds; lease: 2 minutes, renewed every
30 seconds. SIGTERM/SIGINT stops claiming, drains the current job and deletes its
temporary download, disposes the encoder and closes DB. A 90-second shutdown
deadline exits if hung; an abandoned lease can be reclaimed after expiry. Configure
provider termination grace to allow drain and measure behavior under forced kill.

The whole claimed job now has a watchdog (default 120 seconds). On timeout the
dedicated process exits 1; configure Railway restart policy `ALWAYS` so a restart
and expired MySQL lease recover it. This does not mark the still-running native
inference complete or start concurrent work. Successful retries reuse valid
persisted vectors. Timeout/kill may leave a bounded temporary image until the
container filesystem is replaced; it never writes image bytes to the model volume.
Logs include per-job embedding reuse/RSS and a CPU/RSS heartbeat every 60 seconds.
Alert on missing heartbeat, repeated poll failures, oldest queued age and FAILED
counts; heartbeat alone is not evidence that a job completed.

## Migration, rollout and recovery sequence

1. Verify provider branch filters, deploy hooks, project/environment/service IDs,
   current SHA, selected roots/commands and exact env scopes. This branch must not
   deploy automatically during preparation.
2. Complete [backup and restore verification](PRODUCTION-BACKUP-RESTORE.md), inspect
   the real migration ledger/checksums and rehearse on an isolated restore. Do not
   infer production ledger from Git or run seed-based verification on real data.
3. Apply only pending manifest migrations in an approved maintenance window via
   `npm run db:migrate`. All 30 manifest entries through catalog seed 025 are
   required by this release. There is no new migration and published SQL remains
   unchanged. Do not use `db:setup`, `db:seed` or seed-based `db:verify` on production.
   Runtime AI preflight checks its queue/embedding/candidate columns and catalog
   seed; it does not replace full schema/ledger verification.
4. Deploy API/frontend AI-off first; verify ordinary auth, Item/Claim/Match,
   moderation, chat and business delivery. Prepare worker volume/limits separately.
5. After explicit rollout approval, enable API enqueue, start worker with the same
   application cloud and DB, then run `npm run ai-visual:backfill` as a one-off using
   the worker environment. It scans Item IDs in pages of 100, takes Item locks,
   queues eligible application image IDs and leaves active leases alone. It loads
   no model, fetches no image and sends no notification. Repeated default runs are
   idempotent; unique image/model/revision and pair keys prevent duplicates.
6. A failed job remains failed until explicit
   `npm run ai-visual:backfill -- --retry-failed`. This resets only failed eligible
   jobs; queued/processing jobs keep their state. To rebuild after an AI-off interval
   or candidate invalidation, use `npm run ai-visual:backfill -- --rebuild` (optionally
   with `--retry-failed`). Rebuild intentionally requeues completed eligible jobs,
   preserves leases and suppresses old scores until all current images complete.
7. Watch sanitized worker events, failed/expired job counts, queue age, RSS,
   decode failures, Cloudinary errors and DB contention. Backfill's summary reports
   scanned Items and changed jobs; an interrupted run can restart from the beginning.
   To restrict a separately approved demo run, repeat `--item-id=<exact ID>` for
   the verified 30 demo IDs, e.g. `npm run ai-visual:backfill -- --item-id=123
   --item-id=124`. Never infer IDs from title prefixes. Unscoped backfill includes
   all eligible users and is not the demo rollout command.
8. Enable owner suggestions API and rebuild Vercel with the UI flag true only after
   the queue works. Test approved synthetic LOST/FOUND, unauthorized access, hide,
   delete image, Claim completion and error/retry on the actual stack. Scores are
   cosine similarities, never ownership probabilities or Claim approval evidence.

The endpoint returns its existing `data` array plus `visualState` (`processing`,
`error`, `ready`). It filters hidden/inactive/terminal Items, suspended owners,
unpinned models, missing current embeddings and incomplete jobs. LOST ownership is
checked before and after reads and bound again in the result query. Existing
eligible states OPEN/CLAIM_PENDING/CLAIMED remain unchanged; RETURNED/CLOSED are
excluded. UI refreshes processing results every 10 seconds and ready/empty or
analysis-error results every 30 seconds, so later FOUND jobs can populate an open
panel. HTTP errors stop polling and offer manual retry.
Analysis failure refresh does not reset exhausted jobs; operators use the explicit
retry command after resolving the cause. A zero-image source yields ready/empty.

For an incident: stop worker, set API `AI_VISUAL_MATCHING_ENABLED=false` and
`AI_VISUAL_SUGGESTIONS_ENABLED=false`, rebuild frontend with
`VITE_AI_VISUAL_SUGGESTIONS_ENABLED=false`. Keep all notification/preview flags
false. Do not drop AI tables or decrement migrations: catalog invalidation runs
even with AI disabled. Resolve the cause, then retry/rebuild explicitly before
re-enabling. Application rollback and data restore require the separate recovery
procedure; this runbook does not authorize either.

The local browser test runner uses a labelled synthetic build only with both
`--mode test` and `FINDIT_FRONTEND_BROWSER_BUILD=1`, and refuses that exception
when Vercel/Railway environment identifiers are present. Never publish that test
`dist`; finish verification with a normal production build, preview flag false.

## Evidence still required before deployment

Passing local unit/integration/build checks is not a production-ready verdict.
Require verified production backup/restore, actual ledger and migration rehearsal,
Linux CI/build on the final SHA, Railway cold/warm cache and memory/termination
measurements, scoped DB/private-network configuration, real application Cloudinary
synthetic-image E2E, CORS/auth and Vercel build scopes, and provider deployment
approval. No production database or Cloudinary access is part of this change.
