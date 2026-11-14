# FindIt production polish — verification

Date: 2026-11-14. Repository: Web_Application_New only. Base: origin/main `2acaa53acd85b4fba3ef045ec9ffb5fbed1faf58`; branch: `feat/production-polish`. The original audit history and PR #16 are ancestors of this branch. No published migration, lockfile or dependency was changed.

## Delivered behavior

- Mobile chat now bounds the flex frame to the actual available viewport above navigation. Message history scrolls without pushing the composer underneath bottom navigation. visualViewport/resize handling, short-height behavior and listener cleanup are included. Reproduced the unobstructed-hit-test failure before the fix; regression covers long messages/history, draft/focus, top/end scroll, widths 360/390/768/1440 and reduced viewport height.
- Item Detail has one owner-only “Gợi ý cho bạn” section using the existing ItemCard. IMAGE and INFORMATION results share one contract. The backend removes visual item IDs before information COUNT/LIMIT/OFFSET; overlapping items carry both reasons. Pagination remains complete across pages. New endpoint: GET /api/items/:id/suggestions; legacy /matches and /visual-suggestions contracts remain available.
- LOST owners see FOUND candidates; FOUND owners see existing reverse LOST candidates. Public DTOs, eligible lifecycle, active accounts, pinned model, image/job freshness and hidden-item filters remain enforced. ADMIN has no private-owner bypass. Authorization is rechecked after the snapshot.
- Presentation bands are VERY_HIGH >=0.85, HIGH >=0.70, MEDIUM otherwise. These uncalibrated labels do not change candidate filtering, ranking or production matching thresholds. The UI exposes no raw cosine/probability. Rule scores remain separately labeled. Ownership warning remains visible.
- Loading/skeleton, processing, empty, error/retry, AI-disabled and successful states remain; polling is bounded by component lifetime/session and stops on HTTP failure. Existing Claim, return, Notification and Admin workflows remain covered.
- Footer uses the current year. Product copy review found no additional inappropriate academic/demo wording requiring removal. Necessary fixture/AI warnings remain. Production fixture build guards remain enabled.
- Demo cleanup tools and a separate asset reconciliation tool are implemented and tested. Production seed execution is refused before DB connection/credential reads. See DEMO-CLEANUP-RUNBOOK.md for concrete commands, release/rollback steps and mandatory approval gates.

## Baseline and final evidence

Node 24.21.0, npm 11.19.0, MySQL 8.0.46 on Windows. Dependency installation used npm ci; no lockfile modifications. All database tests create a verified disposable MySQL instance with a fresh datadir. Mail and Cloudinary providers are fake/injected; no external email or Cloudinary deletion occurred.

| Check | Baseline | Final local result |
| --- | --- | --- |
| Frontend unit | 83 PASS | 85 PASS |
| TypeScript / Prettier | PASS | PASS |
| Production build | PASS | PASS with explicit nonproduction example API and fixture=false; not proof of hosting configuration |
| Backend unit | 173 PASS | 176 PASS |
| Auth unit | 7 PASS | 7 PASS |
| Database unit | 9 PASS | 17 PASS |
| All isolated MySQL integration | 380 PASS | 393 PASS |
| Cleanup integration final rerun | N/A | 12 PASS, included in integration count |
| Existing browser workflow | 19 PASS | 19 PASS |
| Account/chat browser | 13 PASS | 13 PASS incl new viewport hit tests |
| Real CLIP E2E | 8 PASS | 9 PASS incl FOUND reverse and real-browser image ranking |
| Full application/runtime browser | N/A | 1 PASS; real Socket.IO delivery, zero application console errors and zero HTTP errors |
| Production dependency audit | PASS | 0 vulnerabilities |
| Changed/new JS syntax / credential-pattern scan | N/A | 0 syntax errors / 0 potential credential matches |
| Diff whitespace / published migrations / lockfiles | clean | clean / unchanged / unchanged |

