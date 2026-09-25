# Outils .rbxl (sans Studio)

Lecture et réécriture ciblée du format binaire Roblox, écrites à la main (Node.js, sans dépendance).

- `rbxl.js` : lecteur (chunks zstd/LZ4, INST, PROP, PRNT, SSTR).
- `writer.js` : réécriture ciblée : texte de propriétés, reparentage, ajout de ModuleScripts. Les chunks non touchés sont recopiés octet pour octet (`roundtrip.js` le vérifie).
- `apply.js` : applique au jeu l'équilibrage, la correction des auras et les décorations (`node apply.js <récent> <original> <rééquilibré> <sortie>`, les scripts Luau étant attendus dans `new/`).
- `dump.js`, `inspect.js`, `diffprops.js` : exporter l'arbre et les scripts, afficher des propriétés, comparer deux fichiers.
- `geom.js`, `sim.js`, `render_level.py` : extraire la géométrie réelle des niveaux, simuler la pose des décors et rendre un niveau dans Blender.
