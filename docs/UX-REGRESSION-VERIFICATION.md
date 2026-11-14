# FindIt UX regression verification

Date: 2026-11-14. Base: latest fetched origin/main `fbd96a1d6b8c3e7d0c298f17b335aed34702589e` (PR #17 merged). Branch: `fix/findit-ux-regression`. Initial working tree was clean. The provided seven-issue request and all six images in Các lỗi.docx were inspected. Scope is Web_Application_New only. Local commits only; STOP before push. No production/provider changes.

## Issue outcomes and root causes

| Issue | Status | Reproduced cause and implemented behavior |
| --- | --- | --- |
| 1 Upload status | FIXED locally | The wizard displayed local object URLs before any upload, labeled all selected files “Chờ tải lên”, and tracked one global File array. Catch-path reconciliation cleared the whole array merely when image counts differed. Each entry now has stable identity/attempt and pending/uploading/saved/failed/uncertain state. Only an acknowledged valid server image marks that entry saved. Concurrent callbacks update by key, never index; successful images are retained and retry sends only failures. The existing upload 503 admission refusal is retryable; lost/500/unconfirmed responses block blind resend and require checking saved images. No image limits/formats/sizes changed. |
| 2 Location | FIXED locally | The form uses a native select with numeric option IDs, not an autocomplete/debounce. Validation errors were stored until another submit, so the invalid-location message remained after a valid selection. Field changes now revalidate the affected existing error against current fields. ID/label selection remains native and canonical; label text cannot replace the ID. Blur/keyboard/step return and actual submitted ID pass. No evidence of a stale autocomplete request exists in this implementation. |
| 3 Preview images | FIXED | A horizontal image strip had no arrows or current-image state. Replaced only the preview strip with a bounded object-fit contain carousel: arrows, position counter, keyboard and horizontal swipe; controls omitted for one image. Selection uses stable keys and survives step return; removed keys fall back to a remaining image. Removed/unmounted object URLs are revoked. |
| 4 Preview labels | FIXED | Category/color were concatenated and description lacked an explicit label. Structured definition-list fields now label category, optional color, location, LOST/FOUND event date and description; title/type remain the heading/badge. Values come from the same form fields/lookup IDs used for submit; whitespace is trimmed consistently. |
| 5 Matching notifications | FIXED | Notification rows had only mark-read actions and the public DTO intentionally omitted internal event keys; there was no target navigation. New recipient-scoped GET /notifications/:id/target resolves durable event metadata against current records/permissions. Router navigation opens the recipient's own LOST/FOUND suggestions, waits for the loaded panel, then focuses and marks read. Failure/legacy missing metadata does not mark read or guess an Item ID. |
| 6 Approved Claim | FIXED | There was no notification destination and approved Claim history lacked a clear contact CTA. The resolver checks claimant versus FOUND owner and current Claim/Item state; APPROVED opens the correct FOUND contact action. Existing authorized conversation creation occurs only on explicit click. Hidden/completed/rejected state falls back to the claimant's exact history page. NEW_CLAIM opens the FOUND owner's received list. No evidence or contact identifiers are placed in URLs. |
| 7 Suggestions ownership | FIXED | The private unified panel was already gated, but the “Gợi ý cho bạn” tab/empty section was rendered for non-owners. The legacy /matches HTTP API also allowed any authenticated reader. Entire suggestion UI is now absent for non-owner/guest/Admin. Legacy HTTP matching checks ownership before and after snapshot reading, with no ADMIN bypass; unified/visual endpoints remain owner-only. Internal matching list tooling is not exposed as an HTTP route. |

The original intermittent production events for issues 1/2 had no HAR/server trace supplied. The reproduced local UI/state defects and required acceptance paths were fixed and tested; this is not a claim that every possible historical production failure has been diagnosed.

## Baseline and final checks

Windows, Node 24.21.0, npm 11.19.0, MySQL 8.0.46; existing dependencies retained. No dependency or lockfile changes. Every DB test uses a fresh verified disposable MySQL datadir; installed MySQL80 and production data are untouched. Providers are synthetic/injected, no real mail or Cloudinary operations.

| Suite | Fresh baseline | Final |
| --- | --- | --- |
| Frontend Vitest | 85 PASS | 103 PASS |
| TypeScript / Prettier | PASS | PASS |
| Backend unit | 176 PASS | 179 PASS |
| Auth unit | 7 PASS | 7 PASS |
| Database unit | 17 PASS | 17 PASS |
| Complete isolated MySQL integration | 393 PASS | 395 PASS |
| Existing + extended browser workflow | 19 PASS | 19 PASS, including new UX browser assertions |
| Chat/account/reset browser | Prior verified baseline retained | 13 PASS; mobile composer long-history hit tests retained |
| Pinned real CLIP E2E | Prior verified baseline retained | 9 PASS, LOST + FOUND reverse |
| Full application/runtime browser | Prior verified baseline retained | 1 PASS; actual Socket.IO delivery, app console 0, HTTP 0 |
| Frontend production build | Baseline browser test-mode build PASS | Production mode PASS with explicit example HTTPS API, AI enabled, preview fixture=false |
| Changed JS syntax / credential patterns / diff whitespace | clean | PASS |
| Migrations / cleanup tooling / lockfiles / thresholds | existing | unchanged |

Commands: root `npm test`, `npm run test:integration:isolated`, `npm run test:ai-real-e2e`, `npm run test:browser:runtime`; client `npm test`, `npm run typecheck`, `npm run format:check`, `npm run test:browser`, `npm run build`. CLIP used the existing pinned OS-temp model cache, with no model download. Account browser uses the existing FINDIT_FEATURE_BROWSER mode after a test-mode build with /api and fixture=false.

## Before and after evidence

- Added non-owner UI assertions first: all three USER/ADMIN/guest cases failed on the baseline, then passed after removing the entire private tab/section. Both LOST/FOUND are now covered symmetrically.
- New async unit tests assert out-of-order completion, delayed acknowledgement, retry only failed image, no local-preview success, unknown outcomes excluded from retry, stale attempts ignored and removed entries never resurrected.
- Location/browser tests submit an invalid form, choose an option with Home/ArrowDown/Enter, blur, verify the stale error clears, return through steps and confirm the actual backend locationId.
- Browser preview checks 1/2/3/5 images, arrows/counter, keyboard, synthetic swipe, add/remove/back transitions and overflow at 1440x900, 390x844 and 360x844.
- Five concurrent uploads hold server responses behind controlled gates. Even accepted server uploads remain “uploading” until their response arrives. Replies are released out of order; one exact 503 admission refusal is retried. Database assertions prove one Item and five images, with all object URLs revoked.
- Notification tests cover both owner directions, delayed suggestions before mark-read, destination 503 preserving unread, missing legacy metadata preserving unread, NEW_CLAIM owner view, approved Claim -> correct FOUND -> allowed conversation, completed Claim -> focused own history, and account switching without old suggestions.
- Direct HTTP tests reject non-owner and ADMIN access to /suggestions, /visual-suggestions and legacy /matches. Positive owner DTO/privacy/pagination assertions remain; old any-auth 200 expectations were deliberately tightened to 404, not removed. Existing Claim evidence and workflow tests remain.
- The first new browser-harness runs failed because its fixture omitted confirmPassword, a synthetic TouchInit was incomplete, or an import bypassed the package's supported entry. Those test-harness faults were corrected; application assertions were retained.

## Browser diagnostics and screenshots

Artifacts are ignored under `.cache/frontend-browser/ux-regression/`: preview-1440/390/360.png, upload-partial-retry-360.png, matching-arrival-1440/390/360.png, claim-contact-1440/390/360.png and non-owner-found-1440/390.png. The contact CTA is hit-tested and at least 44px high at all three widths. The posting retry and carousel controls are exercised through actual browser clicks. Existing `.cache/feature-browser/chat-hit-test-*.png` and `.cache/frontend-browser/full-runtime/` retain chat/runtime evidence. These are synthetic local test screenshots, not production captures, and are not committed.

The Item API fixture has real DB/auth/image-storage adapter and HTTP chat services but no Socket.IO server. Known socket transport diagnostics are counted separately in UX_BROWSER_PASS; only exact intentionally injected 503/404 URLs are excluded from application errors. Final UX run reports unexpected application HTTP=0 and page/console=0. A separate full-runtime test includes the actual Socket.IO server and reports app console=0, HTTP=0, real connection/message delivery. External fonts are intentionally blocked/faked in local harnesses. Physical touch/keyboard/safe-area devices, Firefox/Safari and a full accessibility certification remain unverified.

## Compatibility and handoff

No migrations, published schema, cleanup scripts, image limits, AI ranking/thresholds, production feature flags or email-worker behavior changed. Backend adds /notifications/:id/target and tightens /matches authorization; publish the compatible backend before the new frontend in a separately approved release. See updated docs/api-contract.md and server/FRONTEND-API.md. Existing email concurrency coverage passes, but the prior intermittent email deadlock remains UNVERIFIED and is outside these seven UX fixes. Synthetic CLIP tests prove pipeline behavior, not real-photo field accuracy.

No push, PR modification, merge, deployment, production DB read/mutation, Cloudinary deletion, production email or ADMIN credential/status/session change was performed. No GitHub Actions or Vercel Preview run was requested for this unpushed branch. The old repository was not modified. Final status: READY FOR PUSH REVIEW, pending user approval before push.

## Local commit and changed file inventory

- 504c8b5 fix(suggestions): hide owner-only sections from other viewers
- 467ec66 fix(posting): reconcile uploads and preserve labeled multi-image preview
- d06ea67 fix(suggestions): restrict legacy matching API to the current owner
- be219d4 fix(notifications): resolve authorized matching and Claim destinations
- da76530 test(ux): cover posting races and notification navigation in browser

The final responsive evidence/report update is committed after the implementation commits above. No commit is pushed.

- `TASK_DECOMPOSITION.md`
- `client/scripts/browser-check.mjs`
- `client/scripts/ux-regression-check.mjs`
- `client/src/components/ImageCarousel.test.tsx`
- `client/src/components/ImageCarousel.tsx`
- `client/src/components/VisualSuggestions.tsx`
- `client/src/lib/image-uploads.test.ts`
- `client/src/lib/image-uploads.ts`
- `client/src/lib/item-form.test.ts`
- `client/src/lib/item-form.ts`
- `client/src/lib/notification-navigation.test.ts`
- `client/src/lib/notification-navigation.ts`
- `client/src/pages/Claims.tsx`
- `client/src/pages/ItemDetailPage.test.tsx`
- `client/src/pages/ItemDetailPage.tsx`
- `client/src/pages/ItemFormPage.tsx`
- `client/src/pages/NotificationsPage.tsx`
- `client/src/redesign.css`
- `docs/UX-REGRESSION-VERIFICATION.md`
- `docs/api-contract.md`
- `server/FRONTEND-API.md`
- `server/controllers/matching.controller.js`
- `server/controllers/notification.controller.js`
- `server/repositories/matching.repository.js`
- `server/repositories/notification.repository.js`
- `server/routes/notification.routes.js`
- `server/services/matching.service.js`
- `server/services/notification.service.js`
- `server/tests/claims.integration.js`
- `server/tests/items.integration.js`
- `server/tests/matching.integration.js`
- `server/tests/matching.test.js`
- `server/tests/notification-navigation.test.js`
- `server/tests/pagination-audit.integration.js`
- `server/tests/pagination-audit.test.js`
- `server/tests/security.integration.js`
- `server/tests/workflow.integration.js`
