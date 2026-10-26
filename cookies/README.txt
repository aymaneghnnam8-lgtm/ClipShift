Cookies Instagram / Facebook (ClipShift)
========================================

Sans cookies de session, Instagram et Facebook échouent presque toujours.
TikTok peut aussi bloquer l’IP du serveur (indépendant des cookies).

1. Installe l’extension navigateur « Get cookies.txt LOCALLY »
2. Connecte-toi sur https://www.instagram.com (et/ou Facebook) dans ce navigateur
3. Exporte les cookies (format Netscape)
4. Enregistre ici :
   - cookies/instagram.txt
   - cookies/facebook.txt
5. Redémarre le serveur ClipShift (npm start)

Ne commit jamais ces fichiers (.gitignore).

Optionnel (souvent cassé sur Windows) :
  YTDLP_COOKIES_FROM_BROWSER=edge
