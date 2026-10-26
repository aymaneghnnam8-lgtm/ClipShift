const { Pool } = require("pg");

const enabled = Boolean(process.env.DATABASE_URL);

const pool = enabled
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : null;

if (pool) {
  pool.on("error", (err) => {
    console.error("Erreur PostgreSQL inattendue:", err.message);
  });
}

async function query(text, params) {
  if (!pool) throw new Error("PostgreSQL désactivé (DATABASE_URL manquant).");
  return pool.query(text, params);
}

async function testConnection() {
  if (!pool) {
    console.warn("DATABASE_URL manquant — PostgreSQL désactivé (optionnel).");
    return false;
  }
  try {
    await pool.query("SELECT 1");
    console.log("PostgreSQL connecté.");
    return true;
  } catch (err) {
    console.warn("PostgreSQL indisponible:", err.message);
    return false;
  }
}

module.exports = { pool, query, testConnection };
