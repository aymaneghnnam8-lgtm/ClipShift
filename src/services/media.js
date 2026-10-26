const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const downloadsDir = path.join(__dirname, "../../downloads");
if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir, { recursive: true });
}

const cookiesDir = path.join(__dirname, "../../cookies");
const ALLOWED_QUALITIES = ["360", "480", "720", "1080", "best"];
const SOCIAL_PLATFORMS = ["instagram", "facebook", "tiktok"];
const ALL_PLATFORMS = ["youtube", ...SOCIAL_PLATFORMS];
const YTDLP_BIN = process.env.YTDLP_PATH || "yt-dlp";
const YTDLP_TIMEOUT_MS = Number(process.env.YTDLP_TIMEOUT_MS) || 10 * 60 * 1000;

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function detectPlatform(url = "") {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    if (
      host === "youtube.com" ||
      host === "m.youtube.com" ||
      host === "music.youtube.com" ||
      host === "youtu.be"
    ) {
      return "youtube";
    }
    if (
      host === "facebook.com" ||
      host === "m.facebook.com" ||
      host === "fb.watch" ||
      host === "fb.com" ||
      host.endsWith(".facebook.com")
    ) {
      return "facebook";
    }
    if (host === "instagram.com" || host === "instagr.am") {
      return "instagram";
    }
    if (
      host === "tiktok.com" ||
      host === "vm.tiktok.com" ||
      host === "vt.tiktok.com" ||
      host.endsWith(".tiktok.com")
    ) {
      return "tiktok";
    }
  } catch {
    return null;
  }
  return null;
}

function isYouTubeUrl(url) {
  return detectPlatform(url) === "youtube";
}

function isSocialUrl(url) {
  return SOCIAL_PLATFORMS.includes(detectPlatform(url));
}

function isSupportedUrl(url) {
  return ALL_PLATFORMS.includes(detectPlatform(url));
}

const PROGRESS_RE = /\[download\]\s+([\d.]+)%/;

function runYtDlp(args, { onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(YTDLP_BIN, args, { windowsHide: true });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error("Délai dépassé : la vidéo est trop longue ou le serveur est lent."));
    }, YTDLP_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      if (onProgress) {
        for (const line of text.split(/\r?\n/)) {
          const m = PROGRESS_RE.exec(line);
          if (m) onProgress(Math.min(100, Number(m[1])));
        }
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(
        new Error(
          `yt-dlp introuvable sur le serveur. Installe yt-dlp et ffmpeg (voir README). ${err.message}`
        )
      );
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(friendlyYtDlpError(stderr, stdout, code)));
      }
    });
  });
}

