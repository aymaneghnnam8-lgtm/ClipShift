(() => {
  const API = String(window.CLIPSHIFT_API_BASE || "").replace(/\/+$/, "");
  const pagePlatform = document.body.dataset.platformPage || null;

  const $ = (id) => document.getElementById(id);
  const form = $("convert-form");
  if (!form) return;

  const urlInput = $("video-url");
  const convertBtn = $("btn-convert");
  const pasteBtn = $("btn-paste");
  const clearBtn = $("btn-clear");
  const options = $("options");
  const formatBtns = document.querySelectorAll("#formats [data-format]");
  const qualityBtns = document.querySelectorAll("#quality-group [data-quality]");
  const detectedEl = $("detected-platform");
  const detectedText = detectedEl.querySelector(".detected__text");

  const media = $("media");
  const thumb = $("preview-thumb");
  const embed = $("preview-embed");
  const playBtn = $("player-play");
  const badgePlatform = $("preview-platform");
  const badgeDuration = $("preview-duration");
  const titleEl = $("preview-title");
  const subEl = $("preview-sub");

  const jobEl = $("job");
  const jobIcon = $("job-icon");
  const jobText = $("job-text");
  const jobPct = $("job-pct");
  const jobProgress = $("job-progress");
  const jobBar = $("job-bar");
  const jobActions = $("job-actions");
  const toastEl = $("toast");

  const LABELS = {
    youtube: "YouTube",
    instagram: "Instagram",
    facebook: "Facebook",
    tiktok: "TikTok",
  };

  const ICONS = {
    check:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    alert:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 7v6M12 17h.01"/></svg>',
    download:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
    retry:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4"/></svg>',
  };

  const state = {
    format: "mp4",
    quality: "720",
    platform: null,
    videoId: null,
    pollTimer: null,
    previewTimer: null,
    previewReq: 0,
    busy: false,
  };

  /* ---------- Utils ---------- */

  function apiUrl(path) {
    return `${API}${path}`;
  }

  /** fetch JSON robuste : gère les réponses HTML (404 Vercel, proxy…) et le réseau. */
  async function fetchJson(path, init) {
    let res;
    try {
      res = await fetch(apiUrl(path), init);
    } catch {
      throw new Error("Serveur de conversion injoignable. Vérifie ta connexion et réessaie.");
    }
    const type = res.headers.get("content-type") || "";
    if (!type.includes("application/json")) {
      throw new Error(
        res.status === 404 || res.status === 405
          ? "Le serveur de conversion n’est pas configuré sur ce site."
          : `Erreur serveur (${res.status}). Réessaie dans un instant.`
      );
    }
    const data = await res.json();
    if (!res.ok) {
      const err = new Error(data.error || `Erreur serveur (${res.status}).`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  let toastTimer;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("is-visible"), 2600);
  }

  function formatBytes(n) {
    if (!n) return "";
    const units = ["o", "Ko", "Mo", "Go"];
    let i = 0;
    while (n >= 1024 && i < units.length - 1) {
      n /= 1024;
      i += 1;
    }
    return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
  }

  function detectPlatform(url = "") {
    try {
      const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
      if (["youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"].includes(host)) {
        return "youtube";
      }
      if (
        ["facebook.com", "m.facebook.com", "fb.watch", "fb.com"].includes(host) ||
        host.endsWith(".facebook.com")
      ) {
        return "facebook";
      }
      if (host === "instagram.com" || host === "instagr.am") return "instagram";
      if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return "tiktok";
    } catch {
      return null;
    }
    return null;
  }

  function extractYouTubeId(url = "") {
    try {
      const u = new URL(url);
      const host = u.hostname.replace(/^www\./, "");
      if (host === "youtu.be") return u.pathname.slice(1).split("/")[0] || null;
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

  /** Accepte aussi les liens collés sans « https:// ». */
  function normalizeUrl(raw) {
    const v = String(raw || "").trim();
    if (!v) return "";
    if (/^https?:\/\//i.test(v)) return v;
    if (/^[\w.-]+\.[a-z]{2,}\//i.test(v)) return `https://${v}`;
    return v;
  }

  /* ---------- Détection & aperçu ---------- */

  function setDetected(text, type = "") {
    detectedText.textContent = text;
    detectedEl.className = `detected${type ? ` is-${type}` : ""}`;
  }

  function validatePlatform(platform) {
    if (!platform) return "Lien non reconnu — utilise YouTube, Instagram, Facebook ou TikTok.";
    if (pagePlatform && platform !== pagePlatform) {
      return `Ce lien est ${LABELS[platform]}. Ici, colle un lien ${LABELS[pagePlatform]} — ou utilise l’accueil.`;
    }
    return null;
  }

  function stopEmbed() {
    media.classList.remove("is-playing");
    embed.hidden = true;
    embed.innerHTML = "";
  }

  function setThumb(src, alt = "") {
    if (!src) return;
    if (thumb.getAttribute("src") === src) return;
    thumb.classList.remove("is-loaded");
    thumb.alt = alt;
    thumb.onload = () => {
      thumb.classList.add("is-loaded");
      media.classList.add("has-thumb");
      media.classList.remove("is-loading");
    };
    thumb.onerror = () => {
      thumb.classList.remove("is-loaded");
      media.classList.remove("has-thumb", "is-loading");
    };
    thumb.src = src;
  }

  function resetPreview() {
    state.platform = null;
    state.videoId = null;
    state.previewReq += 1;
    stopEmbed();
    media.classList.remove("has-thumb", "is-loading");
    thumb.classList.remove("is-loaded");
    thumb.removeAttribute("src");
    badgePlatform.hidden = true;
    badgeDuration.hidden = true;
    titleEl.textContent = "Aucune vidéo sélectionnée";
    subEl.textContent = "MP4, MP3 ou WebM · jusqu’en 1080p";
    setDetected(
      pagePlatform ? `Plateforme : ${LABELS[pagePlatform]}` : "Plateforme : détection automatique"
    );
  }

  function showLoadingMeta() {
    titleEl.innerHTML = '<span class="skeleton" style="width:85%"></span>';
    subEl.innerHTML = '<span class="skeleton" style="width:40%;margin-top:.5rem"></span>';
  }

  function applyPreview(p) {
    if (!p) return;
    if (p.id && state.platform === "youtube") state.videoId = p.id;
    if (p.thumbnail) setThumb(p.thumbnail, p.title || "");
    else media.classList.remove("is-loading");
    titleEl.textContent = p.title || "Vidéo";
    titleEl.title = p.title || "";
    subEl.textContent = [p.channel, LABELS[p.platform]].filter(Boolean).join(" · ");
    if (p.duration) {
      badgeDuration.textContent = p.durationText;
      badgeDuration.hidden = false;
    }
  }

  async function loadPreview(url) {
    const req = ++state.previewReq;
    media.classList.add("is-loading");
    showLoadingMeta();
    try {
      const data = await fetchJson(`/api/convert/preview?url=${encodeURIComponent(url)}`);
      if (req !== state.previewReq) return;
      applyPreview(data.preview);
    } catch (err) {
      if (req !== state.previewReq) return;
      media.classList.remove("is-loading");
      titleEl.textContent = state.videoId ? "Vidéo YouTube" : "Aperçu indisponible";
      subEl.textContent = err.status === 502 ? err.message : "Tu peux quand même lancer la conversion.";
    }
  }

  function onUrlChange({ immediate = false } = {}) {
    clearTimeout(state.previewTimer);
    const url = normalizeUrl(urlInput.value);
    clearBtn.hidden = !urlInput.value;

    if (!url) {
      resetPreview();
      return;
    }

    const platform = detectPlatform(url);
    const problem = validatePlatform(platform);
    if (problem) {
      state.previewReq += 1;
      setDetected(problem, "error");
      return;
    }

    setDetected(`Plateforme détectée : ${LABELS[platform]}`, "ready");
    if (platform !== state.platform) stopEmbed();
    state.platform = platform;
    badgePlatform.textContent = LABELS[platform];
    badgePlatform.hidden = false;

    const ytId = platform === "youtube" ? extractYouTubeId(url) : null;
    state.videoId = ytId;
    if (ytId) setThumb(`https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`, "Miniature YouTube");

    state.previewTimer = setTimeout(() => loadPreview(url), immediate ? 0 : 450);
  }

  function playPreview() {
    if (state.platform === "youtube" && state.videoId) {
      embed.innerHTML = "";
      const iframe = document.createElement("iframe");
      iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(state.videoId)}?autoplay=1&rel=0`;
      iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
      iframe.allowFullscreen = true;
      iframe.title = titleEl.textContent || "YouTube";
      embed.appendChild(iframe);
      embed.hidden = false;
      media.classList.add("is-playing");
      return;
    }
    const url = normalizeUrl(urlInput.value);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  /* ---------- Options ---------- */

  function bindSegmented(buttons, key, after) {
    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        buttons.forEach((b) => {
          b.classList.toggle("is-active", b === btn);
          b.setAttribute("aria-checked", String(b === btn));
        });
        state[key] = btn.dataset[key];
        if (after) after();
      });
    });
  }

  function syncAudioMode() {
    options.classList.toggle("is-audio", state.format === "mp3");
  }

  bindSegmented(formatBtns, "format", syncAudioMode);
  bindSegmented(qualityBtns, "quality");
  syncAudioMode();

  /* ---------- Job UI ---------- */

  function setBusy(busy) {
    state.busy = busy;
    convertBtn.disabled = busy;
    convertBtn.classList.toggle("is-loading", busy);
    convertBtn.querySelector(".btn__label").textContent = busy ? "Conversion…" : "Convertir";
  }

  function showJob({ kind, text, progress = null }) {
    jobEl.hidden = false;
    jobEl.classList.toggle("is-done", kind === "done");
    jobEl.classList.toggle("is-error", kind === "error");
    jobText.textContent = text;
    jobIcon.innerHTML =
      kind === "done" ? ICONS.check : kind === "error" ? ICONS.alert : '<span class="btn__spinner"></span>';

    const indeterminate = kind === "working" && (progress === null || progress <= 0);
    jobProgress.classList.toggle("is-indeterminate", indeterminate);
    jobBar.style.width = indeterminate ? "" : `${Math.max(0, Math.min(100, progress || 0))}%`;
    jobPct.textContent = kind === "working" && progress > 0 ? `${progress}%` : "";
    jobActions.hidden = true;
    jobActions.innerHTML = "";
  }

  function addAction(html, onClick, href) {
    const el = document.createElement(href ? "a" : "button");
    el.className = html.primary ? "btn btn--primary" : "btn btn--ghost";
    el.innerHTML = html.content;
    if (href) {
      el.href = href;
      el.setAttribute("download", "");
    } else {
      el.type = "button";
    }
    if (onClick) el.addEventListener("click", onClick);
    jobActions.appendChild(el);
    jobActions.hidden = false;
    return el;
  }

  function stopPolling() {
    clearTimeout(state.pollTimer);
    state.pollTimer = null;
  }

  function finishDone(job, downloadUrl) {
    setBusy(false);
    const quality = state.format === "mp3" ? "Audio" : job.quality === "best" ? "Max" : `${job.quality}p`;
    const size = formatBytes(job.size);
    showJob({
      kind: "done",
      text: `Prêt · ${job.format.toUpperCase()} · ${quality}${size ? ` · ${size}` : ""}`,
      progress: 100,
    });
    const href = apiUrl(downloadUrl);
    addAction({ primary: true, content: `${ICONS.download}Télécharger` }, null, href);
    addAction({ content: "Nouvelle conversion" }, () => {
      urlInput.value = "";
      onUrlChange();
      jobEl.hidden = true;
      urlInput.focus();
    });
    toast("Ton fichier est prêt ✓");
  }

  function finishError(message) {
    stopPolling();
    setBusy(false);
    showJob({ kind: "error", text: message });
    addAction({ content: `${ICONS.retry}Réessayer` }, () => form.requestSubmit());
  }

  async function poll(jobId, failures = 0) {
    try {
      const data = await fetchJson(`/api/convert/status/${encodeURIComponent(jobId)}`);
      const job = data.job;

      if (job.status === "done" && data.downloadUrl) {
        stopPolling();
        finishDone(job, data.downloadUrl);
        return;
      }
      if (job.status === "error") {
        finishError(job.error_message || "Échec du téléchargement.");
        return;
      }

      const label = LABELS[job.platform] || "";
      if (job.status === "pending") {
        showJob({
          kind: "working",
          text: job.position > 1 ? `En file d’attente (position ${job.position})…` : "Préparation…",
        });
      } else if (job.progress >= 95) {
        showJob({ kind: "working", text: "Conversion et finalisation…", progress: job.progress });
      } else {
        showJob({
          kind: "working",
          text: `Téléchargement ${label}…`,
          progress: job.progress || null,
        });
      }
      state.pollTimer = setTimeout(() => poll(jobId), 1200);
    } catch (err) {
      // Tolère quelques erreurs réseau passagères avant d’abandonner.
      if (failures < 3 && err.status !== 404) {
        state.pollTimer = setTimeout(() => poll(jobId, failures + 1), 2000);
        return;
      }
      finishError(err.message || "Suivi impossible.");
    }
  }

  /* ---------- Events ---------- */

  urlInput.addEventListener("input", () => onUrlChange());
  urlInput.addEventListener("paste", () => setTimeout(() => onUrlChange({ immediate: true }), 0));

  clearBtn.addEventListener("click", () => {
    urlInput.value = "";
    onUrlChange();
    urlInput.focus();
  });

  if (!navigator.clipboard || !navigator.clipboard.readText) {
    pasteBtn.hidden = true;
  } else {
    pasteBtn.addEventListener("click", async () => {
      try {
        const text = (await navigator.clipboard.readText()).trim();
        if (!text) {
          toast("Le presse-papiers est vide.");
          return;
        }
        urlInput.value = text;
        onUrlChange({ immediate: true });
      } catch {
        toast("Autorise l’accès au presse-papiers, ou colle avec Ctrl+V.");
        urlInput.focus();
      }
    });
  }

  playBtn.addEventListener("click", playPreview);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (state.busy) return;
    stopPolling();

    const url = normalizeUrl(urlInput.value);
    if (!url) {
      setDetected("Colle un lien vidéo pour continuer.", "error");
      urlInput.focus();
      return;
    }

    const platform = detectPlatform(url);
    const problem = validatePlatform(platform);
    if (problem) {
      setDetected(problem, "error");
      urlInput.focus();
      return;
    }

    if (urlInput.value !== url) urlInput.value = url;
    if (platform !== state.platform) onUrlChange({ immediate: true });

    setBusy(true);
    showJob({ kind: "working", text: `Connexion à ${LABELS[platform]}…` });

    try {
      const endpoint = pagePlatform ? `/api/convert/${pagePlatform}` : "/api/convert/auto";
      const data = await fetchJson(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          format: state.format,
          quality: state.format === "mp3" ? "best" : state.quality,
        }),
      });
      if (!data.job || !data.job.id) throw new Error("La conversion n’a pas pu démarrer.");
      poll(data.job.id);
    } catch (err) {
      finishError(err.message || "Impossible d’envoyer la demande.");
    }
  });

  /* ---------- Chrome : header & animations ---------- */

  const header = $("site-header");
  const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 8);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // Mobile : la barre de navigation défile, on centre l’onglet actif.
  const nav = header.querySelector(".nav");
  const activeLink = nav && nav.querySelector(".is-active");
  if (activeLink && nav.scrollWidth > nav.clientWidth) {
    nav.scrollLeft = activeLink.offsetLeft - (nav.clientWidth - activeLink.offsetWidth) / 2;
  }

  const revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px" }
    );
    revealEls.forEach((el, i) => {
      el.style.transitionDelay = `${(i % 4) * 60}ms`;
      io.observe(el);
    });
  } else {
    revealEls.forEach((el) => el.classList.add("is-visible"));
  }

  resetPreview();
})();
