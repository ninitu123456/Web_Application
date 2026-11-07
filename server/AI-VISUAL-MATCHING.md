# AI Visual Matching (development shadow mode)

The worker stores image embeddings and shadow candidates only. A separate read-only suggestions API may expose current candidates to the owner of an eligible LOST item when its own feature flag is explicitly enabled. It never alters `matches`, creates notifications, or changes Claim state.

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

The worker and local smoke tool read at most 5 MiB per local image, inspect actual JPEG/PNG/WebP metadata, reject multi-frame images and inputs over 40 million pixels, and decode with Sharp's `limitInputPixels` and strict error handling. RGB output is bounded to 1024 by 1024 before CLIP processing. Sharp 0.34.5 is reused from the existing Transformers.js installation and declared directly because this code calls it. Native processing has a 10-second libvips timeout; this is a decoder processing limit, not a hard OS memory/time sandbox. A future production worker still needs process/container resource limits. Worker cleanup removes downloaded temporary files even when decoding fails.

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