function friendlyYtDlpError(stderr = "", stdout = "", code) {
  const raw = `${stderr}\n${stdout}`.trim();
  const lower = raw.toLowerCase();

  if (lower.includes("sign in to confirm") || lower.includes("not a bot")) {
    return (
      "YouTube bloque temporairement ce serveur (vérification anti-bot). " +
      "Réessaie plus tard, ou ajoute des cookies YouTube côté serveur (YTDLP_COOKIES_B64)."
    );
  }

  if (
    lower.includes("empty media response") ||
    lower.includes("api is not granting access") ||
    lower.includes("login required") ||
    lower.includes("rate-limit") ||
    (lower.includes("instagram") && lower.includes("cookies"))
  ) {
    return (
      "Instagram exige une session connectée pour ce contenu. " +
      "L’administrateur du site doit ajouter des cookies Instagram côté serveur."
    );
  }

  if (lower.includes("could not copy") && lower.includes("cookie")) {
    return (
      "Impossible de lire les cookies du navigateur (fichier verrouillé). " +
      "Ferme Edge/Chrome complètement puis réessaie, " +
      "ou place un fichier cookies/instagram.txt."
    );
  }

  if (lower.includes("failed to decrypt") && lower.includes("dpapi")) {
    return (
      "Lecture des cookies navigateur impossible (chiffrement Windows). " +
      "Exporte plutôt tes cookies en Netscape vers cookies/instagram.txt."
    );
  }

  if (lower.includes("ffmpeg") && (lower.includes("not found") || lower.includes("not installed"))) {
    return "ffmpeg est introuvable sur le serveur — impossible de convertir.";
  }

  if (lower.includes("requested format is not available")) {
    return "Cette qualité n’est pas disponible pour cette vidéo. Essaie « Max » ou une qualité plus basse.";
  }

  if (lower.includes("private video") || lower.includes("this video is private")) {
    return "Cette vidéo est privée ou inaccessible.";
  }

  if (lower.includes("video unavailable") || lower.includes("has been removed")) {
    return "Vidéo introuvable ou supprimée.";
  }

  if (lower.includes("unsupported url")) {
    return "Ce lien ne pointe pas vers une vidéo téléchargeable.";
  }

  if (
    lower.includes("ip address is blocked") ||
    lower.includes("status code 10201") ||
    (lower.includes("tiktok") && lower.includes("blocked"))
  ) {
    return (
      "TikTok bloque l’IP de ce serveur. Réessaie plus tard, " +
      "ou héberge l’API sur un autre réseau / VPS (Render, Railway)."
    );
  }

  if (lower.includes("[facebook]") && lower.includes("cannot parse data")) {
    return (
      "Facebook exige souvent une session connectée. " +
      "Place un export Netscape dans cookies/facebook.txt (voir cookies/README.txt)."
    );
  }

  const detail = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("[download]"))
    .filter((l) => /error/i.test(l))
    .slice(-2)
    .map((l) => l.replace(/^ERROR:\s*/i, ""))
    .join(" · ");

  return detail || `Le téléchargement a échoué (code ${code}).`;
}

function browserDataExists(browser) {
  // Lecture des cookies navigateur : uniquement en local sous Windows.
  if (process.platform !== "win32") return false;
  const local = process.env.LOCALAPPDATA || "";
  const roaming = process.env.APPDATA || "";
  const paths = {
    edge: path.join(local, "Microsoft", "Edge", "User Data"),
    chrome: path.join(local, "Google", "Chrome", "User Data"),
    brave: path.join(local, "BraveSoftware", "Brave-Browser", "User Data"),
    firefox: path.join(roaming, "Mozilla", "Firefox", "Profiles"),
    chromium: path.join(local, "Chromium", "User Data"),
  };
  const p = paths[browser];
  return p ? fs.existsSync(p) : false;
}

let envCookiesFile;

/** Cookies fournis par variable d’env (hébergement) : contenu Netscape encodé en base64. */
function cookiesFromEnv() {
  if (envCookiesFile !== undefined) return envCookiesFile;
  envCookiesFile = null;
  const b64 = process.env.YTDLP_COOKIES_B64;
  if (b64 && b64.trim()) {
    try {
      const file = path.join(os.tmpdir(), "clipshift-cookies.txt");
      fs.writeFileSync(file, Buffer.from(b64.trim(), "base64"));
      envCookiesFile = file;
    } catch (err) {
      console.warn("YTDLP_COOKIES_B64 invalide:", err.message);
    }
  }
  return envCookiesFile;
}

function resolveCookiesFile(platform) {
  const fromEnv = process.env.YTDLP_COOKIES || process.env.CLIPSHIFT_COOKIES;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;

  const candidates = [
    path.join(cookiesDir, `${platform}.txt`),
    path.join(cookiesDir, "cookies.txt"),
  ];

  for (const file of candidates) {
    if (fs.existsSync(file) && fs.statSync(file).size > 0) return file;
  }
  return cookiesFromEnv();
}

function resolveCookiesFromBrowser(platform) {
  const fromEnv =
    process.env.YTDLP_COOKIES_FROM_BROWSER ||
    process.env.CLIPSHIFT_COOKIES_FROM_BROWSER;
  // Sur Windows récent, Edge/Chrome chiffrent les cookies (DPAPI / App-Bound) :
  // yt-dlp échoue presque toujours. On n’essaie le navigateur QUE si demandé
  // explicitement via env. Préfère cookies/<platform>.txt (Netscape).
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  return null;
}

