const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { query } = require("../db");
const {
  downloadsDir,
  detectPlatform,
  isYouTubeUrl,
  isSocialUrl,
  isSupportedUrl,
  downloadMedia,
  getMediaPreview,
  ALLOWED_QUALITIES,
} = require("../services/media");

const router = express.Router();

const uploadsDir = path.join(__dirname, "../../uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 500 * 1024 * 1024 },
});

const PLATFORM_LABELS = {
  youtube: "YouTube",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
};

const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT_JOBS) || 2;
const FILE_TTL_MS = (Number(process.env.FILE_TTL_MINUTES) || 60) * 60 * 1000;

/** Jobs en mémoire : source de vérité pour le suivi (la DB n’est qu’un historique). */
const jobs = new Map();
const queue = [];
let running = 0;

const JOB_ID_RE = /^[0-9a-f-]{36}$/i;

function isValidJobId(id) {
  return typeof id === "string" && JOB_ID_RE.test(id);
}

function jobDirFor(id) {
  return path.join(downloadsDir, id);
}

async function logJob(id, fields) {
  try {
    await query(
      `INSERT INTO jobs (id, source_url, source_type, platform, format, quality, status)
       VALUES ($1, $2, 'url', $3, $4, $5, 'pending')`,
      [id, fields.url, fields.platform, fields.format, fields.quality]
    );
  } catch {
    // DB optionnelle
  }
}

async function updateJobRow(id, fields) {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const sets = keys.map((k, i) => `${k} = $${i + 2}`);
  sets.push("updated_at = NOW()");
  try {
    await query(`UPDATE jobs SET ${sets.join(", ")} WHERE id = $1`, [
      id,
      ...keys.map((k) => fields[k]),
    ]);
  } catch {
    // DB optionnelle
  }
}

function publicJob(job) {
  return {
    id: job.id,
    status: job.status,
    progress: job.progress,
    format: job.format,
    quality: job.quality,
    platform: job.platform,
    position: job.status === "pending" ? queue.indexOf(job.id) + 1 : 0,
    original_filename: job.title || null,
    output_filename: job.fileName || null,
    size: job.size || null,
    error_message: job.error || null,
  };
}

async function runJob(job) {
  job.status = "processing";
  job.progress = 0;
  updateJobRow(job.id, { status: "processing" });

  try {
    const result = await downloadMedia(job.url, job.format, job.id, job.quality, {
      onProgress: (pct) => {
        // yt-dlp télécharge vidéo puis audio : on garde une progression monotone.
        job.progress = Math.max(job.progress, Math.round(pct * 0.95));
      },
    });
    Object.assign(job, {
      status: "done",
      progress: 100,
      fileName: result.fileName,
      title: result.title,
      size: result.size,
      finishedAt: Date.now(),
    });
    updateJobRow(job.id, {
      status: "done",
      output_filename: result.fileName,
      original_filename: result.title,
    });
  } catch (err) {
    const message = String((err && err.message) || "Erreur").slice(0, 500);
    console.error(`Job ${job.id} erreur:`, message);
    Object.assign(job, { status: "error", error: message, finishedAt: Date.now() });
    updateJobRow(job.id, { status: "error", error_message: message });
    fs.rm(jobDirFor(job.id), { recursive: true, force: true }, () => {});
  }
}

function pump() {
  while (running < MAX_CONCURRENT && queue.length) {
    const job = jobs.get(queue.shift());
    if (!job) continue;
    running += 1;
    runJob(job).finally(() => {
      running -= 1;
      pump();
    });
  }
}

/** Supprime les fichiers et jobs expirés. */
function cleanup() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (job.finishedAt && now - job.finishedAt > FILE_TTL_MS) {
      jobs.delete(id);
      fs.rm(jobDirFor(id), { recursive: true, force: true }, () => {});
    }
  }
  // Dossiers orphelins (redémarrage serveur, etc.)
  try {
    for (const name of fs.readdirSync(downloadsDir)) {
      if (jobs.has(name)) continue;
      const dir = path.join(downloadsDir, name);
      const { mtimeMs } = fs.statSync(dir);
      if (now - mtimeMs > FILE_TTL_MS) {
        fs.rm(dir, { recursive: true, force: true }, () => {});
      }
    }
  } catch {
    // ignore
  }
}

