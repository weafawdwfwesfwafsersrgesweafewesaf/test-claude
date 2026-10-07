# OpenWall — fonds d'écran animés, gratuit et open source

OpenWall est une alternative gratuite à Wallpaper Engine : mettez **vos vidéos MP4**, des images, des GIF, des pages web ou des scènes animées interactives en fond d'écran, **derrière les icônes du bureau**.

> Projet indépendant, sans lien avec Wallpaper Engine ni Steam. L'interface reprend la même organisation (onglets, filtres, grille, panneau de propriétés, OK / Annuler, playlist), mais le code, les icônes et les sons sont originaux : les sons de l'interface sont générés en temps réel, rien n'est copié de l'application d'origine.

## Fonctionnalités

| Wallpaper Engine | OpenWall |
|---|---|
| Fonds vidéo (MP4, WebM…) | ✅ MP4, WebM, MOV, M4V, MKV, OGV, avec import par bouton ou **glisser-déposer** |
| Fonds image / GIF | ✅ JPG, PNG, GIF animé, WebP, AVIF, BMP, avec zoom lent (Ken Burns) et parallaxe à la souris |
| Fonds web | ✅ N'importe quelle URL, ou vos fichiers HTML/JS/CSS locaux, avec zoom et actualisation automatique |
| Fonds « Scène » interactifs | ✅ 12 scènes disponibles via **Créer → Scène personnalisée** (non installées par défaut) : Constellation, Hyperespace, Pluie numérique, Visualiseur audio, Aurore boréale, Pluie et orage, Neige, Lucioles, Bokeh, Dégradé fluide, Plasma (shader), Nébuleuse (shader) |
| Propriétés personnalisables | ✅ Couleurs, vitesses, quantités, interaction souris, réaction au son… Le résultat s'affiche en direct sur le bureau et dans l'aperçu |
| Fonds réactifs au son | ✅ Capture du son du système (Windows) pour les visualiseurs et les scènes |
| Ajustements d'image | ✅ Luminosité, contraste, saturation, teinte, flou, vignettage, miroir |
| Superpositions | ✅ Horloge et visualiseur audio par-dessus **n'importe quel** fond (y compris vos vidéos) |
| Playlist | ✅ Minuteur, au démarrage, selon l'heure de la journée, selon le jour ; ordre normal ou aléatoire ; transitions en fondu ; playlists sauvegardées |
| Multi-écrans | ✅ Un fond par écran, cloner sur tous les écrans, ou étendre sur tous les écrans |
| Règles de performance | ✅ Continuer, couper le son, pause ou arrêt quand une autre application est au premier plan, maximisée ou en plein écran (jeux, films), sur batterie, ou quand la session est verrouillée |
| Qualité / FPS | ✅ Limite d'images par seconde (10 à 240), qualité de rendu, préréglages Économie / Équilibré / Qualité / Ultra |
| Bibliothèque | ✅ Recherche, tri, filtres (type, résolution, favoris, étiquettes), favoris, étiquettes, renommage, aperçu vidéo au survol |
| Téléchargement depuis un site | ✅ **Créer → Depuis un site** : collez l'adresse d'une page (ex. une page « tag » d'un site de fonds animés), OpenWall trouve toutes les vidéos, vous cochez celles que vous voulez, il les télécharge en HD (ou 4K / 720p) sur votre PC et les ajoute à la bibliothèque avec une étiquette |
| Découvrir / Atelier | ✅ Onglet *Découvrir* : catalogue de fonds anime en ligne (50 par site : MotionBGs, MoeWalls, Wallpaper Waifu, DesktopHut), recherche et filtre par site. Un clic sur **Télécharger** récupère la vidéo en HD et l'applique directement ; rien n'est téléchargé sans clic. Pas de Steam Workshop. |
| Icône de notification | ✅ Pause, couper le son, fond suivant, paramètres, quitter |
| Démarrage avec Windows | ✅ Option, avec démarrage réduit |
| Interface | ✅ Thème sombre ou clair, couleur d'accent, taille des vignettes, sons de l'interface (clics, curseurs dont la hauteur du son suit la valeur, transitions) |

## Installation (Windows)

### Option 1 — téléchargement direct
- Installateur : https://github.com/weafawdwfwesfwafsersrgesweafewesaf/test-claude/releases/latest/download/OpenWall-Setup.exe
- Version portable (sans installation) : https://github.com/weafawdwfwesfwafsersrgesweafewesaf/test-claude/releases/latest/download/OpenWall-Portable.exe

### Option 1 bis — depuis l'onglet Actions
1. Sur GitHub, ouvrez l'onglet **Actions** du dépôt, puis le workflow **Build OpenWall**.
2. Ouvrez la dernière exécution réussie et téléchargez l'artefact **OpenWall-Windows**.
3. Dézippez-le : `OpenWall-Portable.exe` se lance directement, `OpenWall-Setup.exe` installe l'application.

> Windows SmartScreen peut afficher un avertissement parce que l'application n'est pas signée : cliquez sur « Informations complémentaires » puis « Exécuter quand même ».

### Option 2 — depuis le code source
Il faut [Node.js](https://nodejs.org) 20 ou plus récent.

```bash
cd openwall
npm install
npm start            # lance l'application
npm run dist:win     # génère l'installateur et la version portable dans openwall/dist/
```

Linux (X11) et macOS fonctionnent aussi (`npm run dist:linux` / `npm run dist:mac`). Les règles « premier plan / plein écran » et la capture du son système sont réservées à Windows.

## Mettre vos vidéos MP4 en fond d'écran
- Cliquez sur **Ouvrir un fond d'écran** (en bas de la grille), ou
- glissez-déposez vos fichiers n'importe où dans la fenêtre, ou
- allez dans **Créer → Vidéo**.

Cliquez ensuite sur la vignette : la vidéo est appliquée tout de suite. Dans le panneau de droite, vous pouvez régler le volume (coupé par défaut), la vitesse, l'ajustement (remplir, ajuster, étirer, centrer), les couleurs, ajouter une horloge, etc. **OK** garde vos changements et ferme la fenêtre ; **Annuler** revient à l'état d'avant.

Par défaut, OpenWall utilise vos fichiers là où ils sont. Activez **Paramètres → Général → Copier les fichiers importés** si vous voulez pouvoir déplacer ou supprimer les originaux.

## Optimisations
- La boucle d'animation ne tourne que si le fond en a besoin : une vidéo seule est lue par le décodeur matériel, sans calcul supplémentaire.
- La position de la souris n'est suivie que pour les fonds interactifs.
- Par défaut : scènes limitées à 30 images/s, pause quand une application est maximisée ou en plein écran (le fond est caché de toute façon), pause pendant la mise en veille et quand la session est verrouillée.
- La capture du son système ne s'active que pour les fonds qui réagissent au son.
- La fenêtre de l'interface est entièrement libérée de la mémoire quand on la ferme.

## Raccourcis
`Ctrl+O` importer · `Ctrl+F` rechercher · `F2` renommer · `Suppr` supprimer · `Espace` pause · `Entrée` appliquer · double-clic sur un curseur : valeur par défaut · clic droit sur une vignette : menu complet.

## Comment ça marche
- **Electron** : une fenêtre par écran, affichant le moteur de rendu (`wallpaper/`).
- **Windows** : la fenêtre est placée derrière les icônes du bureau avec la technique WorkerW / Progman (compatible Windows 10 et Windows 11, y compris 24H2). Aucun module natif : de petites fonctions Win32 sont appelées via PowerShell (`lib/desktop-win.js`).
- Un serveur local (`127.0.0.1`, protégé par un jeton aléatoire) fournit les vidéos avec prise en charge du seek (`lib/server.js`).
- Les données (bibliothèque, réglages, miniatures) sont dans `%APPDATA%\OpenWall`.

## Limites connues
- Pas d'accès au Steam Workshop ni aux fonds au format Wallpaper Engine (`.pkg`, scènes de leur éditeur).
- Pas d'éditeur de scènes complet : on crée des préréglages à partir des scènes intégrées, ou ses propres fonds en HTML/JS.
- Certains sites web refusent de s'afficher dans un cadre même après ajustement : utilisez alors un autre lien ou un fichier HTML local.

Licence MIT.
