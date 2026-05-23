require('dotenv').config();

const fs = require('fs/promises');
const { Pool } = require('pg');

async function main() {
  const filePath = process.argv[2];

  if (!filePath) {
    throw new Error('Usage: node scripts/run-sql.js <sql-file>');
  }

  if (!process.env.DIRECT_URL) {
    throw new Error('DIRECT_URL is not set in .env.');
  }

  const sql = await fs.readFile(filePath, 'utf8');
  const pool = new Pool({
    connectionString: process.env.DIRECT_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await pool.query(sql);
    console.log(`Executed ${filePath}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
