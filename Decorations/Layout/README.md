# Décors des 12 niveaux (posés en vrai dans le jeu)

Les décors sont écrits directement dans le fichier du jeu, dans `Workspace > DecorMondes > LevelN` :
des Models normaux, avec leur pivot à la base, qu'on peut déplacer, copier ou supprimer dans Studio.
Aucun script ne les pose.

Principes :
- **rien sur les bords du canyon**, rien sur le parcours : chaque élément est placé là où aucune pièce
  du niveau ne passe (vérifié sur la vraie géométrie, `levels.json`) ;
- **peu d'éléments, grands, qui racontent le thème du niveau** : un repère au fond, quelques pièces
  maîtresses sur les côtés, et des éléments qui flottent ou bougent ;
- **le style de la map** : grosses masses en studs (`Plastic` + `Studs_2`), néon pour ce qui brille
  (avec une `PointLight`), verre pour les cristaux et les bulles ;
- **le mouvement** passe par les attributs que `DecorController` anime déjà : `DecorBob` (flotte),
  `DecorTurn` (tourne autour d'un centre).

| Niveau | Thème | Décors |
|---|---|---|
| 1 | Clavier | Le bureau géant : écran « GO! », souris, câbles USB, touches W A S D E R F G qui flottent |
| 2 | Papier bulle | Colis en fuite : carton « FRAGILE » qui déborde, cartons engloutis, bulles de verre |
| 3 | Chocolat | La chocolaterie : fontaine de chocolat et fraises, tablettes plantées, chantilly, guimauves |
| 4 | Écraseurs | L'usine : presse géante qui cogne, cheminées qui fument, pylônes à engrenages qui tournent |
| 5 | Pop it | Pop-it géant, pop-its plantés, hand spinners qui tournent |
| 6 | Mer de squishies | Baleine qui souffle, méduses, canards en plastique |
| 7 | Lave rose | Le cœur du volcan : volcan et coulées, œuf du dragon, geysers, obsidienne, rochers flottants |
| 8 | Beurre | Le petit-déjeuner : grille-pain (les tartines sautent), pancakes, beurre fondant, tartines volantes |
| 9 | Rivière gelée | Arche de glacier, icebergs et sapins, cristaux, rideaux d'aurore boréale |
| 10 | Pont d'os | Le dragon endormi : crâne géant aux yeux verts, colonne et côtes, feux follets |
| 11 | Galaxie | Planète à anneaux, station spatiale, soucoupe, lunes, comète, astéroïdes |
| 12 | Dernier clic | Soleil synthwave, écran « 99 % », curseurs géants, cœurs pixel |

## Régénérer

```bash
node tools/rbxl/geom.js <jeu.rbxl> levels.json Workspace/BikeASMR/Map/Levels   # géométrie réelle
python3 setpieces.py levels.json tree.json                                       # décors -> arbre d'instances
node tools/rbxl/bake.js <récent> <original> <rééquilibré> tree.json <sortie.rbxl>
```

`setpieces.py` contient un constructeur par niveau (`build_1` … `build_12`) : c'est là qu'on ajoute ou
modifie un décor.
