import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { assertIsolatedInstance } from '../scripts/assert-isolated.js';
import { configFromEnv } from '../scripts/config.js';
import { connect } from '../scripts/connection.js';
import { migrate } from '../scripts/migrate.js';
import { seed } from '../seeds/sample.js';
import {
  checksum,
  readPurgeSnapshot,
  dryRunPurge,
  executePurge,
  buildPurgeManifest,
} from '../scripts/demo-purge.js';
import { createDbPool } from '../../server/config/db.js';
import { createAuthService } from '../../server/services/auth.service.js';
import { createUserRepository } from '../../server/repositories/user.repository.js';
import { createTokenService } from '../../server/utils/jwt.js';
await assertIsolatedInstance();
test(
  'demo purge: exact manifests, related review, rollback, ADMIN preservation and idempotency on disposable MySQL',
  { timeout: 120000 },
  async (t) => {
    const base = configFromEnv(),
      name = 'findit_test_' + randomBytes(12).toString('hex');
    const c = await connect(base, false);
    let pool,
      created = false;
    const password = 'Local-only-purge-password123';
    try {
      await c.query('CREATE DATABASE ' + name + ' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci');
      created = true;
      await c.query('USE ' + name);
      await migrate(c, name);
      await seed(c, name, {
        USER: { email: 'demo-user@purge.example.test', password },
        ADMIN: { email: 'demo-admin@purge.example.test', password },
      });
      const [[user]] = await c.query(
        "SELECT user_id,role_id FROM users WHERE full_name='FindIT Sample USER'",
      );
      const [[admin]] = await c.query(
        "SELECT user_id,role_id FROM users WHERE full_name='FindIT Sample ADMIN'",
      );
      const hash = await bcrypt.hash(password, 10);
      async function account(role, email, status = 'ACTIVE') {
        const [r] = await c.query(
          "INSERT INTO users(role_id,full_name,email,password_hash,account_status,created_at,updated_at) VALUES(?,'Retained fixture',?,?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP())",
          [role, email, hash, status],
        );
        return String(r.insertId);
      }
      const realAdmin = await account(admin.role_id, 'admin@campus.example'),
        suspendedAdmin = await account(admin.role_id, 'suspended@campus.example', 'SUSPENDED');
      const realUser = await account(user.role_id, 'real@campus.example'),
        possibleUser = await account(user.role_id, 'only-domain@example.test');
      const item = async (owner, title, type = 'FOUND') => {
        const [r] = await c.query(
          "INSERT INTO items(user_id,category_id,location_id,title,description,type,event_date,created_at,updated_at) VALUES(?,1,1,?,'Retained data',?,'2026-11-01',UTC_TIMESTAMP(),UTC_TIMESTAMP())",
          [owner, title, type],
        );
        return String(r.insertId);
      };
      const realAdminItem = await item(realAdmin, 'Real ADMIN item'),
        realItem = await item(realUser, 'Real user item');
      const image = async (itemId, publicId) => {
        const [r] = await c.query(
          'INSERT INTO item_images(item_id,image_url,cloudinary_public_id,created_at) VALUES(?,?,?,UTC_TIMESTAMP())',
          [itemId, 'https://res.cloudinary.com/findit-test/image/upload/v1/' + publicId + '.png', publicId],
        );
        return String(r.insertId);
      };
      const demoPublic = 'findit/items/' + randomUUID(),
        sharedPublic = 'findit/items/' + randomUUID();
      const demoImage = await image(1, demoPublic),
        adminDemoImage = await image(2, sharedPublic);
      await image(realAdminItem, sharedPublic);
      const vector = Buffer.alloc(2048);
      vector.writeFloatLE(1);
      await c.query(
        "INSERT INTO item_image_embeddings(image_id,model_id,model_revision,dimensions,embedding_data,created_at) VALUES(?,'fixture','revision',512,?,UTC_TIMESTAMP())",
        [demoImage, vector],
      );
      await c.query(
        "INSERT INTO ai_visual_jobs(image_id,model_id,model_revision,status,attempts,available_at,created_at,updated_at) VALUES(?,'fixture','revision','COMPLETED',1,UTC_TIMESTAMP(),UTC_TIMESTAMP(),UTC_TIMESTAMP())",
        [demoImage],
      );
      await c.query(
        "INSERT INTO ai_visual_candidates(lost_item_id,found_item_id,model_id,model_revision,cosine_score,updated_at) VALUES(1,2,'fixture','revision',0.9,UTC_TIMESTAMP())",
      );
      const [snapshot] = await c.query(
        "INSERT INTO ai_visual_snapshots(lost_item_id,generation,state,model_id,model_revision,policy_version,input_hash,manifest,created_at,updated_at) VALUES(1,1,'COMPLETE','fixture','revision','test',?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP())",
        [
          'a'.repeat(64),
          JSON.stringify({
            lost: { id: '1', owner: String(user.user_id), images: [demoImage] },
            found: [{ id: '2', owner: String(admin.user_id), images: [adminDemoImage] }],
          }),
        ],
      );
      await c.query(
        'INSERT INTO ai_visual_snapshot_results(snapshot_id,found_item_id,cosine_score,created_at) VALUES(?,2,0.9,UTC_TIMESTAMP())',
        [snapshot.insertId],
      );
      const [decision] = await c.query(
        "INSERT INTO ai_visual_notification_decisions(snapshot_id,recipient_id,lost_item_id,found_item_id,policy_version,disposition,reason_code,event_key,created_at) VALUES(?,?,1,2,'test','DEMO_ELIGIBLE','TEST','demo-event',UTC_TIMESTAMP())",
        [snapshot.insertId, user.user_id],
      );
      await c.query(
        "INSERT INTO ai_visual_notification_outbox(decision_id,event_key,available_at,created_at,updated_at) VALUES(?,'demo-event',UTC_TIMESTAMP(),UTC_TIMESTAMP(),UTC_TIMESTAMP())",
        [decision.insertId],
      );
      await c.query(
        "INSERT INTO ai_visual_pair_alerts(recipient_id,lost_item_id,found_item_id,event_key,delivered_at) VALUES(?,1,2,'demo-event',UTC_TIMESTAMP())",
        [user.user_id],
      );
      const run = randomUUID();
      await c.query(
        "INSERT INTO ai_visual_demo_entities(run_id,user_id,item_id,entity_role,created_at) VALUES(?,?,NULL,'FOUND_OWNER',UTC_TIMESTAMP()),(?,?,2,'FOUND_ITEM',UTC_TIMESTAMP())",
        [run, admin.user_id, run, admin.user_id],
      );
      await c.query(
        'INSERT INTO ai_visual_notification_preferences(user_id,enabled,updated_at) VALUES(?,FALSE,UTC_TIMESTAMP()),(?,FALSE,UTC_TIMESTAMP())',
        [user.user_id, admin.user_id],
      );
      await c.query(
        'INSERT INTO password_reset_tokens(token_hash,user_id,expires_at,created_at) VALUES(?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 HOUR),UTC_TIMESTAMP()),(?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 HOUR),UTC_TIMESTAMP())',
        ['a'.repeat(64), user.user_id, 'b'.repeat(64), admin.user_id],
      );
      const [match] = await c.query(
        "INSERT INTO matches(lost_item_id,found_item_id,match_score,status,created_at) VALUES(1,?,80,'POTENTIAL',UTC_TIMESTAMP())",
        [realItem],
      );
      await c.query(
        "INSERT INTO claims(claimant_id,item_id,proof_description,submitted_at) VALUES(?,2,'Synthetic reviewed evidence',UTC_TIMESTAMP())",
        [realUser],
      );
      const [conversation] = await c.query(
        'INSERT INTO conversations(user_low,user_high,created_at,updated_at) VALUES(?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP())',
        [user.user_id, realUser],
      );
      await c.query(
        "INSERT INTO messages(conversation_id,sender_id,client_id,content,created_at) VALUES(?,?,?,'Synthetic reviewed chat',UTC_TIMESTAMP())",
        [conversation.insertId, realUser, randomUUID()],
      );
      await c.query(
        'INSERT INTO email_outbox(user_id,event_key,payload,next_attempt_at,created_at) VALUES(?,?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP())',
        [realUser, 'MATCH:' + match.insertId, JSON.stringify({ itemId: '1' })],
      );
      await c.query(
        "INSERT INTO notifications(user_id,type,message,event_key,created_at) VALUES(?,'NEW_MATCH','Synthetic reviewed notification',?,UTC_TIMESTAMP())",
        [realUser, 'NEW_MATCH:' + match.insertId],
      );
      await c.query(
        "INSERT INTO reports(reporter_id,target_type,item_id,reason,created_at) VALUES(?,'ITEM',2,'Synthetic review',UTC_TIMESTAMP())",
        [realUser],
      );
      await c.query(
        "INSERT INTO activity_logs(user_id,action,entity_type,entity_id,details,created_at) VALUES(?,'ITEM_MODERATED_CLOSED','ITEM',2,?,UTC_TIMESTAMP())",
        [realAdmin, JSON.stringify({ reason: 'Synthetic reviewed audit' })],
      );
      pool = createDbPool({ ...base, database: name });
      const auth = createAuthService(
        createUserRepository(pool),
        createTokenService({ secret: randomBytes(32).toString('hex'), expiresIn: 3600 }),
      );
      const original = await readPurgeSnapshot(c);
      const beforeAdmins = original.records.users.filter(
        (row) => String(row.role_id) === String(admin.role_id),
      );
      let manifest;
      const execute = (m, extra = {}) =>
        executePurge(c, m, {
          confirm: m.fingerprint,
          targetFingerprint: m.targetFingerprint,
          maintenance: true,
          isolated: true,
          ...extra,
        });
      await t.test(
        'dry-run is read-only, masks PII and protects every ADMIN including seed/suspended',
        async () => {
          const statements = [];
          const readonly = {
            query: async (...args) => {
              statements.push(typeof args[0] === 'string' ? args[0] : args[0].sql);
              return c.query(...args);
            },
            execute: async (...args) => {
              statements.push(typeof args[0] === 'string' ? args[0] : args[0].sql);
              return c.execute(...args);
            },
            rollback: () => c.rollback(),
          };
          manifest = await dryRunPurge(readonly);
          assert.ok(
            statements.every((sql) => !/^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|REPLACE)/i.test(sql)),
          );
          assert.equal(checksum(original.records), checksum((await readPurgeSnapshot(c)).records));
          assert.equal(manifest.adminCountBefore, 3);
          assert.equal(manifest.adminCountAfter, 3);
          assert.deepEqual(manifest.adminOwnedDemoItems, ['2', '4']);
          assert.ok(
            !manifest.targets.some(
              (row) =>
                row.table === 'users' && beforeAdmins.some((admin) => String(admin.user_id) === row.id),
            ),
          );
          const report = JSON.stringify(manifest);
          assert.ok(!report.includes('demo-admin@purge.example.test'));
          assert.ok(!report.includes(hash));
          assert.ok(!report.includes('a'.repeat(64)));
          assert.ok(manifest.classifications.possible.some((row) => row.id === possibleUser));
        },
      );
      await t.test(
        'mixed Match/Claim/chat/email/notification/report/audit dependencies block execute until independently reviewed',
        async () => {
          for (const table of [
            'matches',
            'claims',
            'conversations',
            'messages',
            'email_outbox',
            'notifications',
            'reports',
            'activity_logs',
          ])
            assert.ok(
              manifest.reviewRequired.some((row) => row.table === table),
              table,
            );
          await assert.rejects(() => execute(manifest), /independent review/);
          assert.equal(checksum(original.records), checksum((await readPurgeSnapshot(c)).records));
        },
      );
      await t.test('wrong confirmation, target or forged same-count manifest is refused', async () => {
        await assert.rejects(() => execute(manifest, { confirm: '0'.repeat(64) }), /mismatch/);
        await assert.rejects(() => execute(manifest, { targetFingerprint: '0'.repeat(64) }), /mismatch/);
        const forged = structuredClone(manifest);
        forged.targets[0].id = '999';
        await assert.rejects(() => execute(forged), /mismatch/);
      });
      await t.test('ADMIN targets/role/session/credentials cannot be approved indirectly', async () => {
        assert.throws(
          () =>
            buildPurgeManifest(original, {
              approvedRelated: [
                {
                  table: 'users',
                  id: String(admin.user_id),
                  rowChecksum: checksum(
                    beforeAdmins.find((row) => String(row.user_id) === String(admin.user_id)),
                  ),
                  reason: 'Synthetic attempted ADMIN deletion',
                },
              ],
            }),
          /Protected/,
        );
      });
      await t.test('unmarked real contribution of a demo USER blocks account deletion', async () => {
        const retained = await item(user.user_id, 'Real contribution of demo user');
        const blocked = await dryRunPurge(c);
        assert.ok(blocked.reviewRequired.some((row) => row.table === 'items' && row.id === retained));
        await assert.rejects(() => execute(blocked), /independent review/);
        await c.query('DELETE FROM items WHERE item_id=?', [retained]);
      });
      await t.test('exact related approval never expands roots to unconfirmed real items', async () => {
        assert.throws(
          () =>
            buildPurgeManifest(original, {
              approvedRelated: [
                {
                  table: 'items',
                  id: realItem,
                  rowChecksum: checksum(
                    original.records.items.find((row) => String(row.item_id) === realItem),
                  ),
                  reason: 'Not independently confirmed demo',
                },
              ],
            }),
          /real root/,
        );
        const approved = manifest.reviewRequired.map((row) => ({
          table: row.table,
          id: row.id,
          rowChecksum: row.rowChecksum,
          reason: 'Independently reviewed synthetic integration fixture',
        }));
        manifest = await dryRunPurge(c, { approvedRelated: approved });
        assert.equal(manifest.reviewRequired.length, 0);
      });
      await t.test('new relationship or changed row after dry-run requires a fresh manifest', async () => {
        const [log] = await c.query(
          "INSERT INTO activity_logs(action,entity_type,entity_id,created_at) VALUES('TEST','ITEM',2,UTC_TIMESTAMP())",
        );
        await assert.rejects(() => execute(manifest), /changed/);
        await c.query('DELETE FROM activity_logs WHERE log_id=?', [log.insertId]);
        await c.query("UPDATE items SET title='Changed demo' WHERE item_id=1");
        await assert.rejects(() => execute(manifest), /changed/);
        await c.query('UPDATE items SET title=? WHERE item_id=1', [
          original.records.items.find((row) => String(row.item_id) === '1').title,
        ]);
      });
      await t.test('injected failure rolls back every delete and preserves ADMIN byte-for-byte', async () => {
        let n = 0;
        await assert.rejects(
          () =>
            execute(manifest, {
              beforeDelete() {
                if (++n === 3) throw new Error('Injected rollback');
              },
            }),
          /Injected rollback/,
        );
        assert.equal(checksum(original.records), checksum((await readPurgeSnapshot(c)).records));
      });
      await t.test(
        'assets shared with real item are excluded from the Cloudinary deletion list',
        async () => {
          assert.deepEqual(
            manifest.assets.map((row) => row.publicId),
            [demoPublic],
          );
          assert.ok(manifest.protectedAssets.some((row) => row.publicId === sharedPublic));
        },
      );
      await t.test(
        'approved purge removes demo graph only, preserves all ADMIN fields and ACTIVE ADMIN login',
        async () => {
          const receipt = await execute(manifest);
          assert.equal(receipt.protectedAdmins.length, 3);
          assert.equal(receipt.deleted.items, 4);
          assert.equal(receipt.deleted.users, 1);
          const after = await readPurgeSnapshot(c);
          assert.equal(
            checksum(after.records.users.filter((row) => String(row.role_id) === String(admin.role_id))),
            checksum(beforeAdmins),
          );
          for (const email of ['demo-admin@purge.example.test', 'admin@campus.example'])
            assert.equal((await auth.login({ email, password })).user.role, 'ADMIN');
          assert.equal(
            after.records.users.find((row) => String(row.user_id) === suspendedAdmin).account_status,
            'SUSPENDED',
          );
          assert.ok(
            await bcrypt.compare(
              password,
              after.records.users.find((row) => String(row.user_id) === suspendedAdmin).password_hash,
            ),
          );
          assert.ok(after.records.items.some((row) => String(row.item_id) === realAdminItem));
          assert.ok(after.records.items.some((row) => String(row.item_id) === realItem));
          assert.ok(
            after.records.password_reset_tokens.some((row) => String(row.user_id) === String(admin.user_id)),
          );
          assert.ok(after.records.users.some((row) => String(row.user_id) === possibleUser));
          console.log(
            'PURGE_FIXTURE_COUNTS',
            JSON.stringify({
              deleted: receipt.deleted,
              protectedAdmins: 3,
              retainedRealItems: 2,
              cloudinaryDeletion: 'NOT_EXECUTED',
            }),
          );
        },
      );
      await t.test(
        'second dry-run has zero confirmed roots and execute of new empty manifest is harmless',
        async () => {
          const empty = await dryRunPurge(c);
          assert.equal(empty.roots.length, 0);
          assert.equal(empty.targets.length, 0);
          const before = await readPurgeSnapshot(c);
          await execute(empty);
          assert.equal(checksum(before.records), checksum((await readPurgeSnapshot(c)).records));
          await assert.rejects(() => execute(manifest), /changed/);
        },
      );
    } finally {
      await pool?.end();
      try {
        if (created) await c.query('DROP DATABASE ' + name);
      } finally {
        await c.end();
      }
    }
  },
);
