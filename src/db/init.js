require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { pool } = require("../db");

async function init() {
  if (!process.env.DATABASE_URL) {
    console.error("Définis DATABASE_URL dans .env");
    process.exit(1);
  }

  const schemaPath = path.join(__dirname, "../../sql/schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf8");

  try {
    await pool.query(sql);
    console.log("Schéma ClipShift créé.");
  } catch (err) {
    console.error("Échec init DB:", err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

init();
