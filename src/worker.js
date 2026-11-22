// Part E - background worker (run separately from the web server: `npm run worker`).
//
// Reliable-queue pattern: BLMOVE atomically moves a job from queue:jobs to queue:jobs:processing.
// The job is removed from `processing` only after the handler finished, so a crash never loses it.
// A failing job is retried up to MAX_ATTEMPTS times, then moved to queue:jobs:dead.
require('dotenv').config();
const { createClient } = require('./lib/redis');
const queue = require('./lib/queue');
const { audit } = require('./lib/auditLogger');
const { promoteWaitlist } = require('./services/appointmentService');
const { pool } = require('./config/db');

const handlers = {
  // Confirmation "SMS/email": nothing is really sent, the message is written to the audit log.
  async 'notify.confirmation'(p) {
    await audit('notification.sent', {
      channel: p.channel,
      to: p.to,
      appointmentId: p.appointmentId,
      message: `Hello ${p.patientName}, your appointment with ${p.doctorName} on ${p.datetime} is confirmed.`,
    });
  },

  async 'waitlist.promote'(p) {
    await promoteWaitlist(p);
  },
};

async function processJob(raw, client) {
  const job = JSON.parse(raw);
  const handler = handlers[job.type];
  try {
    if (!handler) throw new Error(`unknown job type ${job.type}`);
    await handler(job.payload);
    await client.lrem(queue.KEYS.processing, 1, raw);
  } catch (err) {
    console.error(`[worker] job ${job.id} (${job.type}) failed:`, err.message);
    job.attempts += 1;
    // Re-queue (or dead-letter) BEFORE removing the old copy from `processing`.
    if (job.attempts >= queue.MAX_ATTEMPTS) {
      await client.rpush(queue.KEYS.dead, JSON.stringify({ ...job, error: err.message }));
      await audit('job.dead', { jobId: job.id, type: job.type, error: err.message });
    } else {
      await new Promise((r) => setTimeout(r, 500 * job.attempts)); // small back-off
      await client.rpush(queue.KEYS.jobs, JSON.stringify(job));
    }
    await client.lrem(queue.KEYS.processing, 1, raw);
  }
}

async function main() {
  const client = createClient();        // dedicated connection: BLMOVE blocks it
  await client.connect();
  const shared = require('./lib/redis').redis; // used by the service for LREM / RPUSH
  await shared.connect();

  // Jobs left in `processing` by a crashed worker go back to the queue first.
  const stuck = await client.lrange(queue.KEYS.processing, 0, -1);
  for (const raw of stuck) {
    await client.rpush(queue.KEYS.jobs, raw);
    await client.lrem(queue.KEYS.processing, 1, raw);
  }
  console.log(`MediBook worker started (recovered ${stuck.length} unfinished job(s))`);

  let running = true;
  const stop = () => { running = false; client.disconnect(); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  while (running) {
    try {
      const raw = await client.blmove(queue.KEYS.jobs, queue.KEYS.processing, 'LEFT', 'RIGHT', 5);
      if (raw) await processJob(raw, client);
    } catch (err) {
      if (!running) break;
      console.error('[worker] loop error:', err.message);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  shared.disconnect();
  await pool.end();
}

main().catch((err) => { console.error('Worker failed to start:', err.message); process.exit(1); });
