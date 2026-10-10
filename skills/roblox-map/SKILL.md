---
name: roblox-map
description: À utiliser pour construire ou modifier le monde dans Studio (map, terrain, bâtiments, décors, éclairage, zones de jeu) avec run_luau, create_instance et asset_insert.
---

# Construire la map

## Méthode
1. Regarde l'existant : `get_tree` sur `Workspace` (profondeur 1 à 2), puis `get_instance` sur ce qui t'intéresse.
2. Réserve ta zone : `claim` avec `studio:Workspace/Map/NomDeLaZone`.
3. Construis avec **un seul `run_luau` par élément cohérent** (une zone, un bâtiment) : c'est une seule étape d'annulation dans Studio.
4. Vérifie : `get_tree` sur ce que tu as créé, et `get_console` (erreurs).

## Organisation
- Tout dans `Workspace/Map/<Zone>` (des `Model` ou des `Folder` nommés). Jamais de parts en vrac dans `Workspace`.
- Un `Model` par objet réutilisable, avec `PrimaryPart` et `PivotTo` pour le placer.
- `Anchored = true` pour tout ce qui ne doit pas tomber. `CanCollide = false` pour les décors traversables.
- Nomme les parts utiles au gameplay (`SpawnLocation`, `ShopZone`, `KillBrick`) et ajoute un tag (`CollectionService`) si un script doit les retrouver.

## Exemple run_luau
```lua
local map = workspace:FindFirstChild("Map") or Instance.new("Folder", workspace); map.Name = "Map"
local zone = Instance.new("Model"); zone.Name = "Ile"; zone.Parent = map
local sol = Instance.new("Part")
sol.Name = "Sol"; sol.Size = Vector3.new(200, 4, 200); sol.Position = Vector3.new(0, 0, 0)
sol.Anchored = true; sol.Material = Enum.Material.Grass; sol.Color = Color3.fromRGB(90, 170, 80)
sol.Parent = zone
zone.PrimaryPart = sol
print("Île créée :", zone:GetFullName())
```

## Terrain et ambiance
- Terrain : `workspace.Terrain:FillBlock(cframe, size, Enum.Material.Water)`, `FillBall`, `FillCylinder`.
- Éclairage : `Lighting.ClockTime`, `Lighting.Ambient`, objets `Atmosphere`, `Sky`, `Bloom`, `ColorCorrection` dans `Lighting`.

## Performance
- Évite des milliers de petites parts : fusionne les décors simples, réutilise des modèles.
- Pour les grandes maps : `workspace.StreamingEnabled = true` (préviens l'utilisateur, ça change le comportement côté client).