function authArgsForAttempt(platform, { withAuth = true, forceBrowser = null } = {}) {
  if (!withAuth) return [];

  const cookieFile = resolveCookiesFile(platform);
  if (cookieFile) return ["--cookies", cookieFile];

  const browser = forceBrowser || resolveCookiesFromBrowser(platform);
  return browser ? ["--cookies-from-browser", browser] : [];
}

function buildPlatformArgs(platform) {
  if (platform !== "instagram" && platform !== "facebook") return [];
  return [
    "--user-agent",
    DESKTOP_UA,
    "--add-header",
    platform === "instagram"
      ? "Referer:https://www.instagram.com/"
      : "Referer:https://www.facebook.com/",
    "--extractor-retries",
    "3",
    "--retry-sleep",
    "http:1",
  ];
}

function heightFilter(quality) {
  if (!quality || quality === "best") return "";
  const h = Number(quality);
  if (!Number.isFinite(h) || h <= 0) return "";
  return `[height<=${h}]`;
}

function buildFormatArgs(format, quality = "720", platform = "youtube") {
  const h = heightFilter(quality);
  const isSocial = SOCIAL_PLATFORMS.includes(platform);

  if (format === "mp3") {
    return ["-f", "ba/b", "-x", "--audio-format", "mp3", "--audio-quality", "0"];
  }

  if (format === "webm") {
    // Préfère du VP9/Opus natif, sinon on remuxe/recode en webm.
    const selector = isSocial
      ? `bv*${h}+ba/b${h}/bv*+ba/b`
      : `bv*${h}[ext=webm]+ba[ext=webm]/bv*${h}+ba/b${h}/bv*+ba/b`;
    return ["-f", selector, "--merge-output-format", "webm"];
  }

  // mp4 — toujours un dernier recours sans filtre de hauteur pour éviter
  // « Requested format is not available ».
  return [
    "-f",
    `bv*${h}[ext=mp4]+ba[ext=m4a]/b${h}[ext=mp4]/bv*${h}+ba/b${h}/bv*+ba/b`,
    "--merge-output-format",
    "mp4",
  ];
}

function needsCookieRetry(err) {
  const msg = String(err && err.message ? err.message : err).toLowerCase();
  return (
    msg.includes("cookie") ||
    msg.includes("session") ||
    msg.includes("verrouillé") ||
    msg.includes("dpapi") ||
    msg.includes("chiffrement")
  );
}

async function runYtDlpWithAuthFallback(platform, buildArgs, runOpts) {
  const firstUsedAuth = authArgsForAttempt(platform).length > 0;

  try {
    return await runYtDlp(buildArgs({ withAuth: true }), runOpts);
  } catch (firstErr) {
    // Aucun cookie utilisé, ou fichier cookies explicite : rien d’autre à tenter.
    if (!firstUsedAuth || resolveCookiesFile(platform)) throw firstErr;

    if (!needsCookieRetry(firstErr) && platform !== "instagram") {
      throw firstErr;
    }

    // Cookies navigateur verrouillés / illisibles : essayer d’autres navigateurs.
    const tried = new Set();
    const primary = resolveCookiesFromBrowser(platform);
    if (primary) tried.add(primary.split(":")[0]);

    const alternates = ["edge", "chrome", "brave", "firefox"].filter(
      (b) => !tried.has(b) && browserDataExists(b)
    );

    let lastErr = firstErr;
    for (const browser of alternates) {
      try {
        return await runYtDlp(buildArgs({ withAuth: true, forceBrowser: browser }), runOpts);
      } catch (err) {
        lastErr = err;
      }
    }

    // Dernier essai sans cookies (les posts publics passent parfois).
    try {
      return await runYtDlp(buildArgs({ withAuth: false }), runOpts);
    } catch {
      throw lastErr;
    }
  }
}

