# Outils .rbxl (sans Studio)

Lecture et réécriture ciblée du format binaire Roblox, écrites à la main (Node.js, sans dépendance).

- `rbxl.js` : lecteur (chunks zstd/LZ4, INST, PROP, PRNT, SSTR).
- `writer.js` : réécriture ciblée et ajout d'instances. Les chunks non touchés sont recopiés octet pour octet (`roundtrip.js` le vérifie).
- `bake.js` : fabrique le fichier livré à partir de la version récente du jeu : équilibrage (configs et panneaux),
  nouvelle aura, et décors `Workspace.DecorMondes` écrits en vraies instances
  (`node bake.js <récent> <original> <rééquilibré> <tree.json> <sortie>`, scripts Luau attendus dans `new/`).
- `dump.js`, `inspect.js`, `diffprops.js` : exporter l'arbre et les scripts, afficher des propriétés, comparer deux fichiers.
- `geom.js` : extraire la géométrie réelle (niveaux ou décors) pour vérifier placement et relecture.
- `render_models.py` : atelier Blender, rend chaque modèle de décor seul avec le relief des studs.
- `render_tree.py` : rend un niveau réel avec ses décors, vu depuis la piste
  (`blender -b --python render_tree.py -- <niveau> <sortie.png> <z> <x> <hauteur> <visée x> <tree.json> [levels.json|-] [canyon.json] [hauteur de visée]`).

## Retouches sur le dernier fichier (ne jamais repartir d'une ancienne version)

Ce que tu supprimes dans Studio ne doit pas revenir : chaque retouche part du **dernier fichier livré** et
n'applique que le changement voulu.

- `editlib.js` : édition ciblée (trouver, lire position/taille/attributs, modifier, supprimer avec les
  descendants, ajouter un arbre de parts, remplacer le code d'un script). Les identifiants sont renumérotés
  à l'enregistrement.
- `validate.js` : contrôle toute la structure (INST, octets des services, identifiants continus, PRNT, PROP)
  avant de livrer : `node validate.js <fichier.rbxl>`.
- `step_canyon.js <entrée> <sortie>` : ne garde que le gradin du canyon le plus proche de la map.
- `step_l4.js <entrée> <sortie> <l4_patch.json> <HazardController.lua>` : presses du niveau 4
  (patch produit par `Decorations/Layout/niveau4.py`).
- `step_levels.js <entrée> <sortie> <patch.json>` : niveaux 10 à 12 (patch produit par
  `Decorations/Layout/niveaux_10_12.py`).
- `step_decor.js <entrée> <sortie> <tree.json>` : remplace un dossier `DecorMondes/LevelN`.

`Scripts/HazardController.lua` est la version du script client livrée dans le jeu : mort au contact des
mâchoires (Slide) et des presses (Stomper), et plus seulement quand le vélo est « dedans ».