Reproduction commands: npm test; npm run test:integration:isolated; in client/ npm test, npm run typecheck, npm run format:check, npm run build, npm run test:browser. Account browser: test-mode build with API=/api, AI=true, fixture=false, then FINDIT_FEATURE_BROWSER=1 node database/scripts/test-isolated.js --all --suite=account-chat-email.integration.js. Real model: npm run test:ai-real-e2e. Full actual runtime: npm run test:browser:runtime. Normal production build requires an explicit valid VITE_API_BASE_URL and fixture=false; never weaken build guards to obtain a green result.

Ignored local evidence: .cache/frontend-browser/, .cache/feature-browser/, .cache/ai-real-e2e/; test logs in the OS temporary directory findit-polish-20261114. Representative screenshots: frontend-browser/full-runtime/home-360.png, home-390.png, home-768.png, home-1440.png, chat-mobile.png, admin-mobile.png; frontend-browser/ai-ui-panel-390.png and ai-ui-found-desktop.png. Screenshots are synthetic test data and intentionally excluded from Git.

The full-runtime run starts the actual application and Socket.IO. Eight external font requests were deliberately blocked and categorized separately; application console errors=0, HTTP errors=0. Other request-fault/HTTP-error cases in the mock UI harness are intentional assertions, not observed production failures. Browser focus/resize emulation does not establish physical mobile keyboard or safe-area behavior. No complete independent WCAG audit or physical-device test has been performed.

## Email deadlock: UNVERIFIED

No speculative runtime email-worker fix was made. The new disposable concurrency test pauses claim acquisition at a controlled barrier, verifies actual contention through performance_schema.data_lock_waits, then releases it. Both workers preserve distinct idempotency keys and deliver each fake-provider job once. Existing integration cases cover NOT_SENT, UNKNOWN, ACCEPTED, takeover, lease fencing, provider-response loss and commit uncertainty. A historical transient ER_LOCK_DEADLOCK was not reproduced with a proven root cause under the controlled schedule; passing runs do not establish its absence. If reproduced, capture SHOW ENGINE INNODB STATUS and the lock graph before considering a bounded acquisition-only transaction retry. Never blindly retry a provider HTTP send.

## Cleanup proof and boundaries

Commands: npm run db:purge-demo (read-only default) and npm run db:purge-demo:assets (separate metadata plan by default). Exact known seed/private markers or validated synthetic registry entries establish confirmed demo roots; titles or reserved email domains alone establish only possible demo. Unmarked real data is retained. All ADMIN accounts, including seeded and SUSPENDED, are protected byte-for-byte. Mixed business references require separate exact row checksum approval; real roots cannot be silently promoted into deletion scope.

The fixture deletes 4 independently confirmed demo items and 1 demo USER. Three ADMIN accounts (2 ACTIVE, 1 SUSPENDED) remain identical; both ACTIVE ADMIN login checks pass; 2 real items remain. Deleted related-row counts: item_images 2; activity_logs, ai_visual_candidates, ai_visual_jobs, ai_visual_notification_decisions, ai_visual_notification_outbox, ai_visual_notification_preferences, ai_visual_pair_alerts, ai_visual_snapshot_results, ai_visual_snapshots, claims, conversations, email_outbox, item_image_embeddings, matches, messages, notifications, password_reset_tokens and reports each 1; ai_visual_demo_entities 2. Cloudinary deletion=NOT_EXECUTED.

Tests verify read-only SQL, masked reports, all ADMIN fields/credentials/roles/status/session preservation, exact target/manifests, stale same-count data, new relationships, unapproved mixed links, real contributions, forged/ADMIN targets, rollback after partial deletion, FK-safe order, shared assets and idempotent empty second dry-run/execute. Asset unit tests verify committed receipt checksums, immutable asset identity/version, current references, wrong confirmation/cloud, partial failure and retry without repeating successful deletion.

There are NO production counts, manifests, backup/restore proof or deletion results in this report. Production read itself requires authorization. Before deletion: verify current provider configuration, restorable persistent backup and isolated restore (including ADMIN), approve an exact fresh DB manifest and maintenance window. Asset deletion requires a separate exact public-ID plan approval and an asset recovery strategy. JSON backup attestations are guards; they do not automate or prove the real backup/restore operation. See runbook for uncertain COMMIT reconciliation. Tools conservatively stop at 10,000 rows/table or unexpected schema; expanding scope needs review.

