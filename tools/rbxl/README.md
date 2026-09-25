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
  (`blender -b --python render_tree.py -- <niveau> <sortie.png> <z> <x> <hauteur> <visée x> <tree.json> [levels.json]`).
