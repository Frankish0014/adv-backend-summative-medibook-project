// Convenience: applies database/schema.sql and database/seed.sql using the .env credentials.
// (Equivalent to: mysql -u <user> -p < database/schema.sql && mysql ... < database/seed.sql)
require('dotenv').config();
const fs = require('fs/promises');
const path = require('path');
const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: true,
  });
  for (const file of ['schema.sql', 'seed.sql']) {
    const sql = await fs.readFile(path.join(__dirname, '..', 'database', file), 'utf8');
    await conn.query(sql);
    console.log(`applied database/${file}`);
  }
  await conn.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