## Release status and limitations

Prepared for Draft PR review, not a production-readiness claim. Hosting evidence currently consists of historical GitHub statuses/deployments naming Vercel findit-campus and Railway awake-illumination services. Current provider flags, db-backup scheduling/persistent volume, fresh backup/restore and production environment values have not been verified. No production database read, real email, automatic production AI notification enablement, merge, production deployment, environment change or production cleanup was performed.

Deploy backend API before frontend after approval: the new frontend requires /suggestions. A frontend Preview backed by an old production API cannot validate the new private suggestion flow. Preserve the old frontend/API SHA and roll back application revisions together if needed; no schema rollback is required. Real CLIP inference used controlled images, including synthetic fixtures, so its passing ranking checks are not a field accuracy/calibration study.

GitHub Draft PR, Actions and Vercel Preview results will be recorded on the PR after the committed head is published. Follow-up approvals are concrete: (1) review/merge and production deployment, (2) authorized production metadata/DB read plus backup/restore and exact DB manifest deletion, (3) separate exact Cloudinary asset deletion. No production action is implied by a green local or CI result.

## Commit and file inventory

- 76bb814 fix(chat): keep mobile composer clear of navigation and viewport
- 83c8007 feat(suggestions): unify owner matching with deduplication before pagination
- 6d529ff feat(ai): expose reverse visual suggestions to FOUND owners
- c124bd7 feat(maintenance): add verified demo purge preserving all ADMIN accounts
- 6c969a1 test(regression): verify email contention and final suggestion contracts

The documentation handoff is committed separately after these verified implementation commits.

- `README.md`
- `TASK_DECOMPOSITION.md`
- `client/README.md`
- `client/scripts/ai-real-browser-check.mjs`
- `client/scripts/ai-ui-browser-check.mjs`
- `client/scripts/browser-check.mjs`
- `client/scripts/chat-layout-check.mjs`
- `client/scripts/feature-browser-check.mjs`
- `client/src/components/Layout.tsx`
- `client/src/components/VisualSuggestions.test.tsx`
- `client/src/components/VisualSuggestions.tsx`
- `client/src/lib/types.ts`
- `client/src/lib/visual-suggestions.test.ts`
- `client/src/lib/visual-suggestions.ts`
- `client/src/pages/ItemDetailPage.test.tsx`
- `client/src/pages/ItemDetailPage.tsx`
- `client/src/pages/MessagesPage.tsx`
- `client/src/redesign.css`
- `database/scripts/config.js`
- `database/scripts/demo-assets.js`
- `database/scripts/demo-purge.js`
- `database/scripts/purge-demo-assets.js`
- `database/scripts/purge-demo-data.js`
- `database/scripts/seed-guard.js`
- `database/scripts/test-isolated.js`
- `database/seeds/sample.js`
- `database/tests/demo-assets.test.js`
- `database/tests/purge-demo.integration.js`
- `database/tests/purge-demo.test.js`
- `docs/DEMO-CLEANUP-RUNBOOK.md`
- `docs/PRODUCTION-POLISH-VERIFICATION.md`
- `docs/api-contract.md`
- `package.json`
- `server/AI-VISUAL-MATCHING.md`
- `server/FRONTEND-API.md`
- `server/app.js`
- `server/controllers/suggestions.controller.js`
- `server/repositories/suggestions.repository.js`
- `server/repositories/visual-suggestions.repository.js`
- `server/routes/index.js`
- `server/routes/item.routes.js`
- `server/server.js`
- `server/services/suggestions.service.js`
- `server/services/visual-suggestions.service.js`
- `server/tests/ai-real-e2e.js`
- `server/tests/email-concurrency.integration.js`
- `server/tests/full-runtime-browser.js`
- `server/tests/items.integration.js`
- `server/tests/suggestions.test.js`
- `server/tests/visual-suggestions.integration.js`
