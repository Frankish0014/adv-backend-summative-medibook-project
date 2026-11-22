// All SQL for `doctors`.
const { pool } = require('../config/db');

const UPDATABLE = ['full_name', 'specialty', 'consultation_fee', 'room'];
const SELECT = 'SELECT id, full_name, specialty, consultation_fee, room, created_at FROM doctors';

async function findAll() {
  const [rows] = await pool.execute(`${SELECT} ORDER BY id`);
  return rows;
}

async function findById(id, conn = pool) {
  const [rows] = await conn.execute(`${SELECT} WHERE id = ?`, [id]);
  return rows[0] || null;
}

/**
 * Locks the doctor row for the rest of the transaction. Booking takes this lock before counting
 * the day's appointments, so two concurrent bookings for the same doctor are serialised and the
 * 12-per-day cap cannot be overshot.
 */
async function findByIdForUpdate(conn, id) {
  const [rows] = await conn.execute(`${SELECT} WHERE id = ? FOR UPDATE`, [id]);
  return rows[0] || null;
}

async function create({ full_name, specialty, consultation_fee, room }) {
  const [res] = await pool.execute(
    'INSERT INTO doctors (full_name, specialty, consultation_fee, room) VALUES (?, ?, ?, ?)',
    [full_name, specialty, consultation_fee, room]
  );
  return findById(res.insertId);
}

async function update(id, fields) {
  const cols = UPDATABLE.filter((c) => fields[c] !== undefined);
  if (cols.length === 0) return findById(id);
  const setClause = cols.map((c) => `${c} = ?`).join(', ');
  const [res] = await pool.execute(`UPDATE doctors SET ${setClause} WHERE id = ?`, [...cols.map((c) => fields[c]), id]);
  if (res.affectedRows === 0) return null;
  return findById(id);
}

async function remove(id) {
  const [res] = await pool.execute('DELETE FROM doctors WHERE id = ?', [id]);
  return res.affectedRows > 0;
}

module.exports = { findAll, findById, findByIdForUpdate, create, update, remove };
