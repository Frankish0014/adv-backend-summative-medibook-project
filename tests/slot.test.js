const { validateSlot, parseDateTime } = require('../src/utils/slot');

const now = new Date(2026, 7, 1, 8, 0, 0); // 2026-08-01 08:00 local
const check = (s) => validateSlot(s, now);

describe('slot validation', () => {
  test('accepts a valid future slot on the hour and on the half hour', () => {
    expect(check('2026-08-10 09:00').valid).toBe(true);
    expect(check('2026-08-10T14:30').valid).toBe(true);
  });

  test('accepts the last slot of the day (16:30) but rejects 17:00 exactly', () => {
    expect(check('2026-08-10 16:30').valid).toBe(true);
    const r = check('2026-08-10 17:00');
    expect(r.valid).toBe(false);
    expect(r.code).toBe('OUT_OF_HOURS');
  });

  test('rejects before opening (08:30) and after closing', () => {
    expect(check('2026-08-10 08:30').code).toBe('OUT_OF_HOURS');
    expect(check('2026-08-10 18:00').code).toBe('OUT_OF_HOURS');
  });

  test('rejects times not on a 30-minute boundary (09:15, 09:45)', () => {
    expect(check('2026-08-10 09:15').code).toBe('MISALIGNED');
    expect(check('2026-08-10 09:45').code).toBe('MISALIGNED');
  });

  test('rejects non-zero seconds', () => {
    expect(check('2026-08-10 09:00:30').code).toBe('MISALIGNED');
  });

  test('rejects slots in the past, including "right now"', () => {
    expect(check('2026-07-31 10:00').code).toBe('PAST');
    expect(validateSlot('2026-08-01 09:00', new Date(2026, 7, 1, 9, 0, 0)).code).toBe('PAST');
  });

  test('rejects malformed or impossible dates and non-strings', () => {
    expect(check('not a date').code).toBe('MALFORMED');
    expect(check('2026-02-31 10:00').code).toBe('MALFORMED'); // 31 Feb does not exist
    expect(check('2026-08-10 25:00').code).toBe('MALFORMED');
    expect(check('').code).toBe('MALFORMED');
    expect(check(undefined).code).toBe('MALFORMED');
    expect(check(12345).code).toBe('MALFORMED');
  });

  test('parseDateTime normalises to a MySQL DATETIME string and day key', () => {
    const p = parseDateTime('2026-08-10T09:30');
    expect(p.sql).toBe('2026-08-10 09:30:00');
    expect(p.day).toBe('2026-08-10');
  });
});
