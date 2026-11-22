require('dotenv').config();
const mysql = require('mysql2/promise');

// dateStrings: DATETIME values travel as plain 'YYYY-MM-DD HH:mm:ss' strings, so the
// clinic's wall-clock times are never shifted by time-zone conversion.
const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'medibook',
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,
  decimalNumbers: true,
});

/**
 * Runs `work(conn)` inside one transaction: commit on success, rollback on any error.
 * (Uses the driver's transaction API - no SQL is written here.)
 */
async function withTransaction(work) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try { await conn.rollback(); } catch (_) { /* connection already broken */ }
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, withTransaction };
