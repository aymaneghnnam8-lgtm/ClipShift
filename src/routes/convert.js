const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
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

async function updateJob(id, fields) {
  const keys = Object.keys(fields);
  if (!keys.length) return;

  const sets = keys.map((k, i) => `${k} = $${i + 2}`);
  sets.push("updated_at = NOW()");
  const values = keys.map((k) => fields[k]);

  try {
    await query(
      `UPDATE jobs SET ${sets.join(", ")} WHERE id = $1`,
      [id, ...values]
    );
  } catch (err) {
    console.warn("MAJ job échouée:", err.message);
  }
}

function writeLocalJobStatus(jobId, fields) {
  try {
    const jobDir = path.join(downloadsDir, String(jobId));
    fs.mkdirSync(jobDir, { recursive: true });
    const file = path.join(jobDir, "status.json");
    let prev = {};
    if (fs.existsSync(file)) {
      try {
        prev = JSON.parse(fs.readFileSync(file, "utf8"));
      } catch {
        prev = {};
      }
    }
    fs.writeFileSync(
      file,
      JSON.stringify({ ...prev, ...fields, updated_at: new Date().toISOString() }),
      "utf8"
    );
  } catch (err) {
    console.warn("status.json:", err.message);
  }
}

function readLocalJobStatus(jobId) {
  const file = path.join(downloadsDir, String(jobId), "status.json");
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

async function processDownloadJob(jobId, url, format, quality) {
  try {
    writeLocalJobStatus(jobId, { id: jobId, status: "processing", format, quality });
    await updateJob(jobId, { status: "processing" });
    const result = await downloadMedia(url, format, jobId, quality);
    writeLocalJobStatus(jobId, {
      id: jobId,
      status: "done",
      output_filename: result.fileName,
      original_filename: result.title,
      platform: result.platform,
      quality: result.quality,
      error_message: null,
    });
    await updateJob(jobId, {
      status: "done",
      output_filename: result.fileName,
      original_filename: result.title,
      error_message: null,
    });
  } catch (err) {
    console.error(`Job ${jobId} erreur:`, err.message);
    writeLocalJobStatus(jobId, {
      id: jobId,
      status: "error",
      error_message: String(err.message || "Erreur").slice(0, 500),
    });
    await updateJob(jobId, {
      status: "error",
      error_message: err.message.slice(0, 500),
    });
  }
}

function startJob(req, res, { allow }) {
  const { url, format = "mp4", quality = "720" } = req.body || {};

  if (!url || typeof url !== "string") {
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

  if (
    ["instagram", "facebook", "tiktok"].includes(allow) &&
    platform !== allow
  ) {
    const labels = {
      instagram: "Instagram",
      facebook: "Facebook",
      tiktok: "TikTok",
    };
    return res.status(400).json({
      error: `Colle un lien ${labels[allow]} uniquement.`,
    });
  }

  if (allow === "any" && !isSupportedUrl(url)) {
    return res.status(400).json({
      error:
        "Lien non supporté. Utilise YouTube, Instagram, Facebook ou TikTok.",
    });
  }

  if (allow !== "any" && !isSupportedUrl(url)) {
    return res.status(400).json({
      error: "Lien non supporté.",
    });
  }

  const allowedFormats = ["mp4", "mp3", "webm"];
  const safeFormat = allowedFormats.includes(format) ? format : "mp4";
  const safeQuality = ALLOWED_QUALITIES.includes(String(quality))
    ? String(quality)
    : "720";

  let jobId;

  query(
    `INSERT INTO jobs (source_url, source_type, platform, format, quality, status)
     VALUES ($1, 'url', $2, $3, $4, 'pending')
     RETURNING id, status, format, quality, platform, created_at`,
    [url, platform, safeFormat, safeQuality]
  )
    .then((result) => {
      jobId = result.rows[0].id;
      setImmediate(() => {
        processDownloadJob(jobId, url, safeFormat, safeQuality);
      });
      res.status(202).json({
        message: `Téléchargement ${platform} démarré.`,
        job: {
          id: jobId,
          status: "pending",
          format: safeFormat,
          quality: safeQuality,
          platform,
        },
      });
    })
    .catch((err) => {
      console.warn("Insert job sans DB:", err.message);
      jobId = `temp-${Date.now()}`;
      setImmediate(() => {
        processDownloadJob(jobId, url, safeFormat, safeQuality);
      });
      res.status(202).json({
        message: `Téléchargement ${platform} démarré.`,
        job: {
          id: jobId,
          status: "pending",
          format: safeFormat,
          quality: safeQuality,
          platform,
        },
      });
    });
}

/** Accueil : détection auto de la plateforme */
router.post("/auto", (req, res) => startJob(req, res, { allow: "any" }));

/** Pages SEO dédiées */
router.post("/url", (req, res) => startJob(req, res, { allow: "youtube" }));
router.post("/youtube", (req, res) => startJob(req, res, { allow: "youtube" }));
router.post("/social", (req, res) => startJob(req, res, { allow: "social" }));
router.post("/instagram", (req, res) =>
  startJob(req, res, { allow: "instagram" })
);
router.post("/facebook", (req, res) =>
  startJob(req, res, { allow: "facebook" })
);
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

router.get("/status/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await query(
      `SELECT id, status, format, quality, platform, output_filename, original_filename, error_message, created_at, updated_at
       FROM jobs WHERE id = $1`,
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Job introuvable." });
    }

    const job = result.rows[0];
    const payload = { job };

    if (job.status === "done" && job.output_filename) {
      payload.downloadUrl = `/api/convert/download/${job.id}`;
    }

    return res.json(payload);
  } catch {
    const local = readLocalJobStatus(id);
    if (local && (local.status === "error" || local.status === "done")) {
      const payload = { job: { id, ...local } };
      if (local.status === "done" && local.output_filename) {
        payload.downloadUrl = `/api/convert/download/${id}`;
      }
      return res.json(payload);
    }

    const jobDir = path.join(downloadsDir, id);
    if (!fs.existsSync(jobDir)) {
      return res.status(404).json({ error: "Job introuvable." });
    }

    const files = fs
      .readdirSync(jobDir)
      .filter(
        (f) =>
          !f.endsWith(".part") &&
          !f.endsWith(".ytdl") &&
          f !== "status.json"
      );

    if (files.length) {
      return res.json({
        job: {
          id,
          status: "done",
          output_filename: files[0],
        },
        downloadUrl: `/api/convert/download/${id}`,
      });
    }

    return res.json({
      job: {
        id,
        status: (local && local.status) || "processing",
        error_message: local && local.error_message,
      },
    });
  }
});

