require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const convertRoutes = require("./routes/convert");
const { testConnection } = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "../public")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, app: "ClipShift" });
});

app.use("/api/convert", convertRoutes);

const publicDir = path.join(__dirname, "../public");

app.get("/youtube", (_req, res) => {
  res.sendFile(path.join(publicDir, "youtube.html"));
});
app.get("/instagram", (_req, res) => {
  res.sendFile(path.join(publicDir, "instagram.html"));
});
app.get("/facebook", (_req, res) => {
  res.sendFile(path.join(publicDir, "facebook.html"));
});
app.get("/tiktok", (_req, res) => {
  res.sendFile(path.join(publicDir, "tiktok.html"));
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
