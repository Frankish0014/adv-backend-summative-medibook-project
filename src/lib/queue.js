// Part E - Redis-list based queues.
//
//   queue:jobs              pending jobs (JSON)              producers RPUSH, worker BLMOVEs from the left
//   queue:jobs:processing   jobs currently being worked on   (a crash leaves the job here, never lost)
//   queue:jobs:dead         jobs that failed MAX_ATTEMPTS times
//   waitlist:<doctorId>:<YYYY-MM-DD>   FIFO waitlist per doctor-day (JSON entries)
//   waitlist:failed         waitlist entries that could not be promoted (kept for follow-up)
const { redis } = require('./redis');

const KEYS = {
  jobs: 'queue:jobs',
  processing: 'queue:jobs:processing',
  dead: 'queue:jobs:dead',
  failedWaitlist: 'waitlist:failed',
};
const waitlistKey = (doctorId, day) => `waitlist:${doctorId}:${day}`;
const MAX_ATTEMPTS = 3;

async function connectIfNeeded(client = redis) {
  if (client.status === 'wait' || client.status === 'end') await client.connect();
}

async function enqueueJob(type, payload) {
  await connectIfNeeded();
  const job = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, type, payload, attempts: 0 };
  await redis.rpush(KEYS.jobs, JSON.stringify(job));
  return job;
}

// ---- waitlist -------------------------------------------------------------
async function waitlistEntries(doctorId, day) {
  await connectIfNeeded();
  const raw = await redis.lrange(waitlistKey(doctorId, day), 0, -1);
  return raw.map((r) => ({ raw: r, entry: JSON.parse(r) }));
}

async function joinWaitlist(entry) {
  await connectIfNeeded();
  const key = waitlistKey(entry.doctorId, entry.datetime.slice(0, 10));
  await redis.rpush(key, JSON.stringify(entry));
  return redis.llen(key);
}

/** Position (1-based) of the patient/slot in the queue, or 0 if absent. */
async function waitlistPosition(doctorId, day, patientId, datetime) {
  const entries = await waitlistEntries(doctorId, day);
  const idx = entries.findIndex(({ entry }) => entry.patientId === patientId && entry.datetime === datetime);
  return idx + 1;
}

module.exports = {
  KEYS, MAX_ATTEMPTS, waitlistKey, connectIfNeeded,
  enqueueJob, waitlistEntries, joinWaitlist, waitlistPosition,
};
