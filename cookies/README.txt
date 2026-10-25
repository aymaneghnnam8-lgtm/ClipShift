Cookies Instagram / Facebook (ClipShift)
========================================

Instagram bloque presque toujours yt-dlp sans session connectée.

Option A — fichier cookies (recommandé, le plus fiable sur Windows)
1. Installe l’extension navigateur "Get cookies.txt LOCALLY"
2. Connecte-toi sur https://www.instagram.com
3. Exporte les cookies au format Netscape
4. Enregistre le fichier ici :
   cookies/instagram.txt
5. Relance le téléchargement sur ClipShift

Option B — cookies depuis le navigateur (peut échouer sur Windows récent)
Les versions récentes d’Edge/Chrome chiffrent les cookies (DPAPI / App-Bound
Encryption) : yt-dlp ne peut souvent plus les lire. Si ça échoue, utilise
l’option A.

Variables d’environnement optionnelles :
  YTDLP_COOKIES=C:\chemin\vers\cookies.txt
  YTDLP_COOKIES_FROM_BROWSER=edge
