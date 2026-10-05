# Scan Carte

Application web (PWA, installable sur iPhone/Android) pour numériser une carte de visite :

1. **Détection des bords** de la carte (contours + seuillage d'Otsu, quadrilatère optimal) avec coins ajustables au doigt.
2. **Correction de la déformation** : redressement de perspective par homographie, avec estimation du vrai format de la carte (85×55, 3,5×2 in…).
3. **Qualité d'image** : uniformisation de l'éclairage, étirement des niveaux, netteté, modes Couleur / Document N&B / Gris, alerte si photo floue.
4. **Enregistrement dans Photos** via la feuille de partage du système (« Enregistrer l'image » sur iOS, Galerie sur Android) ; repli sur un téléchargement JPEG.

Aucune dépendance, tout est traité localement sur l'appareil (rien n'est envoyé).

## Lancer

    python3 -m http.server 8000     # puis ouvrir http://localhost:8000

La caméra et le partage de fichiers exigent HTTPS sur un téléphone (GitHub Pages, Netlify, etc.), `localhost` fait exception.

## Tests

    node test/test.js

Génère des scènes synthétiques (carte projetée par une vraie caméra, fonds clair/sombre, forte rotation) et vérifie coins, rapport d'aspect, éclairage et mesure de netteté.

## Limites

- Un site web ne peut pas écrire silencieusement dans la photothèque : l'utilisateur confirme via la feuille de partage. Un enregistrement direct nécessiterait une app native (iOS/Android).
- La détection suppose un fond qui contraste avec la carte ; sinon, ajustez les coins à la main.
- Le sens de lecture n'est pas détecté : utilisez « Pivoter ».
