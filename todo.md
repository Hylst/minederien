# TODO de Mine de Rien

Audit fait le 2026-07-31 sur l'export brut (`build-minesweeper-web-game vA.zip`), suivi d'une
passe QA navigateur (Playwright + Chromium) avec vérification déterministe des deux bugs les
plus sérieux.

---

## ✅ Corrigé — bugs

- [x] **Le pouvoir « Gel Tempo » ne gelait rien du tout.** `startTimer` créait un
  `setInterval` dont le callback lisait la variable `frozen` capturée par fermeture au moment
  de la création (au premier clic, donc toujours `false`). Activer le power-up mettait bien
  à jour l'état React `frozen`, mais l'intervalle déjà lancé continuait de lire son ancienne
  valeur figée : le chronomètre ne s'arrêtait jamais. Corrigé avec un `frozenRef` tenu à jour
  par un `useEffect`, lu par le callback à la place de l'état. **Vérifié en navigateur** :
  chronomètre identique avant et après activation du gel sur une fenêtre de 2,6 s (contre une
  progression continue avant le correctif).
- [x] **Les bonus révélés par un flood-fill ou par le Scanner devenaient impossibles à
  ramasser.** `collectBonus(r, c, cl)` n'était appelée que pour la cellule directement
  cliquée. Or un flood-fill (case à 0 mine adjacente) ou le power-up Scanner révèlent
  plusieurs cellules d'un coup — toute cellule à bonus ainsi révélée restait affichée
  (l'icône ⭐/💎/⚡ reste visible tant que `bonusCollected` est faux) mais ne pouvait plus
  jamais être cliquée puisqu'une cellule révélée ne réagit plus au clic : le bonus devenait
  une décoration inutile pour toujours. Remplacé par `collectBonuses(oldBoard, newBoard)`,
  qui compare l'ancien plateau au nouveau et ramasse le bonus de **toute** cellule qui vient
  de passer à révélée, peu importe comment. Appelé après le flood-fill, après le clic groupé
  (chord-click) et après le Scanner. **Vérifié en navigateur** : un bonus forcé sur une
  cellule *hors* du clic d'origine, balayée par le flood-fill, disparaît immédiatement de
  l'affichage (preuve qu'il a bien été comptabilisé) au lieu de rester affiché indéfiniment.

## ✅ Corrigé — cohérence et intégration

- [x] Renommé en **Mine de Rien** — le nom d'origine, « Démineur Évolutif », sonnait généré
  par IA. Le nouveau nom est un jeu de mots sur l'expression française et sur les mines du
  jeu. Titre, en-tête, pied de page, clé `localStorage` (`demineur_hs` → `minederien_hs`).
- [x] `base: '/minederien/'` ajouté dans `vite.config.ts`, il n'y en avait aucun.
- [x] `index.html` : `lang="en"` corrigé en `lang="fr"`, bloc SEO complet (description,
  keywords, og, twitter, robots, canonical, theme-color), `<link rel="icon">`.
- [x] `package.json` : `react-vite-tailwind` v0.0.0 devenu `mine-de-rien` v1.0.0.

## ✅ La passe QA navigateur

- [x] 0 erreur console, 0 exception non gérée sur l'ensemble des runs
- [x] Révélation d'une cellule sûre, flood-fill, chiffres corrects
- [x] Poser et retirer un drapeau
- [x] Chronomètre qui démarre au premier clic
- [x] **Vérification déterministe du fix Gel Tempo** (sac de power-up forcé, chrono figé
  observé sur 2,6 s)
- [x] **Vérification déterministe du fix bonus** (bonus forcé sur une cellule balayée par
  flood-fill, disparition confirmant la collecte)
- [x] Complétion de vague et bonus de plateau vidé (`checkWin`)
- [x] Viewport mobile 390×844 : aucun débordement horizontal
- [x] Screenshot de gameplay réel capturé pour `og-image.png`/`.webp` et `icon.webp`

---

## ⬜ Idées d'amélioration

### Game design
- [ ] **Wave 1 se termine presque toujours en un clic.** `waveCfg(1)` donne une grille 6×6
  avec seulement 2 mines : le premier clic déclenche quasi systématiquement un flood-fill qui
  vide tout le plateau d'un coup, sans laisser au joueur l'occasion de vraiment déminer. Une
  densité de départ plus élevée (ou une grille plus petite) rendrait la vague 1 plus
  significative.
- [ ] Le radar (`useRadar`) ajoute 20 points à chaque utilisation sans condition — utiliser un
  pouvoir gratuitement en plus de l'information qu'il donne. Vérifier si c'est voulu.
- [ ] Le bonus "combo" (`bumpCombo()` × 3) peut lui-même déclencher un flood-fill en cascade
  s'il tombe sur une case à 0 mine adjacente déjà couverte par une révélation groupée — pas
  bugué, mais l'effet cumulé avec les combos de la même frame n'a pas été testé à haute vague.

### Fonctionnalités
- [ ] Un mode "classique" sans vagues/power-ups pour les puristes du démineur
- [ ] Historique des meilleures vagues atteintes, pas seulement le meilleur score
- [ ] Remappage des touches / contrôles clavier (actuellement tout au clic/tactile)

### Technique
- [ ] **Double réinitialisation à chaque vague.** `startNextWave` réinitialise manuellement
  le plateau/l'état, et le `useEffect` sur `[wave]` fait exactement la même chose juste
  après (puisque `wave` a changé). Résultat correct mais deux fois plus de travail que
  nécessaire à chaque transition de vague. Il suffirait de garder un seul des deux chemins.
- [ ] Le `useEffect` des raccourcis clavier (`Échap`, `R`) n'a pas de tableau de dépendances :
  il retire et réinstalle l'écouteur à **chaque** rendu. Ça marche, mais un `useRef` pour
  `restartGame` éviterait le travail inutile.
- [ ] `src/utils/cn.ts` (et les dépendances `clsx`/`tailwind-merge`) ne sont jamais utilisés
  dans le code — reste du template de départ, jamais branché.
- [ ] `playWin()` et `playLose()` dans `audio.ts` ne sont jamais appelés (le jeu n'a pas de
  condition de victoire finale, seulement une progression infinie par vagues) — code mort.
- [ ] Aucun test automatisé sur la logique pure (`placeMines`, `flood`, `checkWin`), qui s'y
  prêterait bien puisqu'elle ne dépend pas de React.
