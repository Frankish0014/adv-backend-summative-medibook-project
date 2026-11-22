// All SQL for `appointments`, including the statistics and report queries.
// Aggregation (SUM / COUNT / GROUP BY / JOIN) is done by MySQL, not in JavaScript.
const { pool } = require('../config/db');

const COLUMNS = `id, patient_id, doctor_id, appt_datetime, status, amount_paid,
                 refund_amount, cancelled_at, booked_at`;

async function findById(id, conn = pool) {
  const [rows] = await conn.execute(`SELECT ${COLUMNS} FROM appointments WHERE id = ?`, [id]);
  return rows[0] || null;
}

async function findByIdForUpdate(conn, id) {
  const [rows] = await conn.execute(`SELECT ${COLUMNS} FROM appointments WHERE id = ? FOR UPDATE`, [id]);
  return rows[0] || null;
}

/** Number of 'booked' appointments for a doctor on a calendar day ('YYYY-MM-DD'). */
async function countBookedForDoctorDay(conn, doctorId, day) {
  const [rows] = await conn.execute(
    `SELECT COUNT(*) AS total
       FROM appointments
      WHERE doctor_id = ? AND status = 'booked'
        AND appt_datetime >= ? AND appt_datetime < ? + INTERVAL 1 DAY`,
    [doctorId, day, day]
  );
  return Number(rows[0].total);
}

async function isSlotBooked(conn, doctorId, datetimeSql) {
  const [rows] = await conn.execute(
    `SELECT 1 FROM appointments WHERE doctor_id = ? AND appt_datetime = ? AND status = 'booked' LIMIT 1`,
    [doctorId, datetimeSql]
  );
  return rows.length > 0;
}

/** True if this patient already holds the booked slot (used to make waitlist promotion idempotent). */
async function isSlotHeldByPatient(conn, doctorId, patientId, datetimeSql) {
  const [rows] = await conn.execute(
    `SELECT 1 FROM appointments
      WHERE doctor_id = ? AND patient_id = ? AND appt_datetime = ? AND status = 'booked' LIMIT 1`,
    [doctorId, patientId, datetimeSql]
  );
  return rows.length > 0;
}

/** Throws ER_DUP_ENTRY (uq_doctor_active_slot) if the slot is already held. */
async function insert(conn, { patientId, doctorId, datetimeSql, amountPaid }) {
  const [res] = await conn.execute(
    `INSERT INTO appointments (patient_id, doctor_id, appt_datetime, amount_paid)
     VALUES (?, ?, ?, ?)`,
    [patientId, doctorId, datetimeSql, amountPaid]
  );
  return res.insertId;
}

/** Marks the appointment cancelled and records the refund in the same row (history is kept). */
async function markCancelled(conn, id, refundAmount, cancelledAtSql) {
  const [res] = await conn.execute(
    `UPDATE appointments
        SET status = 'cancelled', refund_amount = ?, cancelled_at = ?
      WHERE id = ? AND status = 'booked'`,
    [refundAmount, cancelledAtSql, id]
  );
  return res.affectedRows === 1;
}

// ---------------------------------------------------------------------------
// Operation 4 - doctor statistics
// ---------------------------------------------------------------------------

/**
 * revenue_collected     = money paid in minus refunds paid out (all appointments of the doctor)
 * upcoming_appointments = booked appointments after `nowSql`
 * window_utilization_pct = booked in the next `days` days / (days x daily cap) x 100
 */
async function doctorTotals(doctorId, nowSql, days, cap) {
  const [rows] = await pool.execute(
    `SELECT COALESCE(SUM(amount_paid), 0) - COALESCE(SUM(refund_amount), 0) AS revenue_collected,
            COALESCE(SUM(status = 'booked' AND appt_datetime > ?), 0)       AS upcoming_appointments,
            ROUND(100 * COALESCE(SUM(status = 'booked'
                                     AND appt_datetime > ?
                                     AND appt_datetime < DATE(?) + INTERVAL ? DAY), 0) / (? * ?), 1)
                                                                            AS window_utilization_pct
       FROM appointments
      WHERE doctor_id = ?`,
    [nowSql, nowSql, nowSql, days, days, cap, doctorId]
  );
  return rows[0];
}

/** One row per day for the next `days` days (zero-filled via a recursive CTE). */
async function doctorDailyLoad(doctorId, nowSql, days, cap) {
  const [rows] = await pool.execute(
    `WITH RECURSIVE days (d, n) AS (
        SELECT DATE(?), 1
        UNION ALL
        SELECT d + INTERVAL 1 DAY, n + 1 FROM days WHERE n < ?
     )
     SELECT DATE_FORMAT(days.d, '%Y-%m-%d')            AS date,
            COUNT(a.id)                                AS appointments,
            ROUND(100 * COUNT(a.id) / ?, 1)            AS utilization_pct
       FROM days
       LEFT JOIN appointments a
              ON a.doctor_id = ?
             AND a.status = 'booked'
             AND a.appt_datetime > ?
             AND a.appt_datetime >= days.d
             AND a.appt_datetime <  days.d + INTERVAL 1 DAY
      GROUP BY days.d
      ORDER BY days.d`,
    [nowSql, days, cap, doctorId, nowSql]
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Operation 5 - doctors report (LEFT JOIN keeps doctors with zero appointments)
// ---------------------------------------------------------------------------
async function doctorsReport() {
  const [rows] = await pool.execute(
    `SELECT d.id                                                        AS doctor_id,
            d.full_name,
            d.specialty,
            COUNT(CASE WHEN a.status = 'booked' THEN 1 END)             AS total_appointments,
            COUNT(CASE WHEN a.status = 'cancelled' THEN 1 END)          AS cancelled_appointments,
            COALESCE(SUM(a.amount_paid), 0) - COALESCE(SUM(a.refund_amount), 0) AS revenue_collected
       FROM doctors d
       LEFT JOIN appointments a ON a.doctor_id = d.id
      GROUP BY d.id, d.full_name, d.specialty
      ORDER BY revenue_collected DESC, d.id`
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Operation 6 - busy days: (doctor, date) with MORE than 80% of the daily cap booked
// ---------------------------------------------------------------------------
async function busyDays(cap, thresholdPct) {
  const [rows] = await pool.execute(
    `SELECT a.doctor_id,
            d.full_name                                  AS doctor_name,
            DATE_FORMAT(a.appt_datetime, '%Y-%m-%d')     AS date,
            COUNT(*)                                     AS booked,
            ROUND(100 * COUNT(*) / ?, 1)                 AS utilization_pct
       FROM appointments a
       JOIN doctors d ON d.id = a.doctor_id
      WHERE a.status = 'booked'
      GROUP BY a.doctor_id, d.full_name, DATE_FORMAT(a.appt_datetime, '%Y-%m-%d')
     HAVING 100 * COUNT(*) / ? > ?
      ORDER BY date, a.doctor_id`,
    [cap, cap, thresholdPct]
  );
  return rows;
}

module.exports = {
  findById, findByIdForUpdate, countBookedForDoctorDay, isSlotBooked, isSlotHeldByPatient, insert, markCancelled,
  doctorTotals, doctorDailyLoad, doctorsReport, busyDays,
};
