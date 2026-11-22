// Pure slot validation / parsing - no DB, no Redis (unit-testable).
const { WORK_START_HOUR, WORK_END_HOUR, SLOT_MINUTES } = require('../config/constants');

const DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Parses 'YYYY-MM-DD HH:mm[:ss]' (or with a 'T'), as clinic wall-clock time.
 * Returns { date, sql, day } or null when malformed / not a real calendar date.
 */
function parseDateTime(input) {
  if (typeof input !== 'string') return null;
  const m = DATETIME_RE.exec(input.trim());
  if (!m) return null;
  const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4], m[5], m[6] || '0'].map(Number);
  const date = new Date(y, mo - 1, d, h, mi, s);
  if (
    date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d ||
    date.getHours() !== h || date.getMinutes() !== mi || date.getSeconds() !== s
  ) return null; // e.g. 2026-02-31 or 25:00
  const pad = (n) => String(n).padStart(2, '0');
  return {
    date,
    day: `${y}-${pad(mo)}-${pad(d)}`,
    sql: `${y}-${pad(mo)}-${pad(d)} ${pad(h)}:${pad(mi)}:${pad(s)}`,
  };
}

/**
 * Validates a requested slot. Returns { valid: true, parsed } or
 * { valid: false, code, message } (code is MALFORMED | PAST | OUT_OF_HOURS | MISALIGNED).
 * Rules: strictly in the future, 09:00 <= start < 17:00 (so last slot 16:30),
 * minutes 00 or 30, seconds 00.
 */
function validateSlot(input, now = new Date()) {
  const parsed = parseDateTime(input);
  if (!parsed) {
    return { valid: false, code: 'MALFORMED', message: 'datetime must be a valid "YYYY-MM-DD HH:mm" value' };
  }
  const { date } = parsed;
  if (date.getSeconds() !== 0 || date.getMinutes() % SLOT_MINUTES !== 0) {
    return { valid: false, code: 'MISALIGNED', message: `appointments start on a ${SLOT_MINUTES}-minute boundary (e.g. 09:00, 09:30)` };
  }
  const minutesOfDay = date.getHours() * 60 + date.getMinutes();
  const first = WORK_START_HOUR * 60;
  const lastStart = WORK_END_HOUR * 60 - SLOT_MINUTES;
  if (minutesOfDay < first || minutesOfDay > lastStart) {
    return { valid: false, code: 'OUT_OF_HOURS', message: 'appointments must start between 09:00 and 16:30 (clinic closes at 17:00)' };
  }
  if (date.getTime() <= now.getTime()) {
    return { valid: false, code: 'PAST', message: 'appointments can only be booked in the future' };
  }
  return { valid: true, parsed };
}

module.exports = { parseDateTime, validateSlot };
