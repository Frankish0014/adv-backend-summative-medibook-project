// Part D - append-only JSON-lines audit log using the async fs API (no *Sync calls).
require('dotenv').config();
const fs = require('fs/promises');
const path = require('path');

const logPath = () => path.resolve(process.env.AUDIT_LOG_PATH || 'logs/audit.log');

let ensureDirPromise = null;

/** Creates the logs directory on first use. The promise is cached, but a failure is not. */
function ensureDir() {
  if (!ensureDirPromise) {
    ensureDirPromise = fs.mkdir(path.dirname(logPath()), { recursive: true }).catch((err) => {
      ensureDirPromise = null; // retry on the next call
      throw err;
    });
  }
  return ensureDirPromise;
}

/**
 * Appends one JSON line. NEVER rejects: a logging failure is reported on stderr and
 * must not fail the user's request.  Resolves to true/false for tests and callers that care.
 */
async function audit(event, data = {}) {
  try {
    await ensureDir();
    const line = JSON.stringify({ timestamp: new Date().toISOString(), event, ...data }) + '\n';
    await fs.appendFile(logPath(), line, 'utf8');
    return true;
  } catch (err) {
    console.error('[audit] failed to write audit log:', err.message);
    return false;
  }
}

module.exports = { audit };