router.get("/download/:id", async (req, res) => {
  const { id } = req.params;
  const jobDir = path.join(downloadsDir, id);

  if (!fs.existsSync(jobDir)) {
    return res.status(404).json({ error: "Fichier introuvable." });
  }

  let fileName = null;

  try {
    const result = await query(
      `SELECT output_filename, status FROM jobs WHERE id = $1`,
      [id]
    );
    if (result.rows.length && result.rows[0].output_filename) {
      fileName = result.rows[0].output_filename;
    }
  } catch {
    // ignore
  }

  if (!fileName) {
    const files = fs
      .readdirSync(jobDir)
      .filter(
        (f) =>
          !f.endsWith(".part") &&
          !f.endsWith(".ytdl") &&
          f !== "status.json"
      );
    fileName = files[0];
  }

  if (!fileName) {
    return res.status(404).json({ error: "Fichier pas encore prêt." });
  }

  const filePath = path.join(jobDir, fileName);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Fichier introuvable sur le disque." });
  }

  res.download(filePath, fileName);
});

router.post("/upload", upload.single("file"), async (req, res) => {
  const format = (req.body && req.body.format) || "mp4";

  if (!req.file) {
    return res.status(400).json({ error: "Fichier manquant." });
  }

  let job = {
    id: null,
    original_filename: req.file.originalname,
    format,
    status: "pending",
  };

  try {
    const result = await query(
      `INSERT INTO jobs (source_type, format, status, original_filename)
       VALUES ('upload', $1, 'pending', $2)
       RETURNING id, status, format, created_at`,
      [format, req.file.originalname]
    );
    job = { ...job, ...result.rows[0] };
  } catch {
    job.id = `temp-${Date.now()}`;
  }

  res.status(202).json({
    message: "Fichier reçu. La conversion locale sera branchée ensuite.",
    job,
  });
});

module.exports = router;
