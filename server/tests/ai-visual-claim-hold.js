import { configFromEnv } from '../../database/scripts/config.js';
import { createDbPool } from '../config/db.js';
import { createAiVisualRepository } from '../ai-visual/repository.js';

const database = process.argv[2];
if (!/^findit_test_[a-f0-9]{24}$/.test(database ?? '')) throw new Error('Expected the owned disposable integration database name');
const pool = createDbPool({ ...configFromEnv(), database });
const job = await createAiVisualRepository(pool).claimNext(3);
if (!job) throw new Error('No queued job was available for the child worker');
process.stdout.write(`${JSON.stringify({ job_id: job.job_id, image_id: job.image_id, lease_token: job.lease_token, model_id: job.model_id, model_revision: job.model_revision })}\n`);
await new Promise(() => {});
