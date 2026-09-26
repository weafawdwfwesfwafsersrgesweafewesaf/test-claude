--!strict
-- AuraConfig (ModuleScript) -> à mettre dans ReplicatedStorage
-- Tous les réglages des auras sont ICI : un changement s'applique à TOUS les vélos.

local AuraConfig = {}

-- 1) IDs des images (Studio -> Asset Manager -> Bulk Import, puis clic droit -> Copy ID)
AuraConfig.Textures = {
	Flame = "rbxassetid://0", -- AuraFlame_8x8.png  (flipbook 8x8)
	Swirl = "rbxassetid://0", -- AuraSwirl_8x8.png  (flipbook 8x8)
	Smoke = "rbxassetid://0", -- AuraSmoke_8x8.png  (flipbook 8x8)
	Streak = "rbxassetid://0", -- AuraStreak.png    (traînées + texture des meshes)
	Spark = "rbxassetid://0", -- AuraSpark.png
	Glow = "rbxassetid://0", -- AuraGlow.png
}

-- 2) Détection des vélos
AuraConfig.BikeTag = "Bike" -- tag CollectionService (le plus fiable)
AuraConfig.BikeNamePatterns = { "bike", "velo", "vélo", "bmx" } -- sinon : modèles dont le nom contient ça
AuraConfig.OnlyWhenRiding = true -- aura visible seulement quand quelqu'un est assis

-- 3) Taille / orientation (communes à tous les vélos)
AuraConfig.AuraScale = 1 -- 1 = réglé pour un vélo réaliste (~5.5 studs de long)
AuraConfig.YawOffsetDegrees = 0 -- mets 90 si l'aura est de travers par rapport au vélo

-- 4) Comportement
AuraConfig.FullSpeed = 60 -- vitesse (studs/s) où l'aura est au maximum
AuraConfig.TrailMinSpeed = 10 -- les traînées apparaissent au-dessus de cette vitesse
AuraConfig.BoostSpeed = 45 -- en passant cette vitesse : explosion d'étincelles
AuraConfig.SpinSpeed = 2.2 -- rotation des spirales (radians/s)
AuraConfig.MaxDistance = 200 -- au-delà, l'aura est coupée (performances)

-- 5) Thèmes : C1 = couleur du coeur (claire), C2 = couleur du bord (saturée)
-- Remplace/ajoute les thèmes de TES vélos ici.
AuraConfig.DefaultTheme = "Feu"
AuraConfig.Themes = {
	Feu = { C1 = Color3.fromRGB(255, 220, 90), C2 = Color3.fromRGB(255, 60, 10) },
	Glace = { C1 = Color3.fromRGB(220, 255, 255), C2 = Color3.fromRGB(20, 120, 255) },
	Galaxie = { C1 = Color3.fromRGB(255, 150, 255), C2 = Color3.fromRGB(95, 20, 255) },
	Toxique = { C1 = Color3.fromRGB(220, 255, 120), C2 = Color3.fromRGB(40, 200, 20) },
	Or = { C1 = Color3.fromRGB(255, 245, 190), C2 = Color3.fromRGB(255, 170, 0) },
	Ombre = { C1 = Color3.fromRGB(200, 120, 255), C2 = Color3.fromRGB(25, 0, 45) },
	Neon = { C1 = Color3.fromRGB(255, 255, 255), C2 = Color3.fromRGB(255, 0, 170) },
}

-- Thème par nom exact de vélo (optionnel). Sinon : attribut "AuraTheme" sur le modèle, sinon DefaultTheme.
AuraConfig.ThemeByBikeName = {
	-- ["BikeRouge"] = "Feu",
}

return AuraConfig
