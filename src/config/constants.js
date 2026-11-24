module.exports = {
  WORK_START_HOUR: 9,        // first slot starts 09:00
  WORK_END_HOUR: 17,         // clinic closes 17:00 -> last slot starts 16:30
  SLOT_MINUTES: 30,
  MAX_APPOINTMENTS_PER_DAY: 12,
  BUSY_DAY_THRESHOLD_PCT: 80,
  STATS_WINDOW_DAYS: 7,
  // Refund notice tiers (hours). Exact 48h and 24h fall in the 50% band.
  REFUND_FULL_HOURS: 48,     // notice > 48 → 100%
  REFUND_HALF_HOURS: 24,     // 24 ≤ notice ≤ 48 → 50%; notice < 24 → 0%
  REFUND_FULL_PCT: 100,
  REFUND_HALF_PCT: 50,
  REFUND_NONE_PCT: 0,
};
