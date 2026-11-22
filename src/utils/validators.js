// Pure input validators for patients and doctors. Each returns { errors: string[], value }.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[0-9+\-\s()]{7,20}$/;

const isStr = (v) => typeof v === 'string';

function runChecks(b, partial, checks) {
  const errors = [];
  const value = {};
  for (const [key, fn] of Object.entries(checks)) {
    if (b[key] === undefined) {
      if (!partial) errors.push(`${key} is required`);
      continue;
    }
    const msg = fn(b[key]);
    if (msg) errors.push(msg);
    else value[key] = typeof b[key] === 'string' ? b[key].trim() : b[key];
  }
  if (partial && errors.length === 0 && Object.keys(value).length === 0) {
    errors.push('provide at least one field to update');
  }
  return { errors, value };
}

const asObj = (body) => (body && typeof body === 'object' && !Array.isArray(body) ? body : {});

function validatePatient(body, { partial = false } = {}) {
  return runChecks(asObj(body), partial, {
    full_name: (v) => (!isStr(v) || v.trim().length < 2 || v.trim().length > 100) ? 'full_name must be 2-100 characters' : null,
    email: (v) => (!isStr(v) || v.length > 255 || !EMAIL_RE.test(v.trim())) ? 'email must be a valid email address' : null,
    phone: (v) => (!isStr(v) || !PHONE_RE.test(v.trim())) ? 'phone must be 7-20 characters (digits, +, -, spaces, brackets)' : null,
  });
}

function validateDoctor(body, { partial = false } = {}) {
  return runChecks(asObj(body), partial, {
    full_name: (v) => (!isStr(v) || v.trim().length < 2 || v.trim().length > 100) ? 'full_name must be 2-100 characters' : null,
    specialty: (v) => (!isStr(v) || v.trim().length < 2 || v.trim().length > 100) ? 'specialty must be 2-100 characters' : null,
    consultation_fee: (v) => (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 99999999.99)
      ? 'consultation_fee must be a non-negative number' : null,
    room: (v) => (!isStr(v) || v.trim().length < 1 || v.trim().length > 10) ? 'room must be 1-10 characters' : null,
  });
}

/** Positive integer id from a route param or JSON field, or null. */
function parseId(v) {
  const n = typeof v === 'number' ? v : (typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : NaN);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

module.exports = { validatePatient, validateDoctor, parseId };
