# Fonctionnalités de Mine de Rien

## Gameplay

- ✅ Démineur classique : révélation, drapeaux, chord-click (clic groupé sur un chiffre)
- ✅ Premier clic toujours sûr (zone 3×3 exclue du tirage des mines)
- ✅ Vagues progressives : grille et nombre de mines croissants
- ✅ 6 pouvoirs : Bouclier, Scanner, Démineur, Radar, Gel Tempo, Indice
- ✅ Choix d'un pouvoir parmi 3 à la fin de chaque vague
- ✅ Bonus cachés (⭐ étoile, 💎 gemme, ⚡ combo) ramassés même via flood-fill ou Scanner
- ✅ Système de combo sur les révélations rapprochées
- ⬜ Mode classique sans vagues ni pouvoirs

## Score et progression

- ✅ Notation en étoiles (1 à 3) selon le temps mis à finir la vague
- ✅ Bonus de temps et bonus de vague à la complétion
- ✅ Record personnel en `localStorage`
- ⬜ Historique des meilleures vagues, pas seulement le score

## Audio

- ✅ Tout est synthétisé en Web Audio, aucun fichier son
- ✅ SFX pour chaque action : révélation, drapeau, explosion, combo, pouvoirs, victoire de vague
- ✅ Nappe d'ambiance procédurale avec carillons aléatoires
- ✅ Réglage du volume

## Interface

- ✅ HUD façon démineur classique (compteur de mines, chrono, smiley réactif)
- ✅ Tutoriel intégré (onboarding en 6 étapes)
- ✅ Règles consultables en jeu (onglets règles/bonus/contrôles)
- ✅ Effets visuels : particules, popups de bonus, secousse à l'explosion
- ✅ Aucun débordement horizontal, y compris en 390×844

## Mobile

- ✅ Bascule tactile Révélation / Drapeau
- ✅ Détection du premier `touchstart` pour activer le mode tactile
- ⬜ Cibles tactiles pas explicitement agrandies pour les petits écrans

## Technique

- ✅ Build en un seul fichier (~277 Ko), fonctionne hors ligne
- ✅ TypeScript strict
- ✅ Bloc SEO complet, favicon, og-image (capture réelle du jeu)
- ⬜ Boucle de reset de vague dédoublée (voir todo.md)
- ⬜ Tests unitaires sur la logique de plateau (`placeMines`, `flood`, `checkWin`)
