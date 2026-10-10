---
name: roblox-modeles-3d
description: À utiliser pour ajouter des modèles 3D (arbres, bâtiments, objets, PNJ, véhicules) - recherche dans le Creator Store, insertion sûre, mise à l'échelle et placement, ou construction en parts.
---

# Modèles 3D

## Trouver un modèle
1. `asset_search` avec des mots-clés en anglais (« low poly pine tree », « medieval house »).
2. Préfère : créateur **vérifié**, bon pourcentage de votes, `hasScripts: false`, peu de triangles.
3. `asset_insert` avec `parent` (ex. `Workspace/Map/Foret`) et `position`.

## Sécurité (important)
Les modèles gratuits peuvent contenir des **scripts malveillants** (backdoors, `require(id)`, `getfenv`, `loadstring`, TeleportService caché).
Après insertion :
- `search` dans le modèle avec `class: "LuaSourceContainer"` pour lister ses scripts.
- Supprime tout script dont tu n'as pas besoin (`delete_instance`), surtout s'il contient `require(` avec un nombre,
  `getfenv`, `loadstring`, `setfenv`, ou du texte illisible/obfusqué. Signale-le à l'utilisateur.

## Placer et adapter
```lua
local m = workspace.Map.Foret.PineTree
m:PivotTo(CFrame.new(10, 0, 25) * CFrame.Angles(0, math.rad(45), 0))
m:ScaleTo(1.5)          -- mise à l'échelle uniforme d'un Model
for _, p in m:GetDescendants() do if p:IsA("BasePart") then p.Anchored = true end end
```
- Duplique avec `:Clone()` pour en mettre plusieurs (une forêt) plutôt que d'insérer 20 fois.
- Pose les objets sur le sol : `workspace:Raycast` vers le bas pour trouver la hauteur.

## Sans modèle disponible
Construis en parts simples (Part, WedgePart, Cylinder, MeshPart existants) regroupées dans un `Model` nommé, avec
des couleurs et matériaux cohérents (style low poly). RoSwarm ne génère pas de modèles 3D par IA : dis-le à
l'utilisateur si un modèle précis est indispensable.
