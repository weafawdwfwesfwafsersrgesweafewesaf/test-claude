# Décorations des mondes (Blender, low poly)

51 décorations low poly, faites pour les 8 mondes du jeu et à l'échelle des vélos (1 unité = 1 stud).

| Monde | Décorations |
|---|---|
| **Lava** | LavaRocks, LavaPool, ObsidianCrystals, CharredTree, MiniVolcano, LavaBrazier |
| **Ice** | IceCrystals, SnowyPine, Snowman, SnowRocks, IceArch *(on passe dessous)*, Igloo, FrozenLamp |
| **Candy** | Lollipop, CandyCane, GumdropTree, Cupcake, GiantDonut, WrappedCandy, IceCreamCone |
| **Robot** | GearStack, AntennaTower, TechCrate, CopperPipes, BrokenRobotHead, GiantBattery, RoboLamp |
| **Dragon** | DragonEgg, GoldPile, TreasureChest, DragonPillar, DragonLantern, ClawOrb |
| **Skeleton** | BigSkull, BonePile, Tombstone, BoneFence, SkullCandles, RibcageArch *(on passe dessous)* |
| **Retro** | ArcadeCabinet, NeonPalm, Boombox, RetroTV, GiantCassette, SynthwaveSign |
| **Ghost** | FriendlyGhost, HauntedTree, BrokenFence, JackOLantern, WitchCauldron, GhostLamp |

Les photos de chaque monde sont dans `Photos/`.

## Optimisation

- **Entre 120 et 2 500 triangles par modèle**, la plupart sous 1 000.
- **Une seule petite texture de palette par monde** (128×128), déjà intégrée dans chaque `.fbx`.
- **Les parties lumineuses** (lave, néons, flammes, yeux…) sont un mesh séparé nommé `<Nom>_Glow`, pour pouvoir les passer en **Neon**.

## Importer dans Roblox Studio

1. Fais **File → Import 3D** et choisis un ou plusieurs `.fbx` d'un dossier de `FBX/`.
2. Dans la fenêtre d'import, règle **File Dimensions** sur **Studs**.
3. Pour faire briller toutes les parties lumineuses d'un coup, colle ceci dans la **Command Bar** (View → Command Bar) :

```lua
for _, p in workspace:GetDescendants() do
	if p:IsA("MeshPart") and p.Name:match("_Glow$") then
		p.Material = Enum.Material.Neon
	end
end
```

## Modifier ou régénérer

Les modèles sont créés par code dans `Blender/world_<monde>.py`. Pour tout régénérer :

```bash
blender -b --python Decorations/Blender/build.py -- lava photo fbx   # ice, candy, robot, dragon, skeleton, retro, ghost
```