setInterval(cleanup, 5 * 60 * 1000).unref();
cleanup();

function startJob(req, res, { allow }) {
  const { format = "mp4", quality = "720" } = req.body || {};
  const url = String((req.body && req.body.url) || "").trim();

  if (!url) {
    return res.status(400).json({ error: "URL manquante." });
  }

  const platform = detectPlatform(url);

  if (allow === "youtube" && !isYouTubeUrl(url)) {
    return res.status(400).json({
      error: "Colle un lien YouTube (youtube.com ou youtu.be).",
    });
  }

  if (allow === "social" && !isSocialUrl(url)) {
    return res.status(400).json({
      error: "Colle un lien Instagram, Facebook ou TikTok.",
    });
  }

  if (["instagram", "facebook", "tiktok"].includes(allow) && platform !== allow) {
    return res.status(400).json({
      error: `Colle un lien ${PLATFORM_LABELS[allow]} uniquement.`,
    });
  }

  if (!isSupportedUrl(url)) {
    return res.status(400).json({
      error: "Lien non supporté. Utilise YouTube, Instagram, Facebook ou TikTok.",
    });
  }

  if (queue.length >= 20) {
    return res.status(503).json({
      error: "Le serveur est très sollicité. Réessaie dans une minute.",
    });
  }

  const safeFormat = ["mp4", "mp3", "webm"].includes(format) ? format : "mp4";
  const safeQuality = ALLOWED_QUALITIES.includes(String(quality))
    ? String(quality)
    : "720";

  const job = {
    id: crypto.randomUUID(),
    url,
    platform,
    format: safeFormat,
    quality: safeQuality,
    status: "pending",
    progress: 0,
    createdAt: Date.now(),
  };

  jobs.set(job.id, job);
  queue.push(job.id);
  logJob(job.id, job);
  pump();

  res.status(202).json({
    message: `Téléchargement ${PLATFORM_LABELS[platform]} démarré.`,
    job: publicJob(job),
  });
}

/** Accueil : détection auto de la plateforme */
router.post("/auto", (req, res) => startJob(req, res, { allow: "any" }));

/** Pages SEO dédiées */
router.post("/url", (req, res) => startJob(req, res, { allow: "youtube" }));
router.post("/youtube", (req, res) => startJob(req, res, { allow: "youtube" }));
router.post("/social", (req, res) => startJob(req, res, { allow: "social" }));
router.post("/instagram", (req, res) => startJob(req, res, { allow: "instagram" }));
router.post("/facebook", (req, res) => startJob(req, res, { allow: "facebook" }));
router.post("/tiktok", (req, res) => startJob(req, res, { allow: "tiktok" }));

/** Aperçu (toutes plateformes supportées) */
router.get("/preview", async (req, res) => {
  const url = String(req.query.url || "").trim();

  if (!url) {
    return res.status(400).json({ error: "URL manquante." });
  }
  if (!isSupportedUrl(url)) {
    return res.status(400).json({ error: "Lien non supporté." });
  }

  try {
    const preview = await getMediaPreview(url);
    res.json({ preview });
  } catch (err) {
    res.status(502).json({
      error: err.message || "Impossible de charger l’aperçu.",
    });
  }
});

router.get("/status/:id", (req, res) => {
  const { id } = req.params;
  const job = isValidJobId(id) && jobs.get(id);

  if (!job) {
    return res.status(404).json({
      error: "Job introuvable ou expiré. Relance la conversion.",
    });
  }

  const payload = { job: publicJob(job) };
  if (job.status === "done") {
    payload.downloadUrl = `/api/convert/download/${job.id}`;
  }
  res.json(payload);
});

router.get("/download/:id", (req, res) => {
  const { id } = req.params;
  const job = isValidJobId(id) && jobs.get(id);

  if (!job || job.status !== "done" || !job.fileName) {
    return res.status(404).json({ error: "Fichier introuvable ou expiré." });
  }

  const filePath = path.join(jobDirFor(id), path.basename(job.fileName));
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Fichier introuvable ou expiré." });
  }

  res.download(filePath, job.fileName);
});

router.post("/upload", upload.single("file"), (req, res) => {
  if (req.file) fs.rm(req.file.path, { force: true }, () => {});
  res.status(501).json({ error: "La conversion de fichiers locaux n’est pas encore disponible." });
});

module.exports = router;
