(() => {
  const form = document.getElementById("convert-form");
  const urlInput = document.getElementById("video-url");
  const fileInput = document.getElementById("file-input");
  const statusEl = document.getElementById("form-status");
  const convertBtn = document.getElementById("btn-convert");
  const formatPills = document.querySelectorAll("#formats [data-format]");
  const qualityPills = document.querySelectorAll("#quality-group [data-quality]");
  const qualityGroup = document.getElementById("quality-group");
  const detectedEl = document.getElementById("detected-platform");

  const playerFrame = document.getElementById("player-frame");
  const previewThumb = document.getElementById("preview-thumb");
  const previewTitle = document.getElementById("preview-title");
  const previewTime = document.getElementById("preview-time");
  const previewEmbed = document.getElementById("preview-embed");
  const playBtn = document.getElementById("player-play");
  const barPlay = document.getElementById("bar-play");

  const PLATFORM_LABELS = {
    youtube: "YouTube",
    instagram: "Instagram",
    facebook: "Facebook",
    tiktok: "TikTok",
  };

  let selectedFormat = "mp4";
  let selectedQuality = "720";
  let pollTimer = null;
  let previewTimer = null;
  let currentVideoId = null;
  let currentPlatform = null;
  let previewRequest = 0;

  function setStatus(message, type = "") {
    statusEl.innerHTML = "";
    statusEl.className = `form-status${type ? ` is-${type}` : ""}`;
    if (typeof message === "string") {
      statusEl.textContent = message;
      return;
    }
    statusEl.appendChild(message);
  }

  function setDetected(text, type = "") {
    if (!detectedEl) return;
    detectedEl.textContent = text;
    detectedEl.className = `detected-platform${type ? ` is-${type}` : ""}`;
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

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
        if (["shorts", "embed", "live"].includes(parts[0])) {
          return parts[1] || null;
        }
      }
    } catch {
      return null;
    }
    return null;
  }

  function stopEmbed() {
    playerFrame.classList.remove("is-playing");
    if (previewEmbed) {
      previewEmbed.hidden = true;
      previewEmbed.innerHTML = "";
    }
  }

  function resetPreview() {
    currentVideoId = null;
    currentPlatform = null;
    stopEmbed();
    playerFrame.classList.remove("has-video");
    previewThumb.hidden = true;
    previewThumb.removeAttribute("src");
    previewTitle.textContent = "Aperçu vidéo";
    previewTime.textContent = "00:00 / 00:00";
    setDetected("Plateforme : détection automatique");
  }

  function showQuickThumb(videoId) {
    currentVideoId = videoId;
    stopEmbed();
    previewThumb.src = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    previewThumb.alt = "Miniature YouTube";
    previewThumb.hidden = false;
    playerFrame.classList.add("has-video");
    previewTitle.textContent = "Chargement de l’aperçu…";
  }

  function applyPreview(preview) {
    if (!preview) return;
    currentVideoId = preview.id || currentVideoId;
    currentPlatform = preview.platform || currentPlatform;
    if (preview.thumbnail) {
      previewThumb.src = preview.thumbnail;
      previewThumb.alt = preview.title || "Miniature";
      previewThumb.hidden = false;
      playerFrame.classList.add("has-video");
    }
    previewTitle.textContent = preview.title || "Vidéo";
    previewTitle.title = preview.title || "";
    if (preview.durationText) {
      previewTime.textContent = `00:00 / ${preview.durationText}`;
    }
    if (currentPlatform && PLATFORM_LABELS[currentPlatform]) {
      setDetected(`Plateforme détectée : ${PLATFORM_LABELS[currentPlatform]}`, "ready");
    }
  }

  async function loadPreview(url) {
    const reqId = ++previewRequest;
    const platform = detectPlatform(url);
    currentPlatform = platform;

    if (!platform) {
      resetPreview();
      if (url) setDetected("Lien non reconnu", "error");
      return;
    }

    setDetected(`Plateforme détectée : ${PLATFORM_LABELS[platform]}`, "ready");

    const videoId = extractVideoId(url);
    if (videoId) {
      showQuickThumb(videoId);
    } else {
      previewTitle.textContent = "Chargement de l’aperçu…";
    }

    try {
      const res = await fetch(
        `/api/convert/preview?url=${encodeURIComponent(url)}`
      );
      const data = await res.json();
      if (reqId !== previewRequest) return;

      if (!res.ok) {
        previewTitle.textContent = "Aperçu indisponible";
        return;
      }

      applyPreview(data.preview);
    } catch {
      if (reqId !== previewRequest) return;
      previewTitle.textContent = "Aperçu indisponible";
    }
  }

  function playPreview() {
    if (currentPlatform === "youtube" && currentVideoId && previewEmbed) {
      previewEmbed.innerHTML = "";
      const iframe = document.createElement("iframe");
      iframe.src = `https://www.youtube.com/embed/${currentVideoId}?autoplay=1&rel=0`;
      iframe.allow =
        "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
      iframe.allowFullscreen = true;
      iframe.title = previewTitle.textContent || "YouTube";
      previewEmbed.appendChild(iframe);
      previewEmbed.hidden = false;
      playerFrame.classList.add("is-playing");
      return;
    }

    const url = urlInput.value.trim();
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  function syncQualityVisibility() {
    qualityGroup.classList.toggle("is-hidden", selectedFormat === "mp3");
  }

  formatPills.forEach((pill) => {
    pill.addEventListener("click", () => {
      formatPills.forEach((p) => p.classList.remove("is-active"));
      pill.classList.add("is-active");
      selectedFormat = pill.dataset.format || "mp4";
      syncQualityVisibility();
    });
  });

  qualityPills.forEach((pill) => {
    pill.addEventListener("click", () => {
      qualityPills.forEach((p) => p.classList.remove("is-active"));
      pill.classList.add("is-active");
      selectedQuality = pill.dataset.quality || "720";
    });
  });

  syncQualityVisibility();

  urlInput.addEventListener("input", () => {
    clearTimeout(previewTimer);
    const url = urlInput.value.trim();

    if (!url) {
      resetPreview();
      return;
    }

    const platform = detectPlatform(url);
    if (platform) {
      setDetected(`Plateforme détectée : ${PLATFORM_LABELS[platform]}`, "ready");
      const videoId = extractVideoId(url);
      if (videoId) showQuickThumb(videoId);
    } else {
      setDetected("Lien non reconnu…", "error");
    }

    previewTimer = setTimeout(() => loadPreview(url), 450);
  });

  urlInput.addEventListener("paste", () => {
    setTimeout(() => {
      const url = urlInput.value.trim();
      if (url) loadPreview(url);
    }, 0);
  });

  playBtn.addEventListener("click", playPreview);
  barPlay.addEventListener("click", playPreview);

  function makeDownloadStatus(job, downloadUrl) {
    const qualityLabel =
      job.quality && job.quality !== "best"
        ? `${job.quality}p`
        : job.quality === "best"
          ? "Max"
          : "";
    const platformLabel = PLATFORM_LABELS[job.platform] || "";

    const wrap = document.createElement("span");
    wrap.appendChild(
      document.createTextNode(
        `Prêt${platformLabel ? ` (${platformLabel})` : ""}${
          job.original_filename ? ` — ${job.original_filename}` : ""
        }${qualityLabel ? ` · ${qualityLabel}` : ""} · `
      )
    );
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.textContent = "Télécharger le fichier";
    link.className = "download-link";
    wrap.appendChild(link);
    return wrap;
  }

  async function pollJob(jobId, { onDone, onError, onProgress }) {
    const res = await fetch(`/api/convert/status/${jobId}`);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Suivi impossible");
    }

    const job = data.job;

    if (job.status === "done" && data.downloadUrl) {
      onDone(job, data.downloadUrl);
      return "done";
    }

    if (job.status === "error") {
      onError(job.error_message || "Échec du téléchargement.");
      return "error";
    }

    onProgress(job);
    return job.status;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    stopPolling();

    const url = urlInput.value.trim();
    const platform = detectPlatform(url);

    if (!url) {
      setStatus("Colle un lien vidéo pour continuer.", "error");
      urlInput.focus();
      return;
    }

    if (!platform) {
      setStatus(
        "Lien non supporté. Utilise YouTube, Instagram, Facebook ou TikTok.",
        "error"
      );
      return;
    }

    loadPreview(url);

    convertBtn.disabled = true;
    const qualityHint =
      selectedFormat === "mp3"
        ? "audio"
        : selectedQuality === "best"
          ? "Max"
          : `${selectedQuality}p`;
    const label = PLATFORM_LABELS[platform];
    setStatus(`Démarrage ${label} (${qualityHint})…`);

    try {
      const res = await fetch("/api/convert/auto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          format: selectedFormat,
          quality: selectedFormat === "mp3" ? "best" : selectedQuality,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Erreur serveur");
      }

      const jobId = data.job?.id;
      if (!jobId) {
        throw new Error("Job non créé.");
      }

      const handlers = {
        onDone: (job, downloadUrl) => {
          stopPolling();
          convertBtn.disabled = false;
          setStatus(makeDownloadStatus(job, downloadUrl), "ok");
        },
        onError: (msg) => {
          stopPolling();
          convertBtn.disabled = false;
          setStatus(msg, "error");
        },
        onProgress: (job) => {
          const name = PLATFORM_LABELS[job.platform] || label;
          setStatus(
            job.status === "processing"
              ? `Téléchargement ${name} en cours…`
              : "Préparation…"
          );
        },
      };

      await pollJob(jobId, handlers);
      pollTimer = setInterval(async () => {
        try {
          const state = await pollJob(jobId, handlers);
          if (state === "done" || state === "error") stopPolling();
        } catch (err) {
          stopPolling();
          convertBtn.disabled = false;
          setStatus(err.message || "Erreur de suivi.", "error");
        }
      }, 2000);
    } catch (err) {
      convertBtn.disabled = false;
      setStatus(err.message || "Impossible d’envoyer la demande.", "error");
    }
  });

  if (fileInput) {
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;

      const body = new FormData();
      body.append("file", file);
      body.append("format", selectedFormat);

      convertBtn.disabled = true;
      setStatus(`Upload de « ${file.name} »…`);

      try {
        const res = await fetch("/api/convert/upload", {
          method: "POST",
          body,
        });
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Erreur upload");
        }

        setStatus(
          `Fichier reçu — job ${data.job?.id || "créé"} (${selectedFormat.toUpperCase()}).`,
          "ok"
        );
      } catch (err) {
        setStatus(err.message || "Upload impossible.", "error");
      } finally {
        convertBtn.disabled = false;
        fileInput.value = "";
      }
    });
  }
})();
