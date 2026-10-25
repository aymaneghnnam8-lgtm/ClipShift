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

function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("yt-dlp", args, { windowsHide: true });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      reject(
        new Error(
          `yt-dlp introuvable. Vérifie l’installation (scoop install yt-dlp). ${err.message}`
        )
      );
    });

    child.on("close", (code) => {
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

  if (
    lower.includes("empty media response") ||
    lower.includes("api is not granting access") ||
    lower.includes("login required") ||
    lower.includes("rate-limit") ||
    (lower.includes("instagram") && lower.includes("cookies"))
  ) {
    return (
      "Instagram bloque le téléchargement sans session. " +
      "Connecte-toi à Instagram dans Edge/Chrome, ferme le navigateur, " +
      "ou exporte tes cookies Netscape dans cookies/instagram.txt " +
      "(voir cookies/README.txt)."
    );
  }

  if (
    lower.includes("could not copy") &&
    lower.includes("cookie")
  ) {
    return (
      "Impossible de lire les cookies du navigateur (fichier verrouillé). " +
      "Ferme Edge/Chrome complètement puis réessaie, " +
      "ou place un fichier cookies/instagram.txt."
    );
  }

  if (lower.includes("failed to decrypt") && lower.includes("dpapi")) {
    return (
      "Lecture des cookies navigateur impossible (chiffrement Windows). " +
      "Exporte plutôt tes cookies Instagram en Netscape vers cookies/instagram.txt."
    );
  }

  if (lower.includes("private video") || lower.includes("this video is private")) {
    return "Cette vidéo est privée ou inaccessible.";
  }

  if (lower.includes("not available") || lower.includes("removed")) {
    return "Vidéo introuvable ou supprimée.";
  }

  const detail = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(-6)
    .join(" · ");

  return detail || `yt-dlp a échoué (code ${code})`;
}

function browserDataExists(browser) {
  const local = process.env.LOCALAPPDATA || "";
  const roaming = process.env.APPDATA || "";
  const home = os.homedir();
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

function resolveCookiesFile(platform) {
  const fromEnv = process.env.YTDLP_COOKIES || process.env.CLIPSHIFT_COOKIES;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;

  const candidates = [
    path.join(cookiesDir, `${platform}.txt`),
    path.join(cookiesDir, "cookies.txt"),
    path.join(cookiesDir, "instagram.txt"),
  ];

  for (const file of candidates) {
    if (fs.existsSync(file) && fs.statSync(file).size > 0) return file;
  }
  return null;
}

function resolveCookiesFromBrowser(platform) {
  const fromEnv =
    process.env.YTDLP_COOKIES_FROM_BROWSER ||
    process.env.CLIPSHIFT_COOKIES_FROM_BROWSER;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();

  // Instagram / Facebook almost always need a logged-in session now.
  if (platform !== "instagram" && platform !== "facebook") return null;

  const preferred = ["edge", "chrome", "brave", "firefox", "chromium"];
  return preferred.find((b) => browserDataExists(b)) || null;
}

function buildAuthArgs(platform) {
  const args = [];
  const cookieFile = resolveCookiesFile(platform);
  if (cookieFile) {
    args.push("--cookies", cookieFile);
    return args;
  }

  const browser = resolveCookiesFromBrowser(platform);
  if (browser) {
    args.push("--cookies-from-browser", browser);
  }
  return args;
}

function buildPlatformArgs(platform) {
  const args = [];

  if (platform === "instagram" || platform === "facebook") {
    args.push(
      "--user-agent",
      DESKTOP_UA,
      "--add-header",
      platform === "instagram"
        ? "Referer:https://www.instagram.com/"
        : "Referer:https://www.facebook.com/",
      "--extractor-retries",
      "3",
      "--retry-sleep",
      "http:1"
    );

  }

  return args;
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

  // Instagram / TikTok / FB often ship progressive streams — keep generous fallbacks.
  if (isSocial) {
    switch (format) {
      case "mp3":
        return ["-f", "ba/b/best", "-x", "--audio-format", "mp3", "--audio-quality", "0"];
      case "webm":
        return ["-f", `bv*${h}+ba/b${h}/best`, "--merge-output-format", "webm"];
      case "mp4":
      default:
        return [
          "-f",
          `bv*${h}[ext=mp4]+ba[ext=m4a]/b${h}[ext=mp4]/bv*${h}+ba/b/best`,
          "--merge-output-format",
          "mp4",
        ];
    }
  }

  switch (format) {
    case "mp3":
      return ["-f", "ba/b", "-x", "--audio-format", "mp3", "--audio-quality", "0"];
    case "webm":
      return [
        "-f",
        `bv*${h}[ext=webm]+ba[ext=webm]/b${h}[ext=webm]/bv*${h}+ba/b`,
      ];
    case "mp4":
    default:
      return [
        "-f",
        `bv*${h}[ext=mp4]+ba[ext=m4a]/b${h}[ext=mp4]/bv*${h}+ba/b`,
        "--merge-output-format",
        "mp4",
      ];
  }
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

async function runYtDlpWithAuthFallback(platform, buildArgs) {
  // 1) Preferred auth (file or browser)
  try {
    return await runYtDlp(buildArgs({ withAuth: true }));
  } catch (firstErr) {
    // 2) If browser cookies failed (locked/DPAPI), retry without browser cookies
    //    but keep cookies file if present; then try alternate browsers.
    const cookieFile = resolveCookiesFile(platform);
    if (cookieFile) throw firstErr;

    if (!needsCookieRetry(firstErr) && platform !== "instagram") {
      throw firstErr;
    }

    const tried = new Set();
    const primary = resolveCookiesFromBrowser(platform);
    if (primary) tried.add(primary.split(":")[0]);

    const alternates = ["edge", "chrome", "brave", "firefox"].filter(
      (b) => !tried.has(b) && browserDataExists(b)
    );

    let lastErr = firstErr;
    for (const browser of alternates) {
      try {
        return await runYtDlp(
          buildArgs({ withAuth: true, forceBrowser: browser })
        );
      } catch (err) {
        lastErr = err;
      }
    }

    // 3) Last attempt without cookies (sometimes public posts still work)
    try {
      return await runYtDlp(buildArgs({ withAuth: false }));
    } catch (noAuthErr) {
      const msg = String(noAuthErr.message || "");
      if (/Instagram bloque|session connectée|cookies\/instagram/i.test(msg)) {
        throw noAuthErr;
      }
      throw lastErr;
    }
  }
}

function authArgsForAttempt(platform, { withAuth = true, forceBrowser = null } = {}) {
  if (!withAuth) return [];

  const cookieFile = resolveCookiesFile(platform);
  if (cookieFile) return ["--cookies", cookieFile];

  if (forceBrowser) return ["--cookies-from-browser", forceBrowser];

  return buildAuthArgs(platform);
}

async function downloadMedia(url, format, jobId, quality = "720") {
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

  const { stdout } = await runYtDlpWithAuthFallback(platform, ({ withAuth, forceBrowser }) => {
    const args = [
      "--no-playlist",
      "--no-warnings",
      "--newline",
      "--js-runtimes",
      "node",
      ...buildPlatformArgs(platform),
      ...authArgsForAttempt(platform, { withAuth, forceBrowser }),
      ...buildFormatArgs(format, safeQuality, platform),
      "-o",
      outputTemplate,
      "--print",
      "after_move:%(filepath)s",
      url,
    ];
    return args;
  });

  const lines = stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let filePath = [...lines].reverse().find((l) => fs.existsSync(l));

  if (!filePath) {
    const files = fs
      .readdirSync(jobDir)
      .filter((f) => !f.endsWith(".part") && !f.endsWith(".ytdl"))
      .map((f) => path.join(jobDir, f));

    if (!files.length) {
      throw new Error("Téléchargement terminé mais aucun fichier trouvé.");
    }

    filePath = files.sort(
      (a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs
    )[0];
  }

  const fileName = path.basename(filePath);
  const title = path.parse(fileName).name;

  return { filePath, fileName, title, quality: safeQuality, platform };
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

async function getMediaPreview(url) {
  if (!isSupportedUrl(url)) {
    throw new Error("Lien non supporté.");
  }

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

  return {
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
