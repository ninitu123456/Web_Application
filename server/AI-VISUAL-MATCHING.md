# AI Visual Matching (development shadow mode)

The worker stores image embeddings and shadow candidates only. A separate read-only suggestions API may expose current candidates to the owner of an eligible LOST item when its own feature flag is explicitly enabled. It never alters `matches`, creates notifications, or changes Claim state.

## Experimental AI notification foundation (development only)

Before running the changed backend against a database, apply migrations `001–025` using `npm.cmd run db:migrate` with that database selected. In particular, `017–025` create and seed `ai_visual_catalog_state` and the snapshot/notification tables used by unconditional catalog-revision updates. Verify migration `025_ai_visual_catalog_state_seed.sql` is applied before starting the backend; do not skip revision updates to accommodate an older schema.

Migration `017–024` adds a catalog revision, immutable per-generation snapshot manifests/results, owner preferences (default `false`), auditable decisions, a retryable outbox, a lifetime pair-alert ledger, and a registry for synthetic demo entities. Snapshot manifests pin the LOST image IDs and the eligible `OPEN` FOUND universe, image IDs, model/revision, policy version, and catalog revision. A snapshot becomes `COMPLETE` only after every pinned image has a completed job and a 512-dimensional embedding, and only if its input hash and catalog revision still match at finalization. Any relevant item/image/claim/account mutation increments the catalog revision in its transaction. Expired snapshot leases can be reclaimed; stale leases cannot finalize.

Only LOST owners who are `ACTIVE`, have an `OPEN` LOST item with images, and explicitly enabled `ai_visual_notification_preferences.enabled` are considered. FOUND candidates must be `OPEN`, have images, and belong to an `ACTIVE` owner. `CLAIM_PENDING`, `CLAIMED`, `RETURNED`, and `CLOSED` items are excluded. AI decisions are separate from official Match and Claim workflows.

All three process controls default to `false`: `AI_VISUAL_NOTIFICATION_PROCESSING_ENABLED`, `AI_VISUAL_NOTIFICATION_SHADOW_MODE`, and `AI_VISUAL_NOTIFICATION_DEMO_ENABLED`. Processing is development/test only and requires the existing AI worker's isolated-MySQL guard. The demo flag additionally requires a database named `findit_test_<24 hex>`, loopback on a non-service port, and a temporary isolated datadir. The test runner verifies the live `@@datadir` and `@@port`. No email, SMS, push, or external delivery path exists.

There is no validated production notification policy. The decision engine therefore records `ABSTAIN` (including in shadow mode), and never treats cosine as a probability. The only permissive policy is the explicit synthetic fixture policy in the isolated integration test, labeled `DEMO ONLY`; its `AI_VISUAL_NOTIFICATION_DEMO_MIN_COSINE` default is 0.95 and can only be used behind the isolated demo gate. Demo delivery rechecks snapshot revision, item/owner status and preference, then writes the in-app notification, stable event key, pair-alert ledger, and outbox state in one transaction. A unique recipient/LOST/FOUND ledger key prevents another alert across snapshot generations.

Run the reproducible no-Cloudinary fixture demo on a newly provisioned temporary MySQL 8 instance:

```powershell
npm.cmd run test:integration:isolated -- --suite=ai-visual.integration.js
```

The suite asserts that a partial snapshot creates no notification, that completed synthetic fixtures can create exactly one in-app demo notification, and that official Matches and Claims remain unchanged. The fixtures are created and dropped inside the owned temporary database. Production notifications remain disabled until an independently validated policy and explicit product/privacy approval exist.

## Read-only suggestions preview

- Both `AI_VISUAL_SUGGESTIONS_ENABLED` (backend) and `VITE_AI_VISUAL_SUGGESTIONS_ENABLED` (frontend build) default to `false`. Enable both only for a local preview. `VITE_AI_VISUAL_SUGGESTIONS_PREVIEW_FIXTURE=true` adds an explicit synthetic-score label and otherwise defaults to `false`.
- Backend enablement requires `NODE_ENV=development|test`, loopback MySQL on a port other than 3306/3311, and a `FINDIT_ISOLATED_DATADIR` under `%TEMP%/findit-mysql-*/data`. Startup verifies the live MySQL datadir and port. The flag does not enable image uploads for AI, load CLIP, start a worker, or require Cloudinary credentials.
- The preview database must already contain migrations 014–016 and current candidate/embedding rows. This feature does not run migrations or write during reads. Missing AI tables safely produce an empty list.
- `GET /api/items/:id/visual-suggestions` requires an authenticated owner of an active LOST item. It returns at most three active FOUND items, using the pinned model/revision and requiring fresh embeddings for all current images. Other users receive a generic 404.
- The score is a cosine ranking score, not a probability or identity confirmation. The endpoint never creates Matches, Notifications, or Claims.

