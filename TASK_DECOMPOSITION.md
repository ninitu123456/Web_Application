# FindIt production polish — task decomposition

Base: origin/main 2acaa53acd85b4fba3ef045ec9ffb5fbed1faf58, fetched 2026-11-14. Scope: Web_Application_New only. Never delete/alter ADMIN accounts; no production mutation, merge or deployment without explicit approval.

Workflow: implement -> targeted verification -> scoped Conventional Commit. Keep published migrations/lockfiles intact unless a necessary dependency change is reviewed. Tests use disposable MySQL, mocked mail/cloud and isolated model cache.

| Task | Acceptance criteria | State |
| --- | --- | --- |
| A. Preparation/baseline | Read requested source/docs; verify Git/dependencies; run all baseline suites; record failures honestly | PASS: baseline frontend 83, backend 173, auth 7, DB 9, integration 380, browser 19, account browser 13, real CLIP 8 |
| B1. Mobile chat | Composer/send never obscured at 360/390/768/1440, short viewport/focus/history/scroll; hit-test regression | PASS: reproduced failure before fix; 13/13 account/browser after fix incl long-history hit tests |
| B2. Email concurrency | Controlled barrier/deadlock evidence before fix; preserve provider snapshot/idempotency/lease states; bounded acquisition-only retry if proven | Pending |
| B3. Documentation/harness | Correct Chat docs; await loaded Home; distinguish intentional harness faults from app console errors | In progress: Chat docs corrected; loaded Home assertion added, final browser verification pending |
| C1. Unified suggestions LOST | One "Gợi ý cho bạn" section; visual + information reasons; dedup across pages without losing records; preserve states/polling/privacy | PASS: owner gate/unit, dedup across pages on MySQL, frontend 84/84, browser 19/19 |
| C2. FOUND suggestions | Owner-only reverse lookup over existing candidates, no Claim changes; contracts/types/tests compatible | Pending |
| D. Product content | Dynamic footer; remove unwanted academic text; preserve honest AI/fixture warnings and build guards | Pending |
| E1. Purge dry-run/manifest | Read-only default, masked report, exact row checksums/target identity, confirmed/possible/admin classification, block unapproved edges | Pending |
| E2. Purge execute/cloud | Explicit reviewed manifest; transactional exact deletion; preserve every ADMIN field/login and real data; separate reviewed Cloudinary asset reconciliation | Pending |
| E3. Seed guard/tests | Refuse production seed/setup demo paths; disposable adversarial integration cases, rollback and idempotency | Pending |
| F. Final regression | Frontend/unit/type/format/build, backend/auth/db, integration/email, browser, real CLIP LOST+FOUND, secret/diff/migration checks | Pending |
| G. Review/CI | Review scoped diff, verified commits, push feature branch, Draft PR, Actions/Preview if access exists | Pending |
| H. Release/cleanup handoff | Concrete release/rollback/backup-restore/dry-run checklist; production DB/Cloudinary deletion NOT performed | Pending |

## Approval boundaries

1. Merge and production deployment require explicit approval after PR/CI/Preview review.
2. Production DB access/dry-run requires explicit authorization; deletion requires verified restorable backup and approval of exact manifest.
3. Cloudinary production deletion requires separate approval of exact public_id list.
4. No ADMIN credential/status/role/session changes; uncertain ownership or changed manifests block execution.

## Evidence

Baseline, final commands/counts, screenshots, limitations and release status will be recorded in docs/PRODUCTION-POLISH-VERIFICATION.md and docs/DEMO-CLEANUP-RUNBOOK.md. Ignored logs/screenshots/model cache must not be committed.

