# Structure de Mine de Rien

## Arborescence

```
mine-de-rien-game-development/
├── index.html              # template Vite + bloc SEO (lang=fr)
├── package.json            # mine-de-rien v1.0.0
├── vite.config.ts          # base '/minederien/', react + tailwind + singlefile
├── tsconfig.json
├── .gitignore               # deps, secrets, fichiers d'agents IA
├── about.md / README.md / structure.md / features.md / todo.md / changelog.md
├── og-image.png / favicon.png
├── public/
│   ├── favicon.png
│   ├── og-image.png / og-image.webp
│   └── icon.webp            # carte du menu, 128x128
└── src/
    ├── main.tsx
    ├── App.tsx               # tout le jeu (pas de module logique separe)
    ├── audio.ts              # synthese Web Audio
    ├── index.css             # @import tailwindcss + keyframes
    └── utils/cn.ts           # non utilise
```

## Organisation de `App.tsx`

Contrairement a certains autres jeux du hub, la logique du plateau et l'UI vivent dans le
**meme fichier** (pas de `engine.ts` separe). Les fonctions pures sont regroupees en haut du
fichier, avant le composant :

| Fonction | Role |
|----------|------|
| `waveCfg(w)` | Dimensions et nombre de mines pour la vague `w` |
| `starRating(time, wave)` | 1 a 3 etoiles selon le temps par rapport au par |
| `emptyBoard(r, c)` | Plateau vide |
| `placeMines(b, r, c, m, sr, sc)` | Place les mines (zone 3x3 du premier clic exclue), calcule les chiffres, disperse les bonus |
| `flood(b, R, C, r, c)` | Revelation en cascade des cellules a 0 mine adjacente |
| `revealAll(b)` | Utilise au game over |
| `checkWin(b, mines)` | Vrai si toutes les cellules sures sont revelees |

## Etat du composant `App`

Beaucoup d'etat React (contrairement au pattern "refs + un seul forceRender" d'autres jeux du
hub) : `board`, `phase`, `wave`, `score`, `combo`, `inventory` (pouvoirs en reserve),
`activeMode` (pouvoir en cours de ciblage), plus les etats d'UI (modales, particules).

Points d'attention pour качестве futur :
- **`frozenRef`** (ajoute lors de l'audit) : le chronometre lit cette ref, pas l'etat `frozen`
  directement, parce que le callback du `setInterval` du chrono est cree une seule fois (au
  premier clic) et fige sa fermeture — lire l'etat React directement y aurait toujours donne
  la valeur du moment de la creation.
- **`collectBonuses(oldBoard, newBoard)`** (ajoute lors de l'audit) : point d'entree unique
  pour ramasser les bonus, appele apres CHAQUE operation qui revele des cellules (clic simple,
  flood-fill, chord-click, Scanner). Compare les deux plateaux et traite toute cellule qui
  vient de passer a revelee, pas seulement celle explicitement cliquee.
- Les callbacks de pouvoirs (`useHint`, `useRadar`, `useScanner`, `useDefuser`) sont definis
  avant `collectBonuses` dans le fichier mais l'utilisent : `collectBonuses` doit rester
  declaree avant ces callbacks (erreur de compilation sinon, `used before declaration`).

## Rendu

Chaque cellule est un `<button>` (`CellBtn`), pas de `<div>` : accessible au clavier par
defaut, `onContextMenu` pour le clic droit (drapeau). Les animations (`cellReveal`,
`cellFlag`, `mineExplode`, `sparkle`, `floatUp`...) sont des `@keyframes` CSS dans
`index.css`, appliquees via des classes utilitaires (`anim-cell-reveal`, etc.)

La taille des cellules (`cellSz`) est recalculee au resize en fonction de la largeur et de la
hauteur disponibles, plafonnee entre 18 et 44px.

## Build

`vite-plugin-singlefile` inline le JS et le CSS dans `index.html`. Le `dist/` contient donc
`index.html` (~277 Ko) plus `favicon.png`, `og-image.png/webp` et `icon.webp` copies depuis
`public/`. `base: '/minederien/'` fait resoudre ces assets sous
`https://games.hylst.fr/minederien/`.
