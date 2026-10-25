# ClipShift

Télécharge et convertis des vidéos (YouTube, Instagram, Facebook, TikTok) — Node.js + Express, PostgreSQL optionnel.

> **GitHub = code source.** Pour un lien public en ligne (sans installer quoi que ce soit chez toi), il faut encore **déployer** l’app (ex. [Render](https://render.com/), [Railway](https://railway.app/)). Publier le repo ne met pas le site en ligne automatiquement.

## Prérequis

| Outil | Obligatoire | Notes |
|-------|-------------|--------|
| [Node.js](https://nodejs.org/) 18+ | Oui | Runtime |
| [yt-dlp](https://github.com/yt-dlp/yt-dlp) | Oui | Téléchargement des vidéos |
| [ffmpeg](https://ffmpeg.org/) | Oui | Conversion / mux audio-vidéo |
| [PostgreSQL](https://www.postgresql.org/) | Non | Optionnel — l’UI marche sans ; utile pour l’historique des jobs |

Sur Windows, tu peux installer yt-dlp et ffmpeg via [scoop](https://scoop.sh/) ou en les ajoutant au `PATH`.

## Installation

```bash
git clone https://github.com/<TON_USER>/ClipShift.git
cd ClipShift
npm install
copy .env.example .env
```

Édite `.env` si besoin (`PORT`, `DATABASE_URL`). **Ne commit jamais** ton `.env` ni des fichiers cookies.

Initialisation DB (optionnel) :

```bash
npm run db:init
```

## Lancer

```bash
npm start
```

Mode dev (recharge auto) :

```bash
npm run dev
```

Ouvre [http://localhost:3000](http://localhost:3000).

## Pages

| URL | Description |
|-----|-------------|
| `/` | Accueil |
| `/youtube` | YouTube |
| `/instagram` | Instagram |
| `/facebook` | Facebook |
| `/tiktok` | TikTok |

## API (aperçu)

- `GET /api/health`
- `POST /api/convert/url` — `{ "url": "...", "format": "mp4"|"mp3"|"webm" }`
- `POST /api/convert/youtube` / `instagram` / `facebook` / `tiktok` / `social` / `auto`
- `GET /api/convert/status/:id`
- `GET /api/convert/download/:id`
- `POST /api/convert/upload` — multipart `file` + `format`

## Cookies (réseaux sociaux)

Instagram / Facebook peuvent exiger une session. Voir `cookies/README.txt`.  
Place tes exports Netscape dans `cookies/` (ignoré par git — **ne les pousse jamais**).

## Licence / usage

Code source partagé pour que d’autres puissent voir, installer et utiliser le projet en local. Respecte les conditions d’utilisation des plateformes (YouTube, Meta, TikTok, etc.).
