// All SQL for `patients`. Every value goes through ? placeholders.
const { pool } = require('../config/db');

// Column names that may appear in a dynamic SET clause (whitelist - never user input).
const UPDATABLE = ['full_name', 'email', 'phone'];

async function findAll() {
  const [rows] = await pool.execute('SELECT id, full_name, email, phone, created_at FROM patients ORDER BY id');
  return rows;
}

async function findById(id, conn = pool) {
  const [rows] = await conn.execute('SELECT id, full_name, email, phone, created_at FROM patients WHERE id = ?', [id]);
  return rows[0] || null;
}

async function create({ full_name, email, phone }) {
  const [res] = await pool.execute(
    'INSERT INTO patients (full_name, email, phone) VALUES (?, ?, ?)',
    [full_name, email, phone]
  );
  return findById(res.insertId);
}

async function update(id, fields) {
  const cols = UPDATABLE.filter((c) => fields[c] !== undefined);
  if (cols.length === 0) return findById(id);
  const setClause = cols.map((c) => `${c} = ?`).join(', '); // identifiers come from the whitelist above
  const [res] = await pool.execute(`UPDATE patients SET ${setClause} WHERE id = ?`, [...cols.map((c) => fields[c]), id]);
  if (res.affectedRows === 0) return null;
  return findById(id);
}

async function remove(id) {
  const [res] = await pool.execute('DELETE FROM patients WHERE id = ?', [id]);
  return res.affectedRows > 0;
}

module.exports = { findAll, findById, create, update, remove };
