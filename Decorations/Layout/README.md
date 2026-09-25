# Mise en scène des décors (posés en vrai dans le jeu)

Les décors ne sont PAS posés par un script : ils sont écrits directement dans le fichier du jeu, dans
`Workspace > DecorMondes`, comme des pièces normales qu'on peut déplacer, copier ou supprimer dans Studio.

```
DecorMondes
├ Lobby                 3 décors derrière chaque tapis à thème
└ Level1 … Level12
   ├ Scenes             îlots mis en scène (ex. Scene_Campement : Ilot + Igloo + Snowman + sapins…)
   ├ Rebord             groupes posés sur le haut du canyon
   └ Murs               stalactites, cascades de lave, engrenages qui tournent, côtes géantes, bannières…
```

| Niveau | Thème du niveau | Décors |
|---|---|---|
| 1, 12 | Clavier, Dernier clic | Rétro / arcade + bandes néon sur les murs |
| 2, 3, 5 | sol de lave orange | Volcans, obsidienne, forêt calcinée, bassins + cascades de lave |
| 4, 11 | Écraseurs, Galaxie | Dépôts de robots + engrenages géants qui tournent dans les murs |
| 6 | Mer de squishies | Îlots bonbons + glaçage qui coule du rebord |
| 7 | Lave rose | Volcans (lave teintée en rose) + antre du dragon + cascades roses |
| 8 | Beurre | Trésors de dragon + bannières |
| 9 | Rivière gelée | Campements, forêts de sapins, cristaux, arches + stalactites |
| 10 | Pont d'os | Cimetières, coin de sorcière, ossuaire + côtes géantes dans les murs |

Les engrenages tournent et les fantômes flottent grâce aux attributs `DecorTurn` / `DecorBob` que le
`DecorController` du jeu anime déjà : aucun script ajouté.

## Régénérer

1. `node tools/rbxl/geom.js <jeu.rbxl> levels.json Workspace/BikeASMR/Map/Levels` (géométrie réelle des niveaux)
2. `python3 decor_layout.py levels.json DecorLayout.lua layout.json` (mise en scène, places libres vérifiées)
3. `python3 build_tree.py DecorShapes.lua layout.json tree.json` (arbre d'instances)
4. `node tools/rbxl/bake.js <récent> <original> <rééquilibré> tree.json <sortie.rbxl>`
