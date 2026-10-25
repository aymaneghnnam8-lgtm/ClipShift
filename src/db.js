const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on("error", (err) => {
  console.error("Erreur PostgreSQL inattendue:", err.message);
});

async function query(text, params) {
  return pool.query(text, params);
}

async function testConnection() {
  if (!process.env.DATABASE_URL) {
    console.warn("DATABASE_URL manquant — PostgreSQL désactivé pour l’instant.");
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
