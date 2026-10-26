require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const convertRoutes = require("./routes/convert");
const { testConnection } = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, "../public");

app.set("trust proxy", 1);

// CORS : autorise le front (ex. Vercel) à appeler ce serveur de conversion.
const allowedOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
app.use(
  cors(allowedOrigins.length ? { origin: allowedOrigins } : undefined)
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(publicDir, { extensions: ["html"], maxAge: "1h" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, app: "ClipShift" });
});

app.use("/api/convert", convertRoutes);

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Route API introuvable." });
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

async function start() {
  await testConnection();
  app.listen(PORT, () => {
    console.log(`ClipShift → http://localhost:${PORT}`);
  });
}

start();
