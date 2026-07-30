# Changelog de Mine de Rien

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versionnage
[SemVer](https://semver.org/lang/fr/).

## [1.0.0] 2026-07-31

Première version intégrable à Hylst.Games, partie d'un export brut audité puis corrigé.

### Ajouté
- Bloc SEO complet dans `index.html` (description, keywords, og, twitter, robots, canonical,
  theme-color) et `lang="fr"`
- `favicon.png` 32×32, `og-image.png` 1024×576 (vraie capture de gameplay) et sa variante
  `og-image.webp`, `icon.webp` 128×128 pour la carte du menu
- `base: '/minederien/'` dans `vite.config.ts`
- La doc : `about.md`, `README.md`, `structure.md`, `features.md`, `todo.md`, `changelog.md`

### Modifié
- Renommé en **Mine de Rien**. Le nom précédent, « Démineur Évolutif », sonnait généré par
  IA. Titre, en-tête, pied de page, clé `localStorage`.
- `package.json` : `react-vite-tailwind` v0.0.0 devenu `mine-de-rien` v1.0.0

### Corrigé
- Le pouvoir Gel Tempo ne gelait rien : le chronomètre lisait une valeur figée par fermeture
  dans son `setInterval`, créé une seule fois au premier clic. Passage à une ref tenue à jour,
  vérifié en observant le chrono immobile sur 2,6 secondes après activation.
- Les bonus révélés par un flood-fill ou par le Scanner restaient affichés mais devenaient
  impossibles à ramasser (la cellule déjà révélée ne réagit plus au clic). Remplacé par une
  fonction unique qui compare l'ancien et le nouveau plateau et ramasse le bonus de toute
  cellule nouvellement révélée, quelle que soit l'action qui l'a révélée.
