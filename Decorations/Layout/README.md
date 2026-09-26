# Décors des 12 niveaux (posés en vrai dans le jeu)

Les décors sont écrits directement dans le fichier du jeu, dans `Workspace > DecorMondes > LevelN` :
des Models normaux, avec leur pivot à la base, qu'on peut déplacer, copier ou supprimer dans Studio.
Aucun script ne les pose.

## Principes

- **Tout en studs** : chaque part est en `Plastic` avec le MaterialVariant `Studs_2`, celui que le plugin
  Resurface a créé dans `MaterialService` et qu'utilise déjà la map. Seul ce qui brille reste en néon.
- **Rien sur le parcours** (ni au-dessus, ni en dessous : toute la hauteur est vérifiée), **rien sur les
  bords du canyon** (|x| ≤ 166), pas de décors qui se chevauchent. Le mouvement est compris dans ces
  vérifications (rotation `DecorTurn`, flottement `DecorBob`).
- **Pas de z-fighting** : les pièces qui se chevauchent n'ont jamais de faces au même niveau.
- **Mise en scène** : un grand repère au fond de chaque niveau, quelques pièces maîtresses sur les côtés,
  et des éléments qui flottent ou bougent.

## Fichiers

| Fichier | Rôle |
|---|---|
| `kit.py` | Boîte à outils : pièces (bloc, coin, cylindre, boule…), formes composées (chanfrein en marches, prisme octogonal, sphère en tranches, anneau, engrenage, cristal, rocher, cratère), texte pixel |
| `models.py` | Les modèles, construits en parts à l'origine (base à y = 0, face avant vers +Z) |
| `setpieces.py` | La mise en scène : où poser chaque modèle dans chaque niveau |
| `tools/rbxl/render_models.py` | Atelier : rend chaque modèle seul, de près, avec le relief des studs |

| Niveau | Thème | Décors |
|---|---|---|
| 1 | Clavier | Écran géant (fenêtre « GO! », barre des tâches, curseur, webcam), souris gamer RGB, câbles USB, touches rétroéclairées W A S D Q E R F et barre espace qui flottent |
| 2 | Papier bulle | Carton « FRAGILE » ouvert qui déborde de papier bulle, piles de colis étiquetés, rouleaux de papier bulle, grosses bulles |
| 3 | Chocolat | Fontaine de chocolat à trois vasques, tablettes à moitié déballées, cupcakes, guimauves |
| 4 | Écraseurs | Sur le parcours : vraies presses (mâchoires d'acier rayées jaune/noir, vérins, carters, portique « DANGER », gyrophare, lignes rouges au sol) qui se referment complètement et tuent (`niveau4.py`). Autour : presse hydraulique « DANGER » qui cogne, cheminées en briques qui fument, pylônes à engrenages qui tournent |
| 5 | Pop it | Pop-it géant en cœur, pop-its (carré, rond, étoile), hand spinners qui tournent |
| 6 | Mer de squishies | Baleine qui souffle, pieuvre, méduses, canards en plastique |
| 7 | Lave rose | Volcan en terrasses et coulées, œuf du dragon sur son piton, geysers, aiguilles d'obsidienne, rochers flottants à cristaux |
| 8 | Beurre | Grille-pain (les tartines sautent), piles de pancakes au sirop, beurre qui fond, œufs au plat, tartines volantes |
| 9 | Rivière gelée | Arche de glacier à stalactites, icebergs avec sapins et pingouin, cristaux, bonshommes de neige, aurore boréale |
| 10 | Pont d'os | Crâne de dragon aux yeux verts, squelettes à côtes courbes, lanternes du marais, feux follets |
| 11 | Galaxie | Planète à anneaux, station spatiale (modules, treillis, panneaux solaires, antenne), soucoupe et son rayon, lunes à cratères, comète, astéroïdes à cristaux |
| 12 | Dernier clic | Soleil synthwave, écran « LOADING 99 % », bouton d'arcade « CLICK », curseurs géants, cœurs pixel |

## Bordure de la map (canyon)

`canyon.py` refait le canyon cuit dans le jeu (`Workspace.BikeASMR.Map.Canyon`) dans le même style étagé
(terre en studs, dessus d'herbe, gouttes d'herbe) mais avec un relief irrégulier : tronçons de hauteurs
différentes, retraits en haut de falaise, strates, buttes d'herbe. La face intérieure reste à |x| = 170 et le
premier gradin n'est jamais plus bas qu'avant (toujours hors de portée d'un double saut).
Dans le jeu livré, seul le premier gradin (le plus proche de la map) est gardé (`tools/rbxl/step_canyon.js`).

Attention : reconstruire la map avec `WorldRunner` régénérerait l'ancien canyon régulier (`World.Border`).

## Niveaux 10 à 12 plus durs

`niveaux_10_12.py` refait le parcours des trois derniers niveaux, chacun avec son twist :

- **10 — Pont d'os** : ponts d'os qui s'effondrent sous les roues, crâne qui roule vers toi, vertèbres
  étroites balayées par la queue du dragon, pont des mâchoires qui claquent, dernier pont friable.
- **11 — Galaxie** (gravité basse) : astéroïdes qui dérivent, étoiles qui s'allument en vague, plateaux
  qui tournent, comète en pendule, atterrissage sur la planète.
- **12 — Dernier clic** : les doigts tapent plus vite (8 au lieu de 5), les mâchoires claquent plus vite,
  les deux souris de la fin glissent de gauche à droite.

Attention : reconstruire la map avec `WorldRunner` régénérerait l'ancien parcours et l'ancien canyon.

## Régénérer

```bash
node tools/rbxl/geom.js <jeu.rbxl> levels.json Workspace/BikeASMR/Map/Levels   # géométrie réelle
python3 setpieces.py levels.json tree.json                                       # décors -> arbre d'instances
node tools/rbxl/geom.js <jeu.rbxl> canyon_actuel.json Workspace/BikeASMR/Map/Canyon    # canyon actuel
python3 canyon.py canyon_actuel.json canyon_neuf.json                             # nouveau canyon
node tools/rbxl/bake.js <récent> <original> <rééquilibré> tree.json <sortie.rbxl> canyon_neuf.json
```

Pour voir un modèle : `python3 models.py galerie.json NomDuModele` puis
`blender -b --python tools/rbxl/render_models.py -- galerie.json dossier_sortie`.