async function downloadMedia(url, format, jobId, quality = "720", { onProgress } = {}) {
  const platform = detectPlatform(url);
  if (!platform) {
    throw new Error(
      "Lien non supporté. Utilise YouTube, Instagram, Facebook ou TikTok."
    );
  }

  const safeQuality = ALLOWED_QUALITIES.includes(String(quality))
    ? String(quality)
    : "720";

  const jobDir = path.join(downloadsDir, String(jobId));
  fs.mkdirSync(jobDir, { recursive: true });

  const outputTemplate = path.join(jobDir, "%(title).80B.%(ext)s");

  const { stdout } = await runYtDlpWithAuthFallback(
    platform,
    ({ withAuth, forceBrowser }) => [
      "--no-playlist",
      "--no-warnings",
      "--js-runtimes",
      "node",
      "--newline",
      "--progress",
      "--restrict-filenames",
      "--no-mtime",
      ...buildPlatformArgs(platform),
      ...authArgsForAttempt(platform, { withAuth, forceBrowser }),
      ...buildFormatArgs(format, safeQuality, platform),
      "-o",
      outputTemplate,
      "--print",
      "after_move:filepath:%(filepath)s",
      url,
    ],
    { onProgress }
  );

  const printed = stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith("filepath:"))
    .map((l) => l.slice("filepath:".length));

  let filePath = [...printed].reverse().find((l) => fs.existsSync(l));

  if (!filePath) {
    const files = fs
      .readdirSync(jobDir)
      .filter((f) => !f.endsWith(".part") && !f.endsWith(".ytdl") && f !== "status.json")
      .map((f) => path.join(jobDir, f));

    if (!files.length) {
      throw new Error("Téléchargement terminé mais aucun fichier trouvé.");
    }

    filePath = files.sort(
      (a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs
    )[0];
  }

  const fileName = path.basename(filePath);
  const title = path.parse(fileName).name.replace(/_/g, " ");
  const size = fs.statSync(filePath).size;

  return { filePath, fileName, title, size, quality: safeQuality, platform };
}

function extractVideoId(url = "") {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      return u.pathname.replace(/^\//, "").split("/")[0] || null;
    }
    if (host.endsWith("youtube.com")) {
      if (u.searchParams.get("v")) return u.searchParams.get("v");
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts[0] === "shorts" || parts[0] === "embed" || parts[0] === "live") {
        return parts[1] || null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

const previewCache = new Map();
const PREVIEW_TTL_MS = 10 * 60 * 1000;

async function getMediaPreview(url) {
  if (!isSupportedUrl(url)) {
    throw new Error("Lien non supporté.");
  }

  const cached = previewCache.get(url);
  if (cached && Date.now() - cached.at < PREVIEW_TTL_MS) return cached.preview;

  const platform = detectPlatform(url);
  const videoId = extractVideoId(url);

  const { stdout } = await runYtDlpWithAuthFallback(platform, ({ withAuth, forceBrowser }) => [
    "--skip-download",
    "--no-playlist",
    "--no-warnings",
    "--js-runtimes",
    "node",
    ...buildPlatformArgs(platform),
    ...authArgsForAttempt(platform, { withAuth, forceBrowser }),
    "-j",
    url,
  ]);

  const jsonLine = stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.startsWith("{"));

  if (!jsonLine) {
    throw new Error("Impossible de lire les infos de la vidéo.");
  }

  const info = JSON.parse(jsonLine);
  const id = info.id || videoId;
  const duration = info.duration || 0;
  const labels = {
    youtube: "YouTube",
    facebook: "Facebook",
    instagram: "Instagram",
    tiktok: "TikTok",
  };

  const preview = {
    id,
    platform,
    title: info.title || `Vidéo ${labels[platform] || ""}`.trim(),
    thumbnail:
      info.thumbnail ||
      (platform === "youtube" && id
        ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
        : null),
    duration,
    durationText: formatDuration(duration),
    channel: info.channel || info.uploader || null,
  };

  previewCache.set(url, { at: Date.now(), preview });
  if (previewCache.size > 200) previewCache.delete(previewCache.keys().next().value);
  return preview;
}

// Compat anciens imports
const downloadYouTube = downloadMedia;
const getYouTubePreview = getMediaPreview;

module.exports = {
  downloadsDir,
  detectPlatform,
  isYouTubeUrl,
  isSocialUrl,
  isSupportedUrl,
  downloadMedia,
  downloadYouTube,
  getMediaPreview,
  getYouTubePreview,
  extractVideoId,
  ALLOWED_QUALITIES,
  SOCIAL_PLATFORMS,
};