For a synthetic-data preview, set the backend flag and `VITE_AI_VISUAL_SUGGESTIONS_ENABLED=true` only when using a verified disposable local database. The frontend variable is public build configuration and must never contain credentials.

## Safety gates

- `AI_VISUAL_MATCHING_ENABLED` defaults to `false`. With the flag off, uploads do not enqueue jobs and neither the Express process nor a worker loads the model.
- Enabling the flag requires `NODE_ENV=development` or `test`, a `127.0.0.1` database, a non-service port, and `FINDIT_ISOLATED_DATADIR` shaped like `%TEMP%/findit-mysql-*/data`. Both the app and worker verify the live MySQL `@@datadir` and `@@port` before AI work.
- It also requires `AI_VISUAL_MATCHING_CLOUD_NAME` to explicitly name a dedicated development Cloudinary account and to match `CLOUDINARY_CLOUD_NAME`. The worker uses only this explicit AI cloud name; keep the feature off if a development account is unavailable.
- The API process never starts the worker. Start it as a separate process only after applying migrations to that isolated database.
- The worker reads generated `findit/items/<uuid>` Cloudinary public IDs only. It constructs an HTTPS URL for `res.cloudinary.com`, rejects redirects, uses a 10 second timeout, downloads at most 5 MiB, and requests a 1024×1024 JPEG transform. It never fetches `item_images.image_url` or arbitrary URLs.

## Development commands

The worker and local smoke tool read at most 5 MiB per local image, inspect actual JPEG/PNG/WebP metadata, reject multi-frame images and inputs over 40 million pixels, and decode with Sharp's `limitInputPixels` and strict error handling. RGB output is bounded to 1024 by 1024 before CLIP processing. Sharp 0.35.5 is pinned directly and shared with Transformers.js via a scoped override to remove vulnerable Sharp/libvips versions without changing the pinned CLIP model or Transformers version. Native processing has a 10-second libvips timeout; this is a decoder processing limit, not a hard OS memory/time sandbox. A future production worker still needs process/container resource limits. Worker cleanup removes downloaded temporary files even when decoding fails.

Apply migrations only to a disposable isolated MySQL instance. The project test runner provisions and verifies one automatically:

```powershell
npm.cmd run test:integration:isolated
```

For an explicitly configured isolated development instance, set `AI_VISUAL_MATCHING_ENABLED=true`, `NODE_ENV=development`, `DB_HOST=127.0.0.1`, its non-service `DB_PORT`, its actual `FINDIT_ISOLATED_DATADIR`, and the matching `AI_VISUAL_MATCHING_CLOUD_NAME` in the worker/app process environment. Do not point this feature at either installed MySQL service, a production Cloudinary account, or production.

Run the separate worker with:

```powershell
npm.cmd run worker:ai-visual
```

CLIP ViT-B/32 is pinned to revision `4c1807b705b1d015fb032789cc4d221b23025a6f`, Transformers.js 3.8.1, q8, CPU, one job at a time. The first enabled worker startup downloads official model artifacts if absent. The default cache is `%LOCALAPPDATA%/FindItVisualMatching/model-cache`; `AI_VISUAL_MATCHING_CACHE_DIR` can point to an existing local cache.

The worker stores normalized 512-float vectors as 2,048-byte blobs, retries jobs up to three times with backoff, and recovers processing jobs after a two-minute lease expires. Visual scores use max cosine similarity over photo pairs and are stored separately from official matching decisions. No production threshold is configured.

Candidate pages are discovery snapshots only. Before writing a page, the worker locks the participating Items in numeric ID order, checks its current job lease and both Items' active states, and recomputes max cosine from the embeddings still present using a current database read. A deleted image's old score cannot be reinserted from an earlier page. Writes lock Items before Jobs; claiming a Job locks only the queue row and reads Item metadata without a locking join.

Owner close, legacy admin close, admin moderation, and Claim completion remove shadow candidates in the same transaction as the terminal Item transition. Cleanup runs even when AI is disabled and skips the candidate table when it has not been migrated yet. No additional migration is needed for this consistency fix. Regression cases are in `server/tests/ai-visual-consistency.integration.js` and run through the isolated MySQL runner; they mock only Cloudinary and inference, not database locking or lifecycle services.

Use the model smoke command with local test images to check CPU inference without a database or Cloudinary request:

```powershell
$env:AI_VISUAL_MATCHING_CACHE_DIR = 'C:\path\to\local\model-cache'
npm.cmd run ai-visual:smoke -- 'C:\path\to\lost-fixture.jpg' 'C:\path\to\found-fixture.jpg'
```

Cosine similarity in smoke output is a ranking score, not a probability. Do not use these scores to approve Claims or send automatic notifications.
