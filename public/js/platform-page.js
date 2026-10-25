(() => {
  const root = document.querySelector("[data-platform-page]");
  if (!root) return;

  const platform = root.dataset.platformPage;
  const labels = {
    youtube: "YouTube",
    instagram: "Instagram",
    facebook: "Facebook",
    tiktok: "TikTok",
  };
  const label = labels[platform] || platform;

  const form = document.getElementById("convert-form");
  const urlInput = document.getElementById("video-url");
  const statusEl = document.getElementById("form-status");
  const convertBtn = document.getElementById("btn-convert");
  const formatPills = document.querySelectorAll("#formats [data-format]");
  const qualityPills = document.querySelectorAll("#quality-group [data-quality]");
  const qualityGroup = document.getElementById("quality-group");
  const playerFrame = document.getElementById("player-frame");
  const previewThumb = document.getElementById("preview-thumb");
  const previewTitle = document.getElementById("preview-title");
  const previewTime = document.getElementById("preview-time");
  const previewEmbed = document.getElementById("preview-embed");
  const playBtn = document.getElementById("player-play");
  const barPlay = document.getElementById("bar-play");

  let selectedFormat = "mp4";
  let selectedQuality = "720";
  let pollTimer = null;
  let previewTimer = null;
  let previewRequest = 0;
  let currentVideoId = null;

  function setStatus(message, type = "") {
    statusEl.innerHTML = "";
    statusEl.className = `form-status${type ? ` is-${type}` : ""}`;
    if (typeof message === "string") {
      statusEl.textContent = message;
      return;
    }
    statusEl.appendChild(message);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function syncQualityVisibility() {
    qualityGroup.classList.toggle("is-hidden", selectedFormat === "mp3");
  }

  function resetPreview() {
    playerFrame.classList.remove("has-video", "is-playing");
    previewThumb.hidden = true;
    previewThumb.removeAttribute("src");
    previewTitle.textContent = `Aperçu ${label}`;
    previewTime.textContent = "00:00 / 00:00";
  }

  function applyPreview(preview) {
    if (!preview) return;
    currentVideoId = preview.id || currentVideoId;
    previewTitle.textContent = preview.title || label;
    previewTitle.title = preview.title || "";
    if (preview.thumbnail) {
      previewThumb.src = preview.thumbnail;
      previewThumb.alt = preview.title || "";
      previewThumb.hidden = false;
      playerFrame.classList.add("has-video");
    }
    if (preview.durationText) {
      previewTime.textContent = `00:00 / ${preview.durationText}`;
    }
  }

  async function loadPreview(url) {
    const reqId = ++previewRequest;
    if (!url) {
      resetPreview();
      return;
    }
    previewTitle.textContent = "Chargement…";
    try {
      const res = await fetch(
        `/api/convert/preview?url=${encodeURIComponent(url)}`
      );
      const data = await res.json();
      if (reqId !== previewRequest) return;
      if (!res.ok) {
        previewTitle.textContent = "Aperçu indisponible";
        const hint = (data && data.error) || "";
        if (hint && /instagram|cookie|session/i.test(hint)) {
          setStatus(hint, "error");
        }
        return;
      }
      applyPreview(data.preview);
    } catch {
      if (reqId !== previewRequest) return;
      previewTitle.textContent = "Aperçu indisponible";
    }
  }

  function makeDownloadStatus(job, downloadUrl) {
    const qualityLabel =
      job.quality && job.quality !== "best"
        ? `${job.quality}p`
        : job.quality === "best"
          ? "Max"
          : "";
    const wrap = document.createElement("span");
    wrap.appendChild(
      document.createTextNode(
        `Prêt${job.original_filename ? ` — ${job.original_filename}` : ""}${
          qualityLabel ? ` (${qualityLabel})` : ""
        } · `
      )
    );
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.textContent = "Télécharger le fichier";
    link.className = "download-link";
    wrap.appendChild(link);
    return wrap;
  }

  async function pollJob(jobId) {
    const res = await fetch(`/api/convert/status/${jobId}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Suivi impossible");

    const job = data.job;
    if (job.status === "done" && data.downloadUrl) {
      stopPolling();
      convertBtn.disabled = false;
      setStatus(makeDownloadStatus(job, data.downloadUrl), "ok");
      return "done";
    }
    if (job.status === "error") {
      stopPolling();
      convertBtn.disabled = false;
      setStatus(job.error_message || "Échec du téléchargement.", "error");
      return "error";
    }
    setStatus(
      job.status === "processing"
        ? `Téléchargement ${label} en cours…`
        : "Préparation…"
    );
    return job.status;
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
    previewTimer = setTimeout(() => loadPreview(url), 500);
  });

  urlInput.addEventListener("paste", () => {
    setTimeout(() => {
      const url = urlInput.value.trim();
      if (url) loadPreview(url);
    }, 0);
  });

  function extractYouTubeId(url = "") {
    try {
      const u = new URL(url);
      const host = u.hostname.replace(/^www\./, "");
      if (host === "youtu.be") return u.pathname.replace(/^\//, "").split("/")[0] || null;
      if (host.endsWith("youtube.com")) {
        if (u.searchParams.get("v")) return u.searchParams.get("v");
        const parts = u.pathname.split("/").filter(Boolean);
        if (["shorts", "embed", "live"].includes(parts[0])) return parts[1] || null;
      }
    } catch {
      return null;
    }
    return null;
  }

  function openSource() {
    if (platform === "youtube") {
      const id = currentVideoId || extractYouTubeId(urlInput.value.trim());
      if (id && previewEmbed) {
        previewEmbed.innerHTML = "";
        const iframe = document.createElement("iframe");
        iframe.src = `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`;
        iframe.allow =
          "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
        iframe.allowFullscreen = true;
        iframe.title = previewTitle.textContent || "YouTube";
        previewEmbed.appendChild(iframe);
        previewEmbed.hidden = false;
        playerFrame.classList.add("is-playing");
        return;
      }
    }
    const url = urlInput.value.trim();
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  playBtn.addEventListener("click", openSource);
  barPlay.addEventListener("click", openSource);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    stopPolling();

    const url = urlInput.value.trim();
    if (!url) {
      setStatus(`Colle un lien ${label}.`, "error");
      urlInput.focus();
      return;
    }

    convertBtn.disabled = true;
    const qHint =
      selectedFormat === "mp3"
        ? "audio"
        : selectedQuality === "best"
          ? "Max"
          : `${selectedQuality}p`;
    setStatus(`Démarrage ${label} (${qHint})…`);
    loadPreview(url);

    try {
      const res = await fetch(`/api/convert/${platform}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          format: selectedFormat,
          quality: selectedFormat === "mp3" ? "best" : selectedQuality,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur serveur");

      const jobId = data.job?.id;
      if (!jobId) throw new Error("Job non créé.");

      await pollJob(jobId);
      pollTimer = setInterval(async () => {
        try {
          const state = await pollJob(jobId);
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
})();
